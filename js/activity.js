/**
 * ACTIVITY.JS - Activity Details Page Controller
 * Handles fetching, processing, and rendering activity data with comprehensive charts and stats
 * Entry point: Query parameter ?id={activityId}
 */

// =====================================================
// 1. INITIALIZATION & CONFIGURATION
// =====================================================

const CONFIG = {
    USER_MAX_HR: 195,
    WINDOW_SIZES: {
        altitude: 50,
        pace: 200,
        heartrate: 80,
        cadence: 60,
    },
    NUM_SEGMENTS: 40,
};

// DOM References
const DOM = {
    details: document.getElementById('activity-details'),
    info: document.getElementById('activity-info'),
    stats: document.getElementById('activity-stats'),
    advanced: document.getElementById('activity-advanced'),
    map: document.getElementById('activity-map'),
    splitsSection: document.getElementById('splits-section'),
    streamCharts: document.getElementById('stream-charts'),
    runClassifier: document.getElementById('run-classifier-results'),
    hrZonesChart: document.getElementById('hr-zones-chart'),
};

// Parse activity ID from URL
const params = new URLSearchParams(window.location.search);
const activityId = parseInt(params.get('id'), 10);

// Chart instances registry for cleanup
const chartInstances = {};

// Smoothing control
let currentSmoothingLevel = 100;
let lastStreamData = null;
let lastActivityData = null;

// Dynamic chart data storage
let dynamicChartData = {
    distance: [],
    heartrate: [],
    pace: [],
    altitude: [],
    cadence: [],
};

// Chart color mapping
const chartColors = {
    heartrate: { primary: 'rgb(255, 99, 132)', secondary: 'rgba(255, 99, 132, 0.3)' },
    pace: { primary: 'rgb(252, 82, 0)', secondary: 'rgba(252, 82, 0, 0.3)' },
    altitude: { primary: 'rgb(136, 136, 136)', secondary: 'rgba(136, 136, 136, 0.3)' },
    cadence: { primary: 'rgb(0, 116, 217)', secondary: 'rgba(0, 116, 217, 0.3)' },
};

// =====================================================
// 2. UTILITY FUNCTIONS
// =====================================================

/**
 * Formats seconds into HH:MM:SS format
 */
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formats speed (m/s) into pace (min/km)
 */
function formatPace(speedInMps) {
    if (!speedInMps || speedInMps === 0) return '-';
    const paceInSecPerKm = 1000 / speedInMps;
    const min = Math.floor(paceInSecPerKm / 60);
    const sec = Math.round(paceInSecPerKm % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Decodes Strava polyline encoding to lat/lng coordinates
 */
function decodePolyline(str) {
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
}

/**
 * Estimates VO2max from activity data using Karvonen formula
 */
function estimateVO2max(act, userMaxHr = CONFIG.USER_MAX_HR) {
    if (!act.distance || !act.moving_time || !act.average_heartrate) return '-';
    const vel_m_min = (act.distance / act.moving_time) * 60;
    const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
    const percent_max_hr = act.average_heartrate / userMaxHr;
    if (percent_max_hr < 0.5 || percent_max_hr > 1.2) return '-';
    const vo2max = vo2_at_pace / percent_max_hr;
    return vo2max.toFixed(1);
}

/**
 * Applies rolling mean smoothing to array
 */
function rollingMean(arr, windowSize = 25) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
        const window = arr.slice(start, end);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        result.push(mean);
    }
    return result;
}

/**
 * Calculates coefficient of variation (CV) for data series
 */
function calculateVariability(data, applySmoothing = false) {
    let processedData = data;
    if (applySmoothing) {
        processedData = rollingMean(data, 150);
    }

    if (!processedData || processedData.length < 2) return '-';

    const validData = processedData.filter(d => d !== null && isFinite(d) && d > 0);
    if (validData.length < 2) return '-';

    const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
    if (mean === 0) return '-';

    const standardDeviation = Math.sqrt(
        validData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (validData.length - 1)
    );

    const cv = (standardDeviation / mean) * 100;
    return `${cv.toFixed(1)}%`;
}

/**
 * Calculates time spent in each HR zone
 */
function calculateTimeInZones(heartrateStream, timeStream, zones) {
    if (!heartrateStream || !timeStream || !zones || zones.length === 0) {
        return [];
    }

    const timeInZones = Array(zones.length).fill(0);

    for (let i = 1; i < heartrateStream.data.length; i++) {
        const hr = heartrateStream.data[i];
        if (hr === null) continue;
        const deltaTime = timeStream.data[i] - timeStream.data[i - 1];

        let zoneIndex = -1;
        for (let j = 0; j < zones.length; j++) {
            const zone = zones[j];
            const max = zone.max === -1 ? Infinity : zone.max;
            if (hr >= zone.min && hr < max) {
                zoneIndex = j;
                break;
            }
        }
        if (zoneIndex !== -1) {
            timeInZones[zoneIndex] += deltaTime;
        }
    }
    return timeInZones;
}

/**
 * Creates or updates a Chart.js instance with cleanup
 */
function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Canvas element not found: ${canvasId}`);
        return;
    }

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(canvas, config);
}

/**
 * Initializes smoothing slider control
 */
function initSmoothingControl() {
    const slider = document.getElementById('smoothing-slider');
    const valueDisplay = document.getElementById('smoothing-value');
    
    if (!slider || !valueDisplay) return;

    slider.addEventListener('input', (e) => {
        currentSmoothingLevel = parseInt(e.target.value, 10);
        valueDisplay.textContent = currentSmoothingLevel;
        
        // Re-render stream charts with new smoothing level
        if (lastStreamData && lastActivityData) {
            renderStreamCharts(lastStreamData, lastActivityData, currentSmoothingLevel);
        }
    });
}

/**
 * Initializes dynamic custom chart controls
 */
function initDynamicChartControls() {
    const primaryDataSelect = document.getElementById('dynamic-chart-primary-data');
    const secondaryDataSelect = document.getElementById('dynamic-chart-secondary-data');
    const primaryTypeSelect = document.getElementById('dynamic-chart-primary-type');
    const secondaryTypeSelect = document.getElementById('dynamic-chart-secondary-type');
    const backgroundStatSelect = document.getElementById('dynamic-chart-background-stat');
    const primaryShowCheckbox = document.getElementById('dynamic-chart-primary-show');
    const secondaryShowCheckbox = document.getElementById('dynamic-chart-secondary-show');

    if (!primaryDataSelect) return;

    const updateDynamicChart = () => {
        renderDynamicChart(
            primaryDataSelect.value,
            primaryTypeSelect.value,
            primaryShowCheckbox.checked,
            secondaryDataSelect.value,
            secondaryTypeSelect.value,
            secondaryShowCheckbox.checked,
            backgroundStatSelect.value
        );
    };

    primaryDataSelect.addEventListener('change', updateDynamicChart);
    secondaryDataSelect.addEventListener('change', updateDynamicChart);
    primaryTypeSelect.addEventListener('change', updateDynamicChart);
    secondaryTypeSelect.addEventListener('change', updateDynamicChart);
    backgroundStatSelect.addEventListener('change', updateDynamicChart);
    primaryShowCheckbox.addEventListener('change', updateDynamicChart);
    secondaryShowCheckbox.addEventListener('change', updateDynamicChart);

    // Initial render if primary data is pre-selected
    if (primaryDataSelect.value) {
        updateDynamicChart();
    }
}

/**
 * Renders dynamic custom chart based on user selections
 */
function renderDynamicChart(primaryData, primaryType, primaryShow, secondaryData, secondaryType, secondaryShow, backgroundStat) {
    const canvas = document.getElementById('dynamic-custom-chart');
    if (!canvas || !primaryData || !primaryShow) {
        if (chartInstances['dynamic-custom-chart']) {
            chartInstances['dynamic-custom-chart'].destroy();
            delete chartInstances['dynamic-custom-chart'];
        }
        return;
    }

    const labels = dynamicChartData.distance.map(d => (d / 1000).toFixed(2));
    const datasets = [];
    let yAxisConfigs = {};

    // Primary dataset
    if (primaryShow && primaryData) {
        const primaryColor = chartColors[primaryData];
        datasets.push({
            label: getDataLabel(primaryData),
            data: dynamicChartData[primaryData],
            borderColor: primaryColor.primary,
            backgroundColor: primaryColor.secondary,
            borderWidth: 2,
            fill: primaryType === 'area',
            pointRadius: primaryType === 'scatter' ? 3 : 0,
            type: primaryType === 'scatter' ? 'scatter' : undefined,
            yAxisID: 'y',
            tension: primaryType === 'line' || primaryType === 'area' ? 0.3 : 0,
        });
        yAxisConfigs.y = {
            type: 'linear',
            position: 'left',
            title: { display: true, text: getDataLabel(primaryData) },
            reverse: primaryData === 'pace',
        };
    }

    // Secondary dataset
    if (secondaryShow && secondaryData && secondaryData !== primaryData) {
        const secondaryColor = chartColors[secondaryData];
        datasets.push({
            label: getDataLabel(secondaryData),
            data: dynamicChartData[secondaryData],
            borderColor: secondaryColor.primary,
            backgroundColor: secondaryColor.secondary,
            borderWidth: 2,
            fill: secondaryType === 'area',
            pointRadius: secondaryType === 'scatter' ? 3 : 0,
            type: secondaryType === 'scatter' ? 'scatter' : undefined,
            yAxisID: 'y1',
            tension: secondaryType === 'line' || secondaryType === 'area' ? 0.3 : 0,
        });
        yAxisConfigs.y1 = {
            type: 'linear',
            position: 'right',
            title: { display: true, text: getDataLabel(secondaryData) },
            reverse: secondaryData === 'pace',
            grid: { drawOnChartArea: false },
        };
    }

    // Create background plugin if selected
    const backgroundPlugin = backgroundStat ? createBackgroundPlugin(backgroundStat) : null;

    const config = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Distance (km)' },
                    type: 'category',
                },
                ...yAxisConfigs,
            }
        },
        plugins: backgroundPlugin ? [backgroundPlugin] : [],
    };

    createChart('dynamic-custom-chart', config);
}

/**
 * Gets human-readable label for data type
 */
function getDataLabel(dataType) {
    const labels = {
        heartrate: 'Heart Rate (bpm)',
        pace: 'Pace (min/km)',
        altitude: 'Altitude (m)',
        cadence: 'Cadence (spm)',
    };
    return labels[dataType] || dataType;
}

/**
 * Creates a background plugin for effort/intensity visualization
 */
function createBackgroundPlugin(backgroundStat) {
    return {
        id: 'backgroundPlugin',
        afterDatasetsDraw(chart) {
            if (backgroundStat === 'effort') {
                drawEffortBackground(chart);
            } else if (backgroundStat === 'recovery') {
                drawRecoveryBackground(chart);
            } else if (backgroundStat === 'intensity') {
                drawIntensityBackground(chart);
            }
        }
    };
}

/**
 * Draws effort level background
 */
function drawEffortBackground(chart) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    
    if (!xScale || !yScale) return;

    const chartArea = chart.chartArea;
    const totalPoints = chart.data.labels.length;

    // Create effort zones: low (start), medium (middle), high (end)
    const sections = [
        { start: 0, end: totalPoints * 0.3, color: 'rgba(76, 175, 80, 0.1)' },
        { start: totalPoints * 0.3, end: totalPoints * 0.7, color: 'rgba(255, 193, 7, 0.1)' },
        { start: totalPoints * 0.7, end: totalPoints, color: 'rgba(244, 67, 54, 0.1)' },
    ];

    sections.forEach(section => {
        const startPx = chartArea.left + (section.start / totalPoints) * chartArea.width;
        const endPx = chartArea.left + (section.end / totalPoints) * chartArea.width;
        ctx.fillStyle = section.color;
        ctx.fillRect(startPx, chartArea.top, endPx - startPx, chartArea.height);
    });
}

/**
 * Draws recovery zone background
 */
function drawRecoveryBackground(chart) {
    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const totalPoints = chart.data.labels.length;

    // Recovery zones: alternating easy/moderate
    for (let i = 0; i < totalPoints; i += 2) {
        const startPx = chartArea.left + (i / totalPoints) * chartArea.width;
        const endPx = chartArea.left + (Math.min(i + 1, totalPoints) / totalPoints) * chartArea.width;
        ctx.fillStyle = i % 4 === 0 ? 'rgba(156, 39, 176, 0.08)' : 'rgba(100, 100, 100, 0.08)';
        ctx.fillRect(startPx, chartArea.top, endPx - startPx, chartArea.height);
    }
}

/**
 * Draws intensity pattern background
 */
function drawIntensityBackground(chart) {
    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const totalPoints = chart.data.labels.length;

    // Intensity zones: low, moderate, high repeating
    const zones = ['rgba(0, 200, 100, 0.08)', 'rgba(255, 165, 0, 0.08)', 'rgba(255, 50, 50, 0.08)'];

    for (let i = 0; i < totalPoints; i++) {
        const zoneIndex = Math.floor((i / totalPoints) * 3);
        const startPx = chartArea.left + (i / totalPoints) * chartArea.width;
        const endPx = chartArea.left + ((i + 1) / totalPoints) * chartArea.width;
        ctx.fillStyle = zones[zoneIndex];
        ctx.fillRect(startPx, chartArea.top, endPx - startPx, chartArea.height);
    }
}

/**
 * Populates dynamic chart data from stream data
 */
function populateDynamicChartData(streams) {
    dynamicChartData = {
        distance: streams.distance?.data || [],
        heartrate: streams.heartrate?.data || [],
        altitude: streams.altitude?.data || [],
        cadence: streams.cadence?.data || [],
        pace: [],
    };

    // Calculate pace from distance and time
    if (streams.distance?.data && streams.time?.data) {
        const pace = [];
        for (let i = 1; i < streams.distance.data.length; i++) {
            const deltaDist = streams.distance.data[i] - streams.distance.data[i - 1];
            const deltaTime = streams.time.data[i] - streams.time.data[i - 1];
            if (deltaDist > 0 && deltaTime > 0) {
                const speed = deltaDist / deltaTime;
                pace.push(1000 / speed / 60);
            } else {
                pace.push(null);
            }
        }
        // Prepend null to match distance array length
        dynamicChartData.pace = [null, ...pace];
    }

    // Apply cadence doubling for runs
    if (lastActivityData && lastActivityData.type === 'Run') {
        dynamicChartData.cadence = dynamicChartData.cadence.map(c => c ? c * 2 : null);
    }
}

// =====================================================
// 3. API FUNCTIONS
// =====================================================

/**
 * Retrieves and decodes auth token from localStorage
 */
function getAuthPayload() {
    const tokenString = localStorage.getItem('strava_tokens');
    if (!tokenString) return null;
    return btoa(tokenString);
}

/**
 * Fetches data from backend API
 */
async function fetchFromApi(url, authPayload) {
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${authPayload}` }
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    const result = await response.json();
    if (result.tokens) {
        localStorage.setItem('strava_tokens', JSON.stringify(result.tokens));
    }
    return result;
}

/**
 * Fetches detailed activity information
 */
async function fetchActivityDetails(activityId, authPayload) {
    const result = await fetchFromApi(`/api/strava-activity?id=${activityId}`, authPayload);
    return result.activity;
}

/**
 * Fetches activity stream data (distance, time, HR, altitude, cadence)
 */
async function fetchActivityStreams(activityId, authPayload) {
    const streamTypes = 'distance,time,heartrate,altitude,cadence';
    const result = await fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, authPayload);
    return result.streams;
}

// =====================================================
// 4. RENDERING FUNCTIONS - ACTIVITY INFO
// =====================================================

/**
 * Renders basic activity information (title, date, type, gear, etc.)
 */
function renderActivityInfo(activity) {
    if (!DOM.info) return;

    const name = activity.name;
    const description = activity.description || '';
    const date = new Date(activity.start_date_local).toLocaleString();
    const typeLabels = ['Workout', 'Race', 'Long Run', 'Workout'];
    const activityType = activity.workout_type !== undefined 
        ? typeLabels[activity.workout_type] || 'Other' 
        : (activity.type || 'Other');
    const gear = activity.gear?.name || 'N/A';
    const kudos = activity.kudos_count || 0;
    const commentCount = activity.comment_count || 0;
    let tempStr = 'Not available';
    if (activity.average_temp !== undefined && activity.average_temp !== null) {
        tempStr = `${activity.average_temp}°C`;
    }

    DOM.info.innerHTML = `
        <h3>Info</h3>
        <ul>
            <li><b>Title:</b> ${name}</li>
            ${description ? `<li><b>Description:</b> ${description}</li>` : ''}
            <li><b>Date:</b> ${date}</li>
            <li><b>Type:</b> ${activityType}</li>
            <li><b>Gear:</b> ${gear}</li>
            <li><b>Temperature:</b> ${tempStr}</li>
            <li><b>Comments:</b> ${commentCount}</li>
            <li><b>Kudos:</b> ${kudos}</li>
        </ul>
    `;
}

/**
 * Renders core statistics (distance, pace, elevation, HR)
 */
function renderActivityStats(activity) {
    if (!DOM.stats) return;

    const distanceKm = (activity.distance / 1000).toFixed(2);
    const duration = formatTime(activity.moving_time);
    const pace = formatPace(activity.average_speed);
    const elevation = activity.total_elevation_gain !== undefined ? activity.total_elevation_gain : '-';
    const elevationPerKm = activity.distance > 0 
        ? (activity.total_elevation_gain / (activity.distance / 1000)).toFixed(2) 
        : '-';
    const calories = activity.calories !== undefined ? activity.calories : '-';
    const hrAvg = activity.average_heartrate ? Math.round(activity.average_heartrate) : '-';
    const hrMax = activity.max_heartrate ? Math.round(activity.max_heartrate) : '-';

    DOM.stats.innerHTML = `
        <h3>Stats</h3>
        <ul>
            <li><b>Duration:</b> ${duration}</li>
            <li><b>Distance:</b> ${distanceKm} km</li>
            <li><b>Pace:</b> ${pace}</li>
            <li><b>Elevation Gain:</b> ${elevation} m</li>
            <li><b>Elevation per Km:</b> ${elevationPerKm} m</li>
            <li><b>Calories:</b> ${calories}</li>
            <li><b>HR Avg:</b> ${hrAvg} bpm</li>
            <li><b>HR Max:</b> ${hrMax} bpm</li>
        </ul>
    `;
}

/**
 * Renders advanced statistics (VO2max, variability, achievements)
 */
function renderAdvancedStats(activity) {
    if (!DOM.advanced) return;

    const elevationPerKm = activity.distance > 0 
        ? (activity.total_elevation_gain / (activity.distance / 1000)).toFixed(2) 
        : '-';
    const moveRatio = activity.elapsed_time 
        ? (activity.moving_time / activity.elapsed_time).toFixed(2) 
        : '-';
    const effort = activity.suffer_score !== undefined 
        ? activity.suffer_score 
        : (activity.perceived_exertion !== undefined ? activity.perceived_exertion : '-');
    const vo2max = estimateVO2max(activity);
    const paceVariabilityLaps = activity.pace_variability_laps || '-';
    const paceVariabilityStream = activity.pace_variability_stream || '-';
    const hrVariabilityLaps = activity.hr_variability_laps || '-';
    const hrVariabilityStream = activity.hr_variability_stream || '-';
    const prCount = activity.pr_count !== undefined ? activity.pr_count : '-';
    const athleteCount = activity.athlete_count !== undefined ? activity.athlete_count : '-';
    const achievementCount = activity.achievement_count !== undefined ? activity.achievement_count : '-';

    DOM.advanced.innerHTML = `
        <h3>Advanced Stats</h3>
        <ul>
            <li><b>Elevation per Km:</b> ${elevationPerKm} m</li>
            <li><b>Move Ratio:</b> ${moveRatio}</li>
            <li><b>Effort:</b> ${effort}</li>
            <li><b>VO₂max (est):</b> ${vo2max}</li>
            <li><b>Pace CV (Laps):</b> ${paceVariabilityLaps}</li>
            <li><b>Pace CV (Stream):</b> ${paceVariabilityStream}</li>
            <li><b>HR CV (Laps):</b> ${hrVariabilityLaps}</li>
            <li><b>HR CV (Stream):</b> ${hrVariabilityStream}</li>
            <li><b>PRs:</b> ${prCount}</li>
            <li><b>Athlete Count:</b> ${athleteCount}</li>
            <li><b>Achievements:</b> ${achievementCount}</li>
        </ul>
    `;
}

// =====================================================
// 5. RENDERING FUNCTIONS - MAPS & ROUTES
// =====================================================

/**
 * Renders interactive map with route polyline
 */
function renderActivityMap(activity) {
    if (!DOM.map) return;

    if (activity.map?.summary_polyline && window.L) {
        const coords = decodePolyline(activity.map.summary_polyline);
        if (coords.length > 0) {
            DOM.map.innerHTML = '';
            const map = L.map('activity-map').setView(coords[0], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
        } else {
            DOM.map.innerHTML = '<p>No route data available (empty polyline).</p>';
        }
    } else {
        DOM.map.innerHTML = '<p>No route data available or Leaflet not loaded.</p>';
    }
}

/**
 * Renders splits charts (pace and HR by kilometer)
 */
function renderSplitsCharts(activity) {
    if (!DOM.splitsSection) return;

    if (activity.splits_metric && activity.splits_metric.length > 0) {
        DOM.splitsSection.classList.remove('hidden');
        const kmLabels = activity.splits_metric.map((_, i) => `Km ${i + 1}`);
        const paceData = activity.splits_metric.map(s => s.average_speed ? 1000 / s.average_speed : null);
        const hrData = activity.splits_metric.map(s => s.average_heartrate || null);

        createChart('chart-pace', {
            type: 'line',
            data: {
                labels: kmLabels,
                datasets: [{
                    label: 'Pace (s/km)',
                    data: paceData,
                    borderColor: '#FC5200',
                    backgroundColor: 'rgba(252, 82, 0, 0.07)',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } }
                }
            }
        });

        createChart('chart-heartrate', {
            type: 'line',
            data: {
                labels: kmLabels,
                datasets: [{
                    label: 'HR Avg (bpm)',
                    data: hrData,
                    borderColor: 'red',
                    backgroundColor: 'rgba(255, 0, 0, 0.07)',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { title: { display: true, text: 'Heart Rate (bpm)' } }
                }
            }
        });
    } else {
        DOM.splitsSection.classList.add('hidden');
    }
}

// =====================================================
// 6. RENDERING FUNCTIONS - STREAM CHARTS
// =====================================================

/**
 * Renders detailed stream charts (altitude, pace, HR, cadence vs distance)
 */
function renderStreamCharts(streams, activity, smoothingLevel = 100) {
    if (!DOM.streamCharts) return;

    if (!streams || !streams.distance || !streams.distance.data || streams.distance.data.length === 0) {
        DOM.streamCharts.innerHTML = '<p>No detailed stream data available for this activity.</p>';
        return;
    }

    const { distance, time, heartrate, altitude, cadence } = streams;
    const distLabels = distance.data.map(d => (d / 1000).toFixed(2));

    // Calculate window sizes based on smoothing level (0-200 scale, 100 is default)
    const smoothingFactor = smoothingLevel / 100;
    const windowSizes = {
        altitude: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.altitude * smoothingFactor)),
        pace: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.pace * smoothingFactor)),
        heartrate: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.heartrate * smoothingFactor)),
        cadence: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.cadence * smoothingFactor)),
    };

    // Helper function to create individual stream charts
    function createStreamChart(canvasId, label, data, color, yAxisReverse = false) {
        createChart(canvasId, {
            type: 'line',
            data: {
                labels: distLabels,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: color,
                    backgroundColor: 'rgba(252, 82, 0, 0.07)',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: 'Distance (km)' } },
                    y: { reverse: yAxisReverse, title: { display: true, text: label } }
                }
            }
        });
    }

    // Altitude chart
    if (altitude && altitude.data) {
        const smoothAltitude = rollingMean(altitude.data, windowSizes.altitude);
        createStreamChart('chart-altitude', 'Altitud (m)', smoothAltitude, '#888');
    }

    // Pace chart
    if (time && time.data) {
        const paceStreamData = [];
        for (let i = 1; i < distance.data.length; i++) {
            const deltaDist = distance.data[i] - distance.data[i - 1];
            const deltaTime = time.data[i] - time.data[i - 1];
            if (deltaDist > 0 && deltaTime > 0) {
                const speed = deltaDist / deltaTime;
                paceStreamData.push(1000 / speed / 60);
            } else {
                paceStreamData.push(null);
            }
        }
        const smoothPaceStreamData = rollingMean(paceStreamData, windowSizes.pace);
        const paceLabels = distLabels.slice(1);

        createChart('chart-pace-distance', {
            type: 'line',
            data: {
                labels: paceLabels,
                datasets: [{
                    label: 'Ritmo (min/km)',
                    data: smoothPaceStreamData,
                    borderColor: '#FC5200',
                    backgroundColor: 'rgba(252, 82, 0, 0.07)',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: 'Distance (km)' } },
                    y: { reverse: true, title: { display: true, text: 'Ritmo (min/km)' } }
                }
            }
        });
    }

    // Heart rate chart
    if (heartrate && heartrate.data) {
        const smoothHeartrate = rollingMean(heartrate.data, windowSizes.heartrate);
        createStreamChart('chart-heart-distance', 'FC (bpm)', smoothHeartrate, 'red');
    }

    // Cadence chart
    if (cadence && cadence.data) {
        const cadenceData = activity.type === 'Run' ? cadence.data.map(c => c * 2) : cadence.data;
        const smoothCadence = rollingMean(cadenceData, windowSizes.cadence);
        createStreamChart('chart-cadence-distance', 'Cadencia (spm)', smoothCadence, '#0074D9');
    }
}

// =====================================================
// 7. RENDERING FUNCTIONS - TABLES
// =====================================================

/**
 * Renders best efforts table
 */
function renderBestEfforts(bestEfforts) {
    const section = document.getElementById('best-efforts-section');
    const table = document.getElementById('best-efforts-table');
    if (!section || !table) return;

    if (!bestEfforts || bestEfforts.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const tableHeader = `
    <thead>
        <tr>
            <th>Distance</th>
            <th>Time</th>
            <th>Pace</th>
            <th>Achievements</th>
        </tr>
    </thead>`;

    const tableBody = bestEfforts.map(effort => {
        const pace = formatPace(effort.distance / effort.moving_time);
        const achievements = effort.pr_rank ? `🏆 PR #${effort.pr_rank}` : (effort.achievements.length > 0 ? '🏅' : '');
        return `
        <tr>
            <td>${effort.name}</td>
            <td>${formatTime(effort.moving_time)}</td>
            <td>${pace} /km</td>
            <td>${achievements}</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

/**
 * Renders laps table
 */
function renderLaps(laps) {
    const section = document.getElementById('laps-section');
    const table = document.getElementById('laps-table');
    if (!section || !table) return;

    if (!laps || laps.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const tableHeader = `
    <thead>
        <tr>
            <th>Lap</th>
            <th>Distance</th>
            <th>Time</th>
            <th>Pace</th>
            <th>Elev. Gain</th>
            <th>Avg HR</th>
        </tr>
    </thead>`;

    const tableBody = laps.map(lap => {
        const pace = formatPace(lap.average_speed);
        return `
        <tr>
            <td>${lap.lap_index}</td>
            <td>${(lap.distance / 1000).toFixed(2)} km</td>
            <td>${formatTime(lap.moving_time)}</td>
            <td>${pace} /km</td>
            <td>${Math.round(lap.total_elevation_gain)} m</td>
            <td>${lap.average_heartrate ? Math.round(lap.average_heartrate) : '-'} bpm</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

/**
 * Renders laps pace chart
 */
function renderLapsChart(laps) {
    const canvas = document.getElementById('laps-chart');
    const section = document.getElementById('laps-chart-section');
    if (!canvas || !section || !laps || laps.length === 0) return;

    section.classList.remove('hidden');

    const labels = laps.map((_, i) => `Lap ${i + 1}`);
    const paces = laps.map(lap => 1000 / lap.average_speed);
    const minPace = Math.min(...paces);
    const maxPace = Math.max(...paces);

    const colors = paces.map(pace => {
        const t = (pace - minPace) / (maxPace - minPace || 1);
        const lightness = 35 + t * 35;
        return `hsl(15, 90%, ${lightness}%)`;
    });

    createChart('laps-chart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Pace (min/km)',
                data: paces,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Lap' } },
                y: {
                    reverse: true,
                    beginAtZero: false,
                    title: { display: true, text: 'Pace (min/km)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => labels[ctx[0].dataIndex],
                        label: ctx => {
                            const lap = laps[ctx.dataIndex];
                            return `Pace: ${formatPace(lap.average_speed)}`;
                        },
                        afterLabel: ctx => {
                            const lap = laps[ctx.dataIndex];
                            return [
                                `Distance: ${(lap.distance / 1000).toFixed(2)} km`,
                                `Time: ${formatTime(lap.moving_time)}`,
                                `Elevation: ${Math.round(lap.total_elevation_gain)} m`,
                                `Avg HR: ${lap.average_heartrate ? Math.round(lap.average_heartrate) : '-'} bpm`
                            ];
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders segment efforts table
 */
function renderSegments(segments) {
    const section = document.getElementById('segments-section');
    const table = document.getElementById('segments-table');
    if (!section || !table) return;

    if (!segments || segments.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const tableHeader = `
    <thead>
        <tr>
            <th>Segment Name</th>
            <th>Time</th>
            <th>Pace</th>
            <th>Avg HR</th>
            <th>Rank</th>
        </tr>
    </thead>`;

    const tableBody = segments.map(effort => {
        const pace = formatPace(effort.distance / effort.moving_time);
        let rank = '';
        if (effort.pr_rank === 1) {
            rank = '🏆 PR!';
        } else if (effort.pr_rank) {
            rank = `PR #${effort.pr_rank}`;
        } else if (effort.kom_rank === 1) {
            rank = '👑 KOM/QOM!';
        } else if (effort.kom_rank) {
            rank = `Top ${effort.kom_rank}`;
        }
        return `
        <tr>
            <td><a href="https://www.strava.com/segments/${effort.segment.id}" target="_blank">${effort.name}</a></td>
            <td>${formatTime(effort.moving_time)}</td>
            <td>${pace} /km</td>
            <td>${effort.average_heartrate ? Math.round(effort.average_heartrate) : '-'} bpm</td>
            <td>${rank}</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

// =====================================================
// 8. RENDERING FUNCTIONS - ZONE & AREA CHARTS
// =====================================================

/**
 * Renders HR zone distribution chart
 */
function renderHrZoneDistributionChart(streams) {
    const canvas = document.getElementById('hr-zones-chart');
    if (!canvas || !streams.heartrate || !streams.time) return;

    const zonesDataText = localStorage.getItem('strava_training_zones');
    if (!zonesDataText) {
        console.warn('Training zones not found in localStorage.');
        return;
    }

    const allZones = JSON.parse(zonesDataText);
    const hrZones = allZones?.heart_rate?.zones?.filter(z => z.max > 0);

    if (!hrZones || hrZones.length === 0) {
        console.warn('Valid HR zones not found.');
        return;
    }

    const timeInZones = calculateTimeInZones(streams.heartrate, streams.time, hrZones);
    const labels = hrZones.map((zone, i) => `Z${i + 1} (${zone.min}-${zone.max === -1 ? '∞' : zone.max})`);
    const data = timeInZones.map(time => +(time / 60).toFixed(1));

    const gradientColors = ['#fde0e0', '#fababa', '#fa7a7a', '#f44336', '#b71c1c'];

    createChart('hr-zones-chart', {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time in Zone (min)',
                data: data,
                backgroundColor: gradientColors.slice(0, hrZones.length),
                borderColor: gradientColors.slice(0, hrZones.length),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.parsed.y} min`;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'HR Zone' } },
                y: { title: { display: true, text: 'Time (min)' }, beginAtZero: true }
            }
        }
    });
}

/**
 * Renders HR min/max/avg area chart segmented over distance
 */
function renderHrMinMaxAreaChart(streams) {
    const canvas = document.getElementById('hr-minmax-area-chart');
    const section = document.getElementById('hr-min-max-area-section');

    if (!canvas || !section) return;

    if (!streams.heartrate || !streams.distance || !Array.isArray(streams.heartrate.data) || streams.heartrate.data.length < 2) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const hr = streams.heartrate.data;
    const dist = streams.distance.data;
    const totalDist = dist[dist.length - 1];
    const segmentLength = totalDist / CONFIG.NUM_SEGMENTS;

    const minArr = [], maxArr = [], avgArr = [], labels = [];
    let segEnd = segmentLength, i = 0;

    for (let s = 0; s < CONFIG.NUM_SEGMENTS; s++) {
        const hrVals = [];
        while (i < dist.length && dist[i] < segEnd) {
            if (hr[i] !== null && hr[i] !== undefined) hrVals.push(hr[i]);
            i++;
        }

        if (hrVals.length === 0) {
            minArr.push(minArr.length ? minArr[minArr.length - 1] : null);
            maxArr.push(maxArr.length ? maxArr[maxArr.length - 1] : null);
            avgArr.push(avgArr.length ? avgArr[avgArr.length - 1] : null);
        } else {
            minArr.push(Math.min(...hrVals));
            maxArr.push(Math.max(...hrVals));
            avgArr.push(hrVals.reduce((a, b) => a + b, 0) / hrVals.length);
        }

        labels.push((segEnd / 1000).toFixed(2));
        segEnd += segmentLength;
    }

    createChart('hr-minmax-area-chart', {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'HR Min',
                    data: minArr,
                    fill: '+1',
                    backgroundColor: 'rgba(252,82,0,0.3)',
                    borderColor: 'rgba(252,82,0,0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'HR Max',
                    data: maxArr,
                    fill: '-1',
                    backgroundColor: 'rgba(252,82,0,0.3)',
                    borderColor: 'rgba(252,82,0,0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'HR Avg',
                    data: avgArr,
                    fill: false,
                    borderColor: '#FC5200',
                    borderWidth: 2,
                    pointRadius: 0,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${Math.round(context.parsed.y)} bpm`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Distance (km)' } },
                y: { title: { display: true, text: 'Heart Rate (bpm)' }, beginAtZero: false }
            }
        }
    });
}

/**
 * Renders pace min/max/avg area chart segmented over distance
 */
function renderPaceMinMaxAreaChart(streams) {
    const canvas = document.getElementById('pace-min-max-area-chart');
    const section = document.getElementById('pace-min-max-area-section');

    if (!canvas || !section) return;

    if (!streams.distance || !streams.time || !Array.isArray(streams.distance.data) || streams.distance.data.length < 2) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const dist = streams.distance.data;
    const time = streams.time.data;
    const totalDist = dist[dist.length - 1];
    const segmentLength = totalDist / CONFIG.NUM_SEGMENTS;

    const minArr = [], maxArr = [], avgArr = [], labels = [];
    let segEnd = segmentLength, i = 0;

    for (let s = 0; s < CONFIG.NUM_SEGMENTS; s++) {
        const paceVals = [];
        while (i < dist.length && dist[i] < segEnd) {
            if (i > 0 && dist[i] > dist[i - 1]) {
                const deltaDist = dist[i] - dist[i - 1];
                const deltaTime = time[i] - time[i - 1];
                if (deltaDist > 0 && deltaTime > 0) {
                    const speed = deltaDist / deltaTime;
                    paceVals.push(1000 / speed / 60);
                }
            }
            i++;
        }

        if (paceVals.length === 0) {
            minArr.push(minArr.length ? minArr[minArr.length - 1] : null);
            maxArr.push(maxArr.length ? maxArr[maxArr.length - 1] : null);
            avgArr.push(avgArr.length ? avgArr[avgArr.length - 1] : null);
        } else {
            minArr.push(Math.min(...paceVals));
            maxArr.push(Math.max(...paceVals));
            avgArr.push(paceVals.reduce((a, b) => a + b, 0) / paceVals.length);
        }

        labels.push((segEnd / 1000).toFixed(2));
        segEnd += segmentLength;
    }

    createChart('pace-min-max-area-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Pace Min',
                    data: minArr,
                    fill: '+1',
                    backgroundColor: 'rgba(0, 123, 255, 0.25)',
                    borderColor: 'rgba(0, 123, 255, 0.5)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Pace Max',
                    data: maxArr,
                    fill: '-1',
                    backgroundColor: 'rgba(0, 123, 255, 0.25)',
                    borderColor: 'rgba(0, 123, 255, 0.5)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Pace Avg',
                    data: avgArr,
                    fill: false,
                    borderColor: '#007BFF',
                    borderWidth: 2,
                    pointRadius: 0,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} min/km`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Distance (km)' } },
                y: {
                    reverse: true,
                    beginAtZero: false,
                    title: { display: true, text: 'Pace (min/km)' }
                }
            }
        }
    });
}

/**
 * Renders run classification results
 */
function renderClassifierResults(classificationData) {
    const container = document.getElementById('run-classifier-results');
    if (!container) return;

    const results = classificationData ? classificationData.top : null;

    if (!results || results.length === 0) {
        container.innerHTML = '<p>Could not classify this run.</p>';
        return;
    }

    const resultsHtml = results.map((result, index) => {
        const color = index === 0 ? '#FC5200' : index === 1 ? '#6b7280' : '#a0aec0';
        return `
            <div class="classifier-result">
                <div class="classifier-type" style="color: ${color};">${result.type}</div>
                <div class="classifier-bar-container">
                    <div class="classifier-bar" style="width: ${result.pct}%; background-color: ${color};"></div>
                </div>
                <div class="classifier-score" style="color: ${color};">${result.pct}%</div>
            </div>`;
    }).join('');

    container.innerHTML = resultsHtml;
}

// =====================================================
// 9. MAIN INITIALIZATION
// =====================================================

/**
 * Main entry point - loads activity data and renders all sections
 */
async function main() {
    // Validate activity ID
    if (!activityId) {
        if (DOM.details) DOM.details.innerHTML = '<p>Error: No Activity ID provided.</p>';
        return;
    }

    // Check authentication
    const authPayload = getAuthPayload();
    if (!authPayload) {
        if (DOM.details) DOM.details.innerHTML = '<p>You must be logged in to view activity details.</p>';
        return;
    }

    try {
        if (DOM.streamCharts) DOM.streamCharts.style.display = 'grid';

        // Fetch activity data in parallel
        const [activityData, streamData] = await Promise.all([
            fetchActivityDetails(activityId, authPayload),
            fetchActivityStreams(activityId, authPayload)
        ]);

        // Calculate variability metrics from streams
        let paceVariabilityStream = '-';
        let hrVariabilityStream = '-';

        if (streamData && streamData.time && streamData.distance) {
            const paceStream = [];
            for (let i = 1; i < streamData.distance.data.length; i++) {
                const deltaDist = streamData.distance.data[i] - streamData.distance.data[i - 1];
                const deltaTime = streamData.time.data[i] - streamData.time.data[i - 1];
                if (deltaDist > 0 && deltaTime > 0) {
                    paceStream.push(deltaTime / deltaDist);
                }
            }
            paceVariabilityStream = calculateVariability(paceStream, true);
        }

        if (streamData && streamData.heartrate) {
            hrVariabilityStream = calculateVariability(streamData.heartrate.data, true);
        }

        // Calculate variability metrics from laps
        let paceVariabilityLaps = '-';
        let hrVariabilityLaps = '-';
        const lapsData = activityData.laps && activityData.laps.length > 1
            ? activityData.laps
            : activityData.splits_metric;

        if (lapsData && lapsData.length > 1) {
            const paceDataForCV = lapsData.map(lap => lap.average_speed);
            const hrDataForCV = lapsData.map(lap => lap.average_heartrate);
            paceVariabilityLaps = calculateVariability(paceDataForCV, false);
            hrVariabilityLaps = calculateVariability(hrDataForCV, false);
        }

        // Attach variability metrics to activity object
        activityData.pace_variability_stream = paceVariabilityStream;
        activityData.hr_variability_stream = hrVariabilityStream;
        activityData.pace_variability_laps = paceVariabilityLaps;
        activityData.hr_variability_laps = hrVariabilityLaps;

        // Apply rolling mean smoothing to streams
        const windowSize = 100;
        ['heartrate', 'altitude', 'cadence'].forEach(key => {
            if (streamData[key] && Array.isArray(streamData[key].data)) {
                streamData[key].data = rollingMean(streamData[key].data, windowSize);
            }
        });

        // Store original stream data for re-rendering with different smoothing levels
        lastStreamData = JSON.parse(JSON.stringify(streamData));
        lastActivityData = activityData;

        // Populate dynamic chart data
        populateDynamicChartData(streamData);

        // Render all sections
        renderActivityInfo(activityData);
        renderActivityStats(activityData);
        renderAdvancedStats(activityData);
        renderActivityMap(activityData);
        renderSplitsCharts(activityData);
        renderStreamCharts(streamData, activityData, currentSmoothingLevel);
        renderBestEfforts(activityData.best_efforts);
        renderLaps(activityData.laps);
        renderLapsChart(activityData.laps);
        renderSegments(activityData.segment_efforts);
        renderClassifierResults(classifyRun(activityData, streamData));
        renderHrZoneDistributionChart(streamData);
        renderHrMinMaxAreaChart(streamData);
        renderPaceMinMaxAreaChart(streamData);

        // Initialize smoothing slider control
        initSmoothingControl();

        // Initialize dynamic chart controls
        initDynamicChartControls();

        if (DOM.streamCharts) DOM.streamCharts.style.display = '';

    } catch (error) {
        console.error('Failed to load activity page:', error);
        if (DOM.details) DOM.details.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', main);
