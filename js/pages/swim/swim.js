/**
 * SWIM.JS - Swimming Activity Details Page Controller
 * Specialized for swimming metrics: pace (min/100m), strokes, splits
 * Entry point: Query parameter ?id={activityId}
 */

import { formatDate as sharedFormatDate } from '../../shared/utils/index.js';

// =====================================================
// 1. INITIALIZATION & CONFIGURATION
// =====================================================

const CONFIG = {
    USER_MAX_HR: 195,
    WINDOW_SIZES: {
        heartrate: 80,
        cadence: 60,
    },
    NUM_SEGMENTS: 40,
};

const INDOOR_SWIM_DISTANCE_CORRECTION = 20 / 25;
const INDOOR_SWIM_CORRECTION_TAG = 'piscina-20m';
const INDOOR_SWIM_CORRECTION_CUTOFF = '2025-08-19';
const TARGET_ATHLETE_ID = 66914681;

// DOM References
const DOM = {
    info: document.getElementById('activity-info'),
    stats: document.getElementById('activity-stats'),
    advanced: document.getElementById('activity-advanced'),
    map: document.getElementById('activity-map'),
    splitsSection: document.getElementById('splits-section'),
    streamCharts: document.getElementById('stream-charts'),
    swolesSection: document.getElementById('swoles-section'),
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
let activityStrokes = null;

// Dynamic chart data storage
let dynamicChartData = {
    distance: [],
    heartrate: [],
    cadence: [],
};

// Original unsmoothed dynamic chart data
let originalDynamicChartData = {
    distance: [],
    heartrate: [],
    cadence: [],
};

// Chart color mapping for swimming
const chartColors = {
    heartrate: { primary: 'rgb(255, 99, 132)', secondary: 'rgba(255, 99, 132, 0.3)' },
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
 * Formats date as DD/MM/YYYY
 */
function formatDate(date) {
    return sharedFormatDate(date);
}

/**
 * Converts speed (m/s) to pace (min/100m) for swimming
 */
function formatSwimPace(speedInMps) {
    if (!speedInMps || speedInMps === 0) return '-';
    const paceInSecPer100m = 100 / speedInMps;
    const min = Math.floor(paceInSecPer100m / 60);
    const sec = Math.round(paceInSecPer100m % 60);
    return `${min}:${sec.toString().padStart(2, '0')}/100m`;
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function isTargetAthleteAlexGascon() {
    const athleteData = JSON.parse(localStorage.getItem('strava_athlete_data') || 'null');
    if (!athleteData) return false;

    const athleteId = Number(athleteData.id);
    const first = normalizeText(athleteData.firstname);
    const last = normalizeText(athleteData.lastname);
    const fullName = `${first} ${last}`.trim();
    const username = normalizeText(athleteData.username);

    return athleteId === TARGET_ATHLETE_ID || fullName === 'alex gascon' || username === 'alexgasconn' || username === 'alexgascon';
}

function isDateOnOrBeforeCutoff(dateLike) {
    const datePart = String(dateLike || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return false;
    return datePart <= INDOOR_SWIM_CORRECTION_CUTOFF;
}

function isIndoorPoolSwim(activity) {
    const sportType = String(activity?.sport_type || activity?.type || '');
    if (!/swim/i.test(sportType) || /openwater/i.test(sportType)) return false;

    if (activity?.trainer === true) return true;

    const hasStartLatLng = Array.isArray(activity?.start_latlng) && activity.start_latlng.length === 2;
    return !hasStartLatLng;
}

function addCorrectionTag(activity) {
    if (!Array.isArray(activity.tags)) activity.tags = [];
    if (!activity.tags.includes(INDOOR_SWIM_CORRECTION_TAG)) {
        activity.tags.push(INDOOR_SWIM_CORRECTION_TAG);
    }
}

function applyPool20mCorrectionToSplit(split) {
    if (!split || typeof split !== 'object') return;

    if (Number(split.distance) > 0) {
        split.distance = Math.max(1, Math.round(Number(split.distance) * INDOOR_SWIM_DISTANCE_CORRECTION));
    }

    if (Number(split.moving_time) > 0 && Number(split.distance) > 0) {
        split.average_speed = Number(split.distance) / Number(split.moving_time);
    } else if (Number(split.average_speed) > 0) {
        split.average_speed = Number(split.average_speed) * INDOOR_SWIM_DISTANCE_CORRECTION;
    }
}

function maybeCorrectIndoorSwimForAlex(activity) {
    if (!isTargetAthleteAlexGascon()) return activity;
    if (!isIndoorPoolSwim(activity)) return activity;
    if (!isDateOnOrBeforeCutoff(activity?.start_date_local || activity?.start_date)) return activity;

    if (Number(activity.distance) > 0) {
        activity.distance = Math.max(1, Math.round(Number(activity.distance) * INDOOR_SWIM_DISTANCE_CORRECTION));
    }

    if (Number(activity.moving_time) > 0 && Number(activity.distance) > 0) {
        activity.average_speed = Number(activity.distance) / Number(activity.moving_time);
    } else if (Number(activity.average_speed) > 0) {
        activity.average_speed = Number(activity.average_speed) * INDOOR_SWIM_DISTANCE_CORRECTION;
    }

    if (Number(activity.max_speed) > 0) {
        activity.max_speed = Number(activity.max_speed) * INDOOR_SWIM_DISTANCE_CORRECTION;
    }

    activity.pool_length = 20;
    addCorrectionTag(activity);

    if (Array.isArray(activity.laps)) {
        activity.laps.forEach(applyPool20mCorrectionToSplit);
    }

    if (Array.isArray(activity.splits_swim)) {
        activity.splits_swim.forEach(applyPool20mCorrectionToSplit);
    }

    return activity;
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
        heartrate: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.heartrate * smoothingFactor)),
        cadence: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.cadence * smoothingFactor)),
    };

    ['heartrate', 'cadence'].forEach(key => {
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
    const streamTypes = 'distance,time,heartrate,cadence';
    const result = await fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, authPayload);
    return result.streams;
}

// =====================================================
// 4. RENDERING FUNCTIONS
// =====================================================

/**
 * Renders basic activity information for swimming
 */
function renderActivityInfo(activity) {
    if (!DOM.info) return;

    console.log(activity);
    const name = activity.name;
    const description = activity.description || '';
    const date = formatDate(new Date(activity.start_date_local));
    const activityType = 'Swimming';
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
 * Renders swimming statistics
 */
function renderActivityStats(activity) {
    if (!DOM.stats) return;

    const distanceKm = (activity.distance / 1000).toFixed(2);
    const distanceM = (activity.distance).toFixed(0);
    const duration = formatTime(activity.moving_time);
    const pace = formatSwimPace(activity.average_speed);
    const calories = activity.calories !== undefined ? activity.calories : '-';
    const hrAvg = activity.average_heartrate ? Math.round(activity.average_heartrate) : '-';
    const hrMax = activity.max_heartrate ? Math.round(activity.max_heartrate) : '-';
    const totalStrokes = activity.total_strokes || '-';

    DOM.stats.innerHTML = `
        <h3>Stats</h3>
        <ul>
            <li><b>Duration:</b> ${duration}</li>
            <li><b>Distance:</b> ${distanceM} m (${distanceKm} km)</li>
            <li><b>Pace:</b> ${pace}</li>
            <li><b>Total Strokes:</b> ${totalStrokes}</li>
            <li><b>Avg HR:</b> ${hrAvg} bpm</li>
            <li><b>Max HR:</b> ${hrMax} bpm</li>
            <li><b>Calories:</b> ${calories}</li>
        </ul>
    `;
}

/**
 * Renders advanced swimming metrics
 */
function renderActivityAdvanced(activity) {
    if (!DOM.advanced) return;

    const movingTime = activity.moving_time || 0;
    const elapsedTime = activity.elapsed_time || 0;
    const distance = activity.distance || 0;
    const avgStrokesPerM = distance > 0
        ? ((activity.total_strokes || 0) / (distance)).toFixed(2)
        : '-';
    const poolLength = activity.pool_length || 'Unknown';
    const swolCount = activity.swolf_score ? activity.swolf_score : '-';

    DOM.advanced.innerHTML = `
        <h3>Advanced</h3>
        <ul>
            <li><b>Moving Time:</b> ${formatTime(movingTime)}</li>
            <li><b>Elapsed Time:</b> ${formatTime(elapsedTime)}</li>
            <li><b>Pool Length:</b> ${poolLength}m</li>
            <li><b>SWOLF Score:</b> ${swolCount}</li>
            <li><b>Strokes per Meter:</b> ${avgStrokesPerM}</li>
        </ul>
    `;
}

/**
 * Renders stroke breakdown if available
 */
function renderStrokeBreakdown(activity) {
    const section = document.getElementById('stroke-section');
    if (!section || !activityStrokes || activityStrokes.length === 0) {
        // Hide section if no strokes available
        if (section) {
            section.classList.add('hidden');
        }
        return;
    }

    section.classList.remove('hidden');

    const strokeBreakdown = activityStrokes.map(stroke => {
        const strokeTypes = {
            0: 'Unknown',
            1: 'Freestyle',
            2: 'Backstroke',
            3: 'Breaststroke',
            4: 'Butterfly',
            5: 'Mixed',
            6: 'Drill'
        };

        const strokeName = strokeTypes[stroke.stroke_type] || 'Unknown';
        const distance = (stroke.distance || 0).toFixed(0);
        const duration = formatTime(stroke.duration || 0);
        const avgPace = formatSwimPace(stroke.distance && stroke.duration ? stroke.distance / stroke.duration : 0);

        return `
            <div style="padding: 10px; margin: 5px 0; background: #f9f9f9; border-left: 4px solid #FC5200; border-radius: 4px;">
                <b>${strokeName}</b> | ${distance}m | ${duration} | ${avgPace}
            </div>
        `;
    }).join('');

    section.innerHTML = `
        <h3>Strokes Breakdown</h3>
        ${strokeBreakdown}
    `;
}

/**
 * Renders laps table for swimming
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
            <th>Avg HR</th>
            <th>Strokes</th>
        </tr>
    </thead>`;

    const tableBody = laps.map(lap => {
        const pace = formatSwimPace(lap.average_speed);
        const strokes = lap.total_strokes || '-';
        return `
        <tr>
            <td>${lap.lap_index}</td>
            <td>${(lap.distance).toFixed(0)} m</td>
            <td>${formatTime(lap.moving_time)}</td>
            <td>${pace}</td>
            <td>${lap.average_heartrate ? Math.round(lap.average_heartrate) : '-'} bpm</td>
            <td>${strokes}</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

/**
 * Renders laps pace chart for swimming
 */
function renderLapsChart(laps) {
    const canvas = document.getElementById('laps-chart');
    const section = document.getElementById('laps-chart-section');
    if (!canvas || !section || !laps || laps.length === 0) return;

    section.classList.remove('hidden');

    const labels = laps.map((_, i) => `Lap ${i + 1}`);
    const paces = laps.map(lap => {
        if (!lap.average_speed || lap.average_speed === 0) return 0;
        return 100 / lap.average_speed; // pace in seconds per 100m
    });

    const minPace = Math.min(...paces.filter(p => p > 0));
    const maxPace = Math.max(...paces.filter(p => p > 0));

    const colors = paces.map(pace => {
        if (pace === 0) return '#ccc';
        const t = (pace - minPace) / (maxPace - minPace || 1);
        const lightness = 35 + t * 35;
        return `hsl(15, 90%, ${lightness}%)`;
    });

    createChart('laps-chart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Pace (sec/100m)',
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
                    beginAtZero: false,
                    title: { display: true, text: 'Pace (sec/100m)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => labels[ctx[0].dataIndex],
                        label: ctx => {
                            const lap = laps[ctx.dataIndex];
                            return `Pace: ${formatSwimPace(lap.average_speed)}`;
                        },
                        afterLabel: ctx => {
                            const lap = laps[ctx.dataIndex];
                            return [
                                `Distance: ${(lap.distance).toFixed(0)} m`,
                                `Time: ${formatTime(lap.moving_time)}`,
                                `Avg HR: ${lap.average_heartrate ? Math.round(lap.average_heartrate) : '-'} bpm`,
                                `Strokes: ${lap.total_strokes || '-'}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders HR zones distribution
 */
function renderHRZones(activity, zones) {
    const section = document.getElementById('hr-zones-section');
    if (!DOM.hrZonesChart || !section) return;
    if (!lastStreamData || !lastStreamData.heartrate || !lastStreamData.time) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

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
 * Renders stream charts (HR, cadence)
 */
function renderStreamCharts(streams, activity) {
    if (!DOM.streamCharts) return;

    function setChartContainerVisibility(canvasId, visible) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !canvas.parentElement) return;
        canvas.parentElement.style.display = visible ? '' : 'none';
    }

    const numSegments = CONFIG.NUM_SEGMENTS;
    let distance = streams.distance?.data || [];
    let heartrate = streams.heartrate?.data || [];
    let cadence = streams.cadence?.data || [];

    const step = Math.max(1, Math.floor(distance.length / numSegments));
    const segmentedDistance = distance.filter((_, i) => i % step === 0);
    const segmentedHR = heartrate.filter((_, i) => i % step === 0);
    const segmentedCadence = cadence.filter((_, i) => i % step === 0);
    const hasHR = heartrate.length > 0 && segmentedHR.some(v => v !== null);
    const hasCadence = cadence.length > 0 && segmentedCadence.some(v => v !== null);

    setChartContainerVisibility('chart-heartrate', hasHR);
    setChartContainerVisibility('chart-cadence', hasCadence);
    DOM.streamCharts.style.display = (hasHR || hasCadence) ? 'grid' : 'none';

    // HR Chart
    if (hasHR) {
        createChart('chart-heartrate', {
            type: 'line',
            data: {
                labels: segmentedDistance.map(d => d ? (d / 100).toFixed(0) : '0'),
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
                    x: { title: { display: true, text: 'Distance (100m)' } },
                    y: { beginAtZero: false, title: { display: true, text: 'HR (bpm)' } }
                }
            }
        });
    }

    // Cadence Chart
    if (hasCadence) {
        createChart('chart-cadence', {
            type: 'line',
            data: {
                labels: segmentedDistance.map(d => d ? (d / 100).toFixed(0) : '0'),
                datasets: [{
                    label: 'Stroke Rate (SPM)',
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
                    x: { title: { display: true, text: 'Distance (100m)' } },
                    y: { beginAtZero: false, title: { display: true, text: 'SPM' } }
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
        const [activityDataRaw, streams] = await Promise.all([
            fetchActivityDetails(activityId, authPayload),
            fetchActivityStreams(activityId, authPayload)
        ]);

        const activityData = maybeCorrectIndoorSwimForAlex(activityDataRaw);

        lastActivityData = activityData;
        lastStreamData = streams;
        originalStreamData = JSON.parse(JSON.stringify(streams));

        // Extract strokes if available
        if (activityData.splits_swim) {
            activityStrokes = activityData.splits_swim;
        }

        // Render all sections
        renderActivityInfo(activityData);
        renderActivityStats(activityData);
        renderActivityAdvanced(activityData);
        renderStrokeBreakdown(activityData);
        renderLaps(activityData.laps);
        renderLapsChart(activityData.laps);

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
