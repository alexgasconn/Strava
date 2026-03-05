/**
 * RUN.JS - Running Activity Details Page Controller
 * Specialized for running metrics: pace, elevation, HR, cadence, splits
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
let originalStreamData = null;
let lastStreamData = null;
let lastActivityData = null;

// Dynamic chart data storage
let dynamicChartData = {
    distance: [],
    heartrate: [],
    pace: [],
    altitude: [],
    cadence: [],
    watts: [],
};

// Original unsmoothed dynamic chart data
let originalDynamicChartData = {
    distance: [],
    heartrate: [],
    pace: [],
    altitude: [],
    cadence: [],
    watts: [],
};

// Chart color mapping
const chartColors = {
    heartrate: { primary: 'rgb(255, 99, 132)', secondary: 'rgba(255, 99, 132, 0.3)' },
    pace: { primary: 'rgb(252, 82, 0)', secondary: 'rgba(252, 82, 0, 0.3)' },
    altitude: { primary: 'rgb(136, 136, 136)', secondary: 'rgba(136, 136, 136, 0.3)' },
    cadence: { primary: 'rgb(0, 116, 217)', secondary: 'rgba(0, 116, 217, 0.3)' },
    watts: { primary: 'rgb(155, 89, 182)', secondary: 'rgba(155, 89, 182, 0.3)' },
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
 * Formats date as DD/MM/YYYY
 */
function formatDate(date) {
    if (!(date instanceof Date)) date = new Date(date);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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
 * Calculates rolling mean for smoothing
 */
function rollingMean(data, windowSize) {
    if (!data || windowSize < 1) return data;

    const result = [];
    for (let i = 0; i < data.length; i++) {
        let sum = 0;
        let count = 0;

        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(data.length - 1, i + Math.floor(windowSize / 2));

        for (let j = start; j <= end; j++) {
            if (data[j] !== null && data[j] !== undefined) {
                sum += data[j];
                count++;
            }
        }

        result.push(count > 0 ? sum / count : data[i]);
    }

    return result;
}

/**
 * Calculates coefficient of variation for stream variability
 */
function calculateCoefficient(data) {
    const validData = data.filter(x => x !== null && x !== undefined && !isNaN(x));
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
 * Applies smoothing to a copy of stream data based on smoothing level
 */
function applySmoothingToStreams(streams, smoothingLevel) {
    if (!streams) return null;

    const smoothingFactor = smoothingLevel / 100;
    const smoothed = JSON.parse(JSON.stringify(streams));

    const windowSizes = {
        altitude: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.altitude * smoothingFactor)),
        heartrate: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.heartrate * smoothingFactor)),
        cadence: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.cadence * smoothingFactor)),
        watts: Math.max(1, Math.round(60 * smoothingFactor)),
    };

    ['heartrate', 'altitude', 'cadence', 'watts'].forEach(key => {
        if (smoothed[key] && Array.isArray(smoothed[key].data)) {
            smoothed[key].data = rollingMean(smoothed[key].data, windowSizes[key]);
        }
    });

    return smoothed;
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

        if (originalStreamData && lastActivityData) {
            const smoothedStreams = applySmoothingToStreams(originalStreamData, currentSmoothingLevel);
            lastStreamData = smoothedStreams;
            renderStreamCharts(smoothedStreams, lastActivityData);
        }
    });
}

/**
 * Populates dynamic chart data from stream data
 */
function populateDynamicChartData(streams, isOriginal = false) {
    const data = {
        distance: streams.distance?.data || [],
        heartrate: streams.heartrate?.data || [],
        altitude: streams.altitude?.data || [],
        cadence: streams.cadence?.data || [],
        watts: streams.watts?.data || [],
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
        data.pace = [null, ...pace];

        // Apply rolling mean smoothing to pace when not original
        if (!isOriginal) {
            const smoothingFactor = currentSmoothingLevel / 100;
            const paceWindow = Math.max(1, Math.round(CONFIG.WINDOW_SIZES.pace * smoothingFactor));
            data.pace = rollingMean(data.pace, paceWindow);
        }
    }

    // Apply cadence doubling for runs (Strava reports stride, we want cadence)
    data.cadence = data.cadence.map(c => c ? c * 2 : null);

    if (isOriginal) {
        originalDynamicChartData = data;
    } else {
        dynamicChartData = data;
    }
}

// =====================================================
// 3. API FUNCTIONS
// =====================================================

function getAuthPayload() {
    const tokenString = localStorage.getItem('strava_tokens');
    if (!tokenString) return null;
    return btoa(tokenString);
}

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

async function fetchActivityDetails(activityId, authPayload) {
    const result = await fetchFromApi(`/api/strava-activity?id=${activityId}`, authPayload);
    return result.activity;
}

async function fetchActivityStreams(activityId, authPayload) {
    const streamTypes = 'distance,time,heartrate,altitude,cadence,watts';
    const result = await fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, authPayload);
    return result.streams;
}

// =====================================================
// 4. RENDERING FUNCTIONS
// =====================================================

/**
 * Renders basic activity information for running
 */
function renderActivityInfo(activity) {
    if (!DOM.info) return;

    const name = activity.name;
    const description = activity.description || '';
    const date = formatDate(new Date(activity.start_date_local));
    const typeLabels = ['Workout', 'Race', 'Long Run', 'Workout'];
    const activityType = activity.workout_type !== undefined
        ? typeLabels[activity.workout_type] || 'Run'
        : 'Run';
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
 * Renders running statistics
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
    const avgPower = activity.average_watts ? Math.round(activity.average_watts) : null;

    DOM.stats.innerHTML = `
        <h3>Stats</h3>
        <ul>
            <li><b>Duration:</b> ${duration}</li>
            <li><b>Distance:</b> ${distanceKm} km</li>
            <li><b>Pace:</b> ${pace}</li>
            <li><b>Elevation Gain:</b> ${elevation} m</li>
            <li><b>Elevation per Km:</b> ${elevationPerKm} m</li>
            <li><b>Avg HR:</b> ${hrAvg} bpm</li>
            <li><b>Max HR:</b> ${hrMax} bpm</li>
            ${avgPower ? `<li><b>Avg Power:</b> ${avgPower} W</li>` : ''}
            <li><b>Calories:</b> ${calories}</li>
        </ul>
    `;
}

/**
 * Renders advanced running metrics
 */
function renderActivityAdvanced(activity) {
    if (!DOM.advanced) return;

    const movingTime = activity.moving_time || 0;
    const elapsedTime = activity.elapsed_time || 0;
    const hrReserve = activity.max_heartrate && CONFIG.USER_MAX_HR ? activity.max_heartrate - 70 : 'N/A';
    const suffScore = activity.suffer_score || '-';
    const vo2Max = activity.athlete_vo2max || '-';

    DOM.advanced.innerHTML = `
        <h3>Advanced</h3>
        <ul>
            <li><b>Moving Time:</b> ${formatTime(movingTime)}</li>
            <li><b>Elapsed Time:</b> ${formatTime(elapsedTime)}</li>
            <li><b>HR Reserve:</b> ${hrReserve}</li>
            <li><b>Suffer Score:</b> ${suffScore}</li>
            <li><b>VO2 Max:</b> ${vo2Max}</li>
        </ul>
    `;
}

/**
 * Renders HR zones distribution
 */
function renderHRZones(activity, zones) {
    if (!DOM.hrZonesChart || !lastStreamData || !lastStreamData.heartrate) return;

    const heartrateStream = lastStreamData.heartrate;
    const timeStream = lastStreamData.time;
    const timeInZones = calculateTimeInZones(heartrateStream, timeStream, zones);

    const labels = zones.map(z => {
        const maxLabel = z.max === -1 ? '∞' : z.max;
        return `${z.min}-${maxLabel} bpm`;
    });
    const data = timeInZones.map(t => Math.round(t));

    createChart('hr-zones-chart', {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(230, 126, 34, 0.7)',
                    'rgba(46, 204, 113, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(155, 89, 182, 0.7)',
                    'rgba(211, 84, 0, 0.7)',
                ],
                borderColor: '#fff',
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const seconds = ctx.parsed;
                            const formatted = formatTime(seconds);
                            return `${formatted}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders kilometer splits
 */
function renderSplits(activity) {
    if (!DOM.splitsSection || !activity.splits_standard || activity.splits_standard.length === 0) return;

    DOM.splitsSection.classList.remove('hidden');
    const splits = activity.splits_standard;

    let paceData = [];
    let hrData = [];
    let distanceLabels = [];

    splits.forEach((split, idx) => {
        distanceLabels.push(`${idx + 1}km`);
        const pace = split.average_speed ? formatPace(split.average_speed) : '-';
        paceData.push(split.average_speed ? 1000 / split.average_speed / 60 : null);
        hrData.push(split.average_heartrate || null);
    });

    // Pace chart
    createChart('chart-pace', {
        type: 'bar',
        data: {
            labels: distanceLabels,
            datasets: [{
                label: 'Pace (min/km)',
                data: paceData,
                backgroundColor: chartColors.pace.secondary,
                borderColor: chartColors.pace.primary,
                borderWidth: 2,
            }]
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: { beginAtZero: false, reverse: true }
            }
        }
    });

    // HR chart
    if (hrData.some(v => v !== null)) {
        createChart('chart-heartrate', {
            type: 'line',
            data: {
                labels: distanceLabels,
                datasets: [{
                    label: 'Heart Rate (bpm)',
                    data: hrData,
                    borderColor: chartColors.heartrate.primary,
                    backgroundColor: chartColors.heartrate.secondary,
                    tension: 0.3,
                    fill: true,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { beginAtZero: false }
                }
            }
        });
    }
}

/**
 * Renders stream charts (HR, pace, altitude, cadence)
 */
function renderStreamCharts(streams, activity) {
    if (!DOM.streamCharts) return;

    const numSegments = CONFIG.NUM_SEGMENTS;
    let distance = streams.distance?.data || [];
    let heartrate = streams.heartrate?.data || [];
    let altitude = streams.altitude?.data || [];
    let cadence = streams.cadence?.data || [];

    const step = Math.max(1, Math.floor(distance.length / numSegments));
    const segmentedDistance = distance.filter((_, i) => i % step === 0);
    const segmentedHR = heartrate.filter((_, i) => i % step === 0);
    const segmentedAltitude = altitude.filter((_, i) => i % step === 0);
    const segmentedCadence = cadence.filter((_, i) => i % step === 0);

    // HR Chart
    if (heartrate.length > 0 && segmentedHR.some(v => v !== null)) {
        createChart('chart-heartrate', {
            type: 'line',
            data: {
                labels: segmentedDistance.map(d => (d / 1000).toFixed(1)),
                datasets: [{
                    label: 'Heart Rate (bpm)',
                    data: segmentedHR,
                    borderColor: chartColors.heartrate.primary,
                    backgroundColor: chartColors.heartrate.secondary,
                    tension: 0.1,
                    fill: true,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: { title: { display: true, text: 'Distance (km)' } },
                    y: { beginAtZero: false, title: { display: true, text: 'HR (bpm)' } }
                }
            }
        });
    }

    // Altitude Chart
    if (altitude.length > 0 && segmentedAltitude.some(v => v !== null)) {
        createChart('chart-altitude', {
            type: 'area',
            data: {
                labels: segmentedDistance.map(d => (d / 1000).toFixed(1)),
                datasets: [{
                    label: 'Elevation (m)',
                    data: segmentedAltitude,
                    borderColor: chartColors.altitude.primary,
                    backgroundColor: chartColors.altitude.secondary,
                    tension: 0.1,
                    fill: true,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: { title: { display: true, text: 'Distance (km)' } },
                    y: { beginAtZero: false, title: { display: true, text: 'Elevation (m)' } }
                }
            }
        });
    }

    // Cadence Chart
    if (cadence.length > 0 && segmentedCadence.some(v => v !== null)) {
        createChart('chart-cadence', {
            type: 'line',
            data: {
                labels: segmentedDistance.map(d => (d / 1000).toFixed(1)),
                datasets: [{
                    label: 'Cadence (spm)',
                    data: segmentedCadence,
                    borderColor: chartColors.cadence.primary,
                    backgroundColor: chartColors.cadence.secondary,
                    tension: 0.1,
                    fill: true,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: { title: { display: true, text: 'Distance (km)' } },
                    y: { beginAtZero: false, title: { display: true, text: 'Cadence (spm)' } }
                }
            }
        });
    }
}

/**
 * Main initialization and rendering logic
 */
async function loadActivityPage() {
    try {
        const authPayload = getAuthPayload();
        if (!authPayload || !activityId) {
            throw new Error('Missing authentication or activity ID');
        }

        // Fetch activity details and streams in parallel
        const [activityData, streams] = await Promise.all([
            fetchActivityDetails(activityId, authPayload),
            fetchActivityStreams(activityId, authPayload)
        ]);

        lastActivityData = activityData;
        lastStreamData = streams;
        originalStreamData = JSON.parse(JSON.stringify(streams));

        // Populate dynamic chart data
        populateDynamicChartData(originalStreamData, true);
        populateDynamicChartData(lastStreamData, false);

        // Render all sections
        renderActivityInfo(activityData);
        renderActivityStats(activityData);
        renderActivityAdvanced(activityData);
        renderSplits(activityData);

        // Get zones from localStorage for HR zone rendering
        const cachedZones = JSON.parse(localStorage.getItem('strava_zones') || '[]');
        if (cachedZones.length > 0) {
            renderHRZones(activityData, cachedZones);
        }

        renderStreamCharts(streams, activityData);
        initSmoothingControl();

    } catch (error) {
        console.error('Error loading activity page:', error);
        document.body.innerHTML = `<div style="padding: 20px; color: red;"><h2>Error Loading Activity</h2><p>${error.message}</p></div>`;
    }
}

// Load page when DOM is ready
document.addEventListener('DOMContentLoaded', loadActivityPage);
