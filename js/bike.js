/**
 * BIKE.JS - Cycling Activity Details Page Controller
 * Handles fetching, processing, and rendering cycling activity data
 * Entry point: Query parameter ?id={activityId}
 */

import { formatDate as sharedFormatDate } from './utils.js';

// =====================================================
// 1. CONFIGURATION
// =====================================================

const CONFIG = {
    USER_MAX_HR: 195,
    WINDOW_SIZES: {
        altitude: 50,
        speed: 120,
        heartrate: 80,
        cadence: 60,
        watts: 60,
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
    bikeClassifier: document.getElementById('bike-classifier-results'),
    hrZonesChart: document.getElementById('hr-zones-chart'),
};

// Parse activity ID from URL
const params = new URLSearchParams(window.location.search);
const activityId = parseInt(params.get('id'), 10);

// Chart instances registry
const chartInstances = {};

// State
let currentSmoothingLevel = 100;
let originalStreamData = null;
let lastActivityData = null;
let currentBikeClassification = null;

// Dynamic chart data (smoothed)
let dynamicChartData = {
    distance: [],
    heartrate: [],
    speed: [],
    altitude: [],
    cadence: [],
    watts: [],
};

// Dynamic chart data (original unsmoothed)
let originalDynamicChartData = {
    distance: [],
    heartrate: [],
    speed: [],
    altitude: [],
    cadence: [],
    watts: [],
};

// Chart color mapping
const chartColors = {
    heartrate: { primary: 'rgb(255, 99, 132)', secondary: 'rgba(255, 99, 132, 0.3)' },
    speed: { primary: 'rgb(252, 82, 0)', secondary: 'rgba(252, 82, 0, 0.3)' },
    altitude: { primary: 'rgb(136, 136, 136)', secondary: 'rgba(136, 136, 136, 0.3)' },
    cadence: { primary: 'rgb(0, 116, 217)', secondary: 'rgba(0, 116, 217, 0.3)' },
    watts: { primary: 'rgb(155, 89, 182)', secondary: 'rgba(155, 89, 182, 0.3)' },
};

// =====================================================
// 2. UTILITY FUNCTIONS
// =====================================================

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(date) {
    return sharedFormatDate(date);
}

function formatSpeed(speedInMps) {
    if (!speedInMps || speedInMps <= 0) return '-';
    return (speedInMps * 3.6).toFixed(1) + ' km/h';
}

function decodePolyline(str) {
    if (!str) return [];
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
        shift = 0; result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
        coordinates.push([lat * 1e-5, lng * 1e-5]);
    }
    return coordinates;
}

function rollingMean(arr, windowSize = 25) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
        const windowVals = arr.slice(start, end).filter(v => v !== null && isFinite(v));
        result.push(windowVals.length ? windowVals.reduce((a, b) => a + b, 0) / windowVals.length : null);
    }
    return result;
}

function calculateVariability(data, smoothingWindow = 0) {
    let processedData = data;
    if (smoothingWindow > 0) processedData = rollingMean(data, smoothingWindow);
    if (!processedData || processedData.length < 2) return '-';
    const validData = processedData.filter(d => d !== null && isFinite(d) && d > 0);
    if (validData.length < 2) return '-';
    const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
    if (mean === 0) return '-';
    const sd = Math.sqrt(validData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (validData.length - 1));
    return `${((sd / mean) * 100).toFixed(1)}%`;
}

function calculateTimeInZones(heartrateStream, timeStream, zones) {
    if (!heartrateStream || !timeStream || !zones || zones.length === 0) return [];
    const timeInZones = Array(zones.length).fill(0);
    for (let i = 1; i < heartrateStream.data.length; i++) {
        const hr = heartrateStream.data[i];
        if (hr === null) continue;
        const deltaTime = timeStream.data[i] - timeStream.data[i - 1];
        for (let j = 0; j < zones.length; j++) {
            const zone = zones[j];
            const max = zone.max === -1 ? Infinity : zone.max;
            if (hr >= zone.min && hr < max) { timeInZones[j] += deltaTime; break; }
        }
    }
    return timeInZones;
}

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn(`Canvas not found: ${canvasId}`); return; }
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    chartInstances[canvasId] = new Chart(canvas, config);
    return chartInstances[canvasId];
}

// =====================================================
// 3. CYCLING-SPECIFIC CALCULATIONS
// =====================================================

/**
 * Calculates Normalized Power from watts stream (30s rolling avg method)
 */
function calculateNormalizedPower(wattsData) {
    if (!wattsData || wattsData.length < 30) return null;
    const validWatts = wattsData.filter(w => w !== null && isFinite(w) && w >= 0);
    if (validWatts.length < 30) return null;
    const rollingAvg30 = [];
    for (let i = 29; i < validWatts.length; i++) {
        const slice = validWatts.slice(i - 29, i + 1);
        rollingAvg30.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    const fourthPowerAvg = rollingAvg30.reduce((a, b) => a + Math.pow(b, 4), 0) / rollingAvg30.length;
    return Math.round(Math.pow(fourthPowerAvg, 0.25));
}

/**
 * Calculates power curve (best average power for standard durations)
 */
function calculatePowerCurve(wattsData) {
    const durations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
    return durations.map(duration => {
        if (wattsData.length < duration) return { duration, power: null };
        let maxAvg = 0;
        for (let i = 0; i <= wattsData.length - duration; i++) {
            const avg = wattsData.slice(i, i + duration).reduce((a, b) => a + (b || 0), 0) / duration;
            if (avg > maxAvg) maxAvg = avg;
        }
        return { duration, power: Math.round(maxAvg) };
    });
}

/**
 * Applies smoothing to a copy of stream data
 */
function applySmoothingToStreams(streams, smoothingLevel) {
    if (!streams) return null;
    const f = smoothingLevel / 100;
    const smoothed = JSON.parse(JSON.stringify(streams));
    const windowSizes = {
        altitude: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.altitude * f)),
        heartrate: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.heartrate * f)),
        cadence: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.cadence * f)),
        watts: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.watts * f)),
    };
    ['heartrate', 'altitude', 'cadence', 'watts'].forEach(key => {
        if (smoothed[key]?.data) smoothed[key].data = rollingMean(smoothed[key].data, windowSizes[key]);
    });
    return smoothed;
}

/**
 * Populates dynamicChartData / originalDynamicChartData from stream object
 */
function populateDynamicChartData(streams, isOriginal = false) {
    const data = {
        distance: streams.distance?.data || [],
        heartrate: streams.heartrate?.data || [],
        altitude: streams.altitude?.data || [],
        cadence: streams.cadence?.data || [],
        watts: streams.watts?.data || [],
        speed: [],
    };

    if (streams.distance?.data && streams.time?.data) {
        const speed = [null];
        for (let i = 1; i < streams.distance.data.length; i++) {
            const dD = streams.distance.data[i] - streams.distance.data[i - 1];
            const dT = streams.time.data[i] - streams.time.data[i - 1];
            speed.push(dD > 0 && dT > 0 ? (dD / dT) * 3.6 : null);
        }
        data.speed = speed;
        if (!isOriginal) {
            const f = currentSmoothingLevel / 100;
            data.speed = rollingMean(data.speed, Math.max(1, Math.round(CONFIG.WINDOW_SIZES.speed * f)));
        }
    }

    if (isOriginal) {
        originalDynamicChartData = data;
    } else {
        dynamicChartData = data;
    }
}

// =====================================================
// 4. AUTH & API FUNCTIONS
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

async function fetchActivityDetails(id, authPayload) {
    const result = await fetchFromApi(`/api/strava-activity?id=${id}`, authPayload);
    return result.activity;
}

async function fetchActivityStreams(id, authPayload) {
    const streamTypes = 'distance,time,heartrate,altitude,cadence,watts,velocity_smooth';
    const result = await fetchFromApi(`/api/strava-streams?id=${id}&type=${streamTypes}`, authPayload);
    return result.streams;
}

// =====================================================
// 5. RENDERING — ACTIVITY INFO
// =====================================================

function renderActivityInfo(activity) {
    if (!DOM.info) return;
    const name = activity.name || 'Cycling Activity';
    const description = activity.description || '';
    const date = formatDate(new Date(activity.start_date_local || activity.start_date));
    const gear = activity.gear?.name || 'N/A';
    const kudos = activity.kudos_count || 0;
    const comments = activity.comment_count || 0;
    let tempStr = 'N/A';
    if (activity.average_temp !== undefined && activity.average_temp !== null) tempStr = `${activity.average_temp}°C`;

    DOM.info.innerHTML = `
        <h3>Info</h3>
        <ul>
            <li><b>Title:</b> ${name}</li>
            ${description ? `<li><b>Description:</b> ${description}</li>` : ''}
            <li><b>Date:</b> ${date}</li>
            <li><b>Type:</b> ${activity.sport_type || activity.type || 'Ride'}</li>
            <li><b>Gear:</b> ${gear}</li>
            <li><b>Temperature:</b> ${tempStr}</li>
            <li><b>Comments:</b> ${comments}</li>
            <li><b>Kudos:</b> ${kudos}</li>
        </ul>
    `;
}

function renderActivityStats(activity, streams) {
    if (!DOM.stats) return;
    const distanceKm = ((activity.distance || 0) / 1000).toFixed(2);
    const duration = formatTime(activity.moving_time);
    const avgSpeed = formatSpeed(activity.average_speed);
    const maxSpeed = formatSpeed(activity.max_speed);
    const elevation = activity.total_elevation_gain !== undefined ? activity.total_elevation_gain : '-';
    const elevPerKm = activity.distance > 0
        ? (activity.total_elevation_gain / (activity.distance / 1000)).toFixed(1) + ' m/km'
        : '-';
    const calories = activity.calories !== undefined ? activity.calories : '-';
    const hrAvg = activity.average_heartrate ? Math.round(activity.average_heartrate) : '-';
    const hrMax = activity.max_heartrate ? Math.round(activity.max_heartrate) : '-';
    const avgWatts = activity.average_watts ? Math.round(activity.average_watts) + ' W' : '-';
    const maxWatts = activity.max_watts ? Math.round(activity.max_watts) + ' W' : null;
    const avgCadence = activity.average_cadence ? Math.round(activity.average_cadence) + ' rpm' : '-';
    const weightedWatts = activity.weighted_average_watts ? Math.round(activity.weighted_average_watts) + ' W' : null;

    let npDisplay = weightedWatts;
    if (!npDisplay && streams?.watts?.data) {
        const np = calculateNormalizedPower(streams.watts.data);
        if (np) npDisplay = np + ' W';
    }

    DOM.stats.innerHTML = `
        <h3>Stats</h3>
        <ul>
            <li><b>Duration:</b> ${duration}</li>
            <li><b>Distance:</b> ${distanceKm} km</li>
            <li><b>Avg Speed:</b> ${avgSpeed}</li>
            <li><b>Max Speed:</b> ${maxSpeed}</li>
            <li><b>Elevation Gain:</b> ${elevation} m</li>
            <li><b>Elev/km:</b> ${elevPerKm}</li>
            <li><b>Calories:</b> ${calories} kcal</li>
            <li><b>HR Avg:</b> ${hrAvg} bpm</li>
            <li><b>HR Max:</b> ${hrMax} bpm</li>
            <li><b>Avg Power:</b> ${avgWatts}</li>
            ${npDisplay ? `<li><b>Normalized Power:</b> ${npDisplay}</li>` : ''}
            ${maxWatts ? `<li><b>Max Power:</b> ${maxWatts}</li>` : ''}
            <li><b>Avg Cadence:</b> ${avgCadence}</li>
        </ul>
    `;
}

function renderAdvancedStats(activity) {
    if (!DOM.advanced) return;
    const kudos = activity.kudos_count || 0;
    const comments = activity.comment_count || 0;
    const photos = activity.photos?.count || 0;
    const prs = activity.pr_count || 0;
    const achievements = activity.achievement_count || 0;
    const sufferScore = activity.suffer_score || '-';
    const perceived = activity.perceived_exertion || '-';
    const hasLaps = activity.laps?.length > 0;
    const hasSegments = activity.segment_efforts?.length > 0;
    const deviceName = activity.device_name || '-';

    let speedVariability = '-';
    let hrVariability = '-';
    const streams = activity._streamData;
    if (streams) {
        if (streams.distance?.data && streams.time?.data) {
            const speedStream = [];
            for (let i = 1; i < streams.distance.data.length; i++) {
                const dD = streams.distance.data[i] - streams.distance.data[i - 1];
                const dT = streams.time.data[i] - streams.time.data[i - 1];
                if (dD > 0 && dT > 0) speedStream.push((dD / dT) * 3.6);
            }
            speedVariability = calculateVariability(speedStream, Math.max(1, Math.round(150 * currentSmoothingLevel / 100)));
        }
        if (streams.heartrate?.data) {
            hrVariability = calculateVariability(streams.heartrate.data, Math.max(1, Math.round(150 * currentSmoothingLevel / 100)));
        }
    }

    DOM.advanced.innerHTML = `
        <h3>Advanced</h3>
        <ul>
            <li><b>Device:</b> ${deviceName}</li>
            <li><b>Suffer Score:</b> ${sufferScore}</li>
            <li><b>Perceived Effort:</b> ${perceived}</li>
            <li><b>PRs:</b> ${prs}</li>
            <li><b>Achievements:</b> ${achievements}</li>
            <li><b>Kudos:</b> ${kudos}</li>
            <li><b>Comments:</b> ${comments}</li>
            <li><b>Photos:</b> ${photos}</li>
            <li><b>Speed Variability:</b> ${speedVariability}</li>
            <li><b>HR Variability:</b> ${hrVariability}</li>
            ${hasLaps ? `<li><b>Laps:</b> ${activity.laps.length}</li>` : ''}
            ${hasSegments ? `<li><b>Segments:</b> ${activity.segment_efforts.length}</li>` : ''}
        </ul>
    `;
}

// =====================================================
// 6. RENDERING — MAP
// =====================================================

function renderActivityMap(activity) {
    if (!DOM.map) return;
    const polyline = activity.map?.summary_polyline || activity.map?.polyline;
    if (polyline && window.L) {
        const coords = decodePolyline(polyline);
        if (coords.length > 0) {
            DOM.map.innerHTML = '';
            const map = L.map('activity-map').setView(coords[0], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            const polylineLayer = L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
            map.fitBounds(polylineLayer.getBounds());
        } else {
            DOM.map.innerHTML = '<p>No route data (empty polyline).</p>';
        }
    } else {
        DOM.map.innerHTML = '<p>No route data available.</p>';
    }
}

// =====================================================
// 7. RENDERING — SPLITS CHARTS
// =====================================================

function renderSplitsCharts(activity) {
    if (!DOM.splitsSection) return;
    const splits = activity.splits_metric;
    if (!splits || splits.length === 0) { DOM.splitsSection.classList.add('hidden'); return; }
    DOM.splitsSection.classList.remove('hidden');
    const labels = splits.map((_, i) => `km ${i + 1}`);
    const speedData = splits.map(s => s.average_speed ? +(s.average_speed * 3.6).toFixed(2) : null);
    const hrData = splits.map(s => s.average_heartrate || null);

    createChart('chart-speed', {
        type: 'line',
        data: { labels, datasets: [{ label: 'Speed (km/h)', data: speedData, borderColor: '#FC5200', backgroundColor: 'rgba(252, 82, 0, 0.07)', fill: false, pointRadius: 3, borderWidth: 2, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Speed (km/h)' }, beginAtZero: false } } }
    });

    createChart('chart-heartrate', {
        type: 'line',
        data: { labels, datasets: [{ label: 'Avg HR (bpm)', data: hrData, borderColor: 'red', backgroundColor: 'rgba(255, 0, 0, 0.07)', fill: false, pointRadius: 3, borderWidth: 2, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Heart Rate (bpm)' }, beginAtZero: false } } }
    });
}

// =====================================================
// 8. RENDERING — STREAM CHARTS
// =====================================================

function createStreamChart(canvasId, label, data, colorKey, labels) {
    const color = chartColors[colorKey]?.primary || '#888';
    const bgColor = chartColors[colorKey]?.secondary || 'rgba(136,136,136,0.3)';
    createChart(canvasId, {
        type: 'line',
        data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: bgColor, fill: false, pointRadius: 0, borderWidth: 2, tension: 0.3 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { title: { display: true, text: 'Distance (km)' } }, y: { title: { display: true, text: label }, beginAtZero: false } }
        }
    });
}

function renderStreamCharts(streams, activity, smoothingLevel = 100) {
    if (!DOM.streamCharts) return;
    if (!streams?.distance?.data?.length) {
        DOM.streamCharts.innerHTML = '<p>No detailed stream data available.</p>';
        return;
    }

    const f = smoothingLevel / 100;
    const ws = {
        altitude: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.altitude * f)),
        speed: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.speed * f)),
        heartrate: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.heartrate * f)),
        cadence: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.cadence * f)),
        watts: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.watts * f)),
    };

    const { distance, time, heartrate, altitude, cadence, watts } = streams;
    const distLabels = distance.data.map(d => (d / 1000).toFixed(2));

    if (altitude?.data) {
        createStreamChart('chart-altitude', 'Altitude (m)', rollingMean(altitude.data, ws.altitude), 'altitude', distLabels);
    }

    if (time?.data && distance?.data) {
        const speedKmh = [null];
        for (let i = 1; i < distance.data.length; i++) {
            const dD = distance.data[i] - distance.data[i - 1];
            const dT = time.data[i] - time.data[i - 1];
            speedKmh.push(dD > 0 && dT > 0 ? (dD / dT) * 3.6 : null);
        }
        createStreamChart('chart-speed-distance', 'Speed (km/h)', rollingMean(speedKmh, ws.speed), 'speed', distLabels);
    }

    if (heartrate?.data) {
        createStreamChart('chart-heart-distance', 'Heart Rate (bpm)', rollingMean(heartrate.data, ws.heartrate), 'heartrate', distLabels);
    }

    if (cadence?.data) {
        createStreamChart('chart-cadence-distance', 'Cadence (rpm)', rollingMean(cadence.data, ws.cadence), 'cadence', distLabels);
    }

    if (watts?.data?.some(w => w > 0)) {
        createStreamChart('chart-watts-distance', 'Power (W)', rollingMean(watts.data, ws.watts), 'watts', distLabels);
    }
}

// =====================================================
// 9. RENDERING — POWER CURVE
// =====================================================

function renderPowerCurveChart(streams) {
    const section = document.getElementById('power-curve-section');
    if (!section) return;
    if (!streams?.watts?.data?.some(w => w > 0)) { section.style.display = 'none'; return; }
    section.style.display = '';

    const wattsData = streams.watts.data.filter(w => w !== null && w >= 0);
    const curve = calculatePowerCurve(wattsData);

    createChart('power-curve-chart', {
        type: 'line',
        data: {
            labels: curve.map(c => c.duration < 60 ? `${c.duration}s` : c.duration < 3600 ? `${c.duration / 60}min` : `${c.duration / 3600}h`),
            datasets: [{
                label: 'Best Avg Power (W)', data: curve.map(c => c.power),
                borderColor: chartColors.watts.primary, backgroundColor: chartColors.watts.secondary,
                fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} W` } } },
            scales: {
                x: { title: { display: true, text: 'Duration' } },
                y: { beginAtZero: false, title: { display: true, text: 'Power (W)' } }
            }
        }
    });
}

// =====================================================
// 10. RENDERING — CADENCE VS SPEED SCATTER
// =====================================================

function renderCadenceSpeedChart(streams) {
    const el = document.getElementById('chart-cadence-speed');
    if (!el) return;
    if (!streams?.cadence?.data?.length || !streams?.distance?.data?.length || !streams?.time?.data?.length) {
        el.parentElement.style.display = 'none'; return;
    }

    const cadenceData = streams.cadence.data;
    const distance = streams.distance.data;
    const time = streams.time.data;
    const speedKmh = [];
    for (let i = 1; i < distance.length; i++) {
        const dD = distance[i] - distance[i - 1];
        const dT = time[i] - time[i - 1];
        speedKmh.push(dD > 0 && dT > 0 ? (dD / dT) * 3.6 : 0);
    }

    const step = Math.max(1, Math.floor(Math.min(cadenceData.length - 1, speedKmh.length) / 800));
    const points = [];
    for (let i = 0; i < Math.min(cadenceData.length - 1, speedKmh.length); i += step) {
        if (cadenceData[i + 1] > 0 && speedKmh[i] > 0) {
            points.push({ x: +speedKmh[i].toFixed(2), y: cadenceData[i + 1] });
        }
    }

    createChart('chart-cadence-speed', {
        type: 'scatter',
        data: { datasets: [{ label: 'Cadence vs Speed', data: points, borderColor: chartColors.cadence.primary, backgroundColor: chartColors.cadence.secondary, pointRadius: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Speed (km/h)' } },
                y: { title: { display: true, text: 'Cadence (rpm)' }, beginAtZero: true }
            }
        }
    });
}

// =====================================================
// 11. RENDERING — HR ZONES
// =====================================================

function renderHrZoneDistributionChart(streams) {
    const canvas = document.getElementById('hr-zones-chart');
    if (!canvas || !streams?.heartrate || !streams?.time) return;

    const zonesDataText = localStorage.getItem('strava_training_zones');
    if (!zonesDataText) return;

    const allZones = JSON.parse(zonesDataText);
    const hrZones = allZones?.heart_rate?.zones?.filter(z => z.max > 0);
    if (!hrZones || hrZones.length === 0) return;

    const timeInZones = calculateTimeInZones(streams.heartrate, streams.time, hrZones);
    const labels = hrZones.map((zone, i) => `Z${i + 1} (${zone.min}-${zone.max === -1 ? 'inf' : zone.max})`);
    const data = timeInZones.map(t => +(t / 60).toFixed(1));
    const gradientColors = ['#fde0e0', '#fababa', '#fa7a7a', '#f44336', '#b71c1c'];

    createChart('hr-zones-chart', {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Time in Zone (min)', data, backgroundColor: gradientColors.slice(0, hrZones.length), borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} min` } } },
            scales: { x: { title: { display: true, text: 'HR Zone' } }, y: { title: { display: true, text: 'Time (min)' }, beginAtZero: true } }
        }
    });
}

// =====================================================
// 12. RENDERING — MIN/MAX AREA CHARTS
// =====================================================

function renderHrMinMaxAreaChart(streams, smoothingLevel = 100) {
    const canvas = document.getElementById('hr-minmax-area-chart');
    const section = document.getElementById('hr-min-max-area-section');
    if (!canvas || !section) return;
    if (!streams?.heartrate?.data?.length || !streams?.distance?.data?.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    const hr = streams.heartrate.data;
    const dist = streams.distance.data;
    const totalDist = dist[dist.length - 1];
    const segLen = totalDist / CONFIG.NUM_SEGMENTS;
    const minArr = [], maxArr = [], avgArr = [], labels = [];
    let segEnd = segLen, i = 0;

    for (let s = 0; s < CONFIG.NUM_SEGMENTS; s++) {
        const vals = [];
        while (i < dist.length && dist[i] < segEnd) { if (hr[i] != null) vals.push(hr[i]); i++; }
        const last = arr => arr.length ? arr[arr.length - 1] : null;
        minArr.push(vals.length ? Math.min(...vals) : last(minArr));
        maxArr.push(vals.length ? Math.max(...vals) : last(maxArr));
        avgArr.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : last(avgArr));
        labels.push((segEnd / 1000).toFixed(2));
        segEnd += segLen;
    }

    const sw = Math.max(1, Math.round(8 * smoothingLevel / 100));
    createChart('hr-minmax-area-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'HR Min', data: rollingMean(minArr, sw), fill: '+1', backgroundColor: 'rgba(252,82,0,0.3)', borderColor: 'rgba(252,82,0,0.6)', pointRadius: 0, order: 1 },
                { label: 'HR Max', data: rollingMean(maxArr, sw), fill: '-1', backgroundColor: 'rgba(252,82,0,0.3)', borderColor: 'rgba(252,82,0,0.6)', pointRadius: 0, order: 1 },
                { label: 'HR Avg', data: rollingMean(avgArr, sw), fill: false, borderColor: '#FC5200', borderWidth: 2, pointRadius: 0, order: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} bpm` } } },
            scales: { x: { title: { display: true, text: 'Distance (km)' } }, y: { title: { display: true, text: 'Heart Rate (bpm)' }, beginAtZero: false } }
        }
    });
}

function renderSpeedMinMaxAreaChart(streams, smoothingLevel = 100) {
    const canvas = document.getElementById('speed-min-max-area-chart');
    const section = document.getElementById('speed-min-max-area-section');
    if (!canvas || !section) return;
    if (!streams?.distance?.data?.length || !streams?.time?.data?.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    const dist = streams.distance.data;
    const time = streams.time.data;
    const totalDist = dist[dist.length - 1];
    const segLen = totalDist / CONFIG.NUM_SEGMENTS;
    const minArr = [], maxArr = [], avgArr = [], labels = [];
    let segEnd = segLen, i = 0;

    for (let s = 0; s < CONFIG.NUM_SEGMENTS; s++) {
        const vals = [];
        while (i < dist.length && dist[i] < segEnd) {
            if (i > 0 && dist[i] > dist[i - 1]) {
                const dD = dist[i] - dist[i - 1], dT = time[i] - time[i - 1];
                if (dD > 0 && dT > 0) vals.push((dD / dT) * 3.6);
            }
            i++;
        }
        const last = arr => arr.length ? arr[arr.length - 1] : null;
        minArr.push(vals.length ? Math.min(...vals) : last(minArr));
        maxArr.push(vals.length ? Math.max(...vals) : last(maxArr));
        avgArr.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : last(avgArr));
        labels.push((segEnd / 1000).toFixed(2));
        segEnd += segLen;
    }

    const sw = Math.max(1, Math.round(8 * smoothingLevel / 100));
    createChart('speed-min-max-area-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Speed Min', data: rollingMean(minArr, sw), fill: '+1', backgroundColor: 'rgba(0,123,255,0.25)', borderColor: 'rgba(0,123,255,0.5)', pointRadius: 0, order: 1 },
                { label: 'Speed Max', data: rollingMean(maxArr, sw), fill: '-1', backgroundColor: 'rgba(0,123,255,0.25)', borderColor: 'rgba(0,123,255,0.5)', pointRadius: 0, order: 1 },
                { label: 'Speed Avg', data: rollingMean(avgArr, sw), fill: false, borderColor: '#007BFF', borderWidth: 2, pointRadius: 0, order: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} km/h` } } },
            scales: { x: { title: { display: true, text: 'Distance (km)' } }, y: { title: { display: true, text: 'Speed (km/h)' }, beginAtZero: false } }
        }
    });
}

// =====================================================
// 13. RENDERING — TABLES
// =====================================================

function renderLaps(laps) {
    const section = document.getElementById('laps-section');
    const table = document.getElementById('laps-table');
    if (!section || !table) return;
    if (!laps || laps.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const header = `<thead><tr><th>Lap</th><th>Distance</th><th>Time</th><th>Avg Speed</th><th>Elev. +</th><th>Avg HR</th><th>Avg Power</th></tr></thead>`;
    const body = laps.map(lap => `<tr>
        <td>${lap.lap_index}</td>
        <td>${(lap.distance / 1000).toFixed(2)} km</td>
        <td>${formatTime(lap.moving_time)}</td>
        <td>${formatSpeed(lap.average_speed)}</td>
        <td>${Math.round(lap.total_elevation_gain)} m</td>
        <td>${lap.average_heartrate ? Math.round(lap.average_heartrate) + ' bpm' : '-'}</td>
        <td>${lap.average_watts ? Math.round(lap.average_watts) + ' W' : '-'}</td>
    </tr>`).join('');
    table.innerHTML = header + `<tbody>${body}</tbody>`;
}

function renderLapsChart(laps) {
    const canvas = document.getElementById('laps-chart');
    const section = document.getElementById('laps-chart-section');
    if (!canvas || !section || !laps || laps.length === 0) return;
    section.classList.remove('hidden');
    const labels = laps.map((_, i) => `Lap ${i + 1}`);
    const speeds = laps.map(lap => +(lap.average_speed * 3.6).toFixed(2));
    const maxSpd = Math.max(...speeds), minSpd = Math.min(...speeds);
    const colors = speeds.map(s => { const t = maxSpd > minSpd ? (s - minSpd) / (maxSpd - minSpd) : 0.5; return `hsl(15, 90%, ${35 + t * 35}%)`; });

    createChart('laps-chart', {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Avg Speed (km/h)', data: speeds, backgroundColor: colors, borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { title: { display: true, text: 'Lap' } }, y: { beginAtZero: false, title: { display: true, text: 'Speed (km/h)' } } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const lap = laps[ctx.dataIndex];
                            return [
                                `Speed: ${formatSpeed(lap.average_speed)}`,
                                `Dist: ${(lap.distance / 1000).toFixed(2)} km`,
                                `Time: ${formatTime(lap.moving_time)}`,
                                `Elev: ${Math.round(lap.total_elevation_gain)} m`,
                                `HR: ${lap.average_heartrate ? Math.round(lap.average_heartrate) + ' bpm' : '-'}`,
                                `Power: ${lap.average_watts ? Math.round(lap.average_watts) + ' W' : '-'}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function renderSegments(segments) {
    const section = document.getElementById('segments-section');
    const table = document.getElementById('segments-table');
    if (!section || !table) return;
    if (!segments || segments.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const header = `<thead><tr><th>Segment</th><th>Time</th><th>Avg Speed</th><th>Avg HR</th><th>Avg Power</th><th>Rank</th></tr></thead>`;
    const body = segments.map(effort => {
        let rank = '';
        if (effort.pr_rank === 1) rank = 'PR!';
        else if (effort.pr_rank) rank = `PR #${effort.pr_rank}`;
        else if (effort.kom_rank === 1) rank = 'KOM!';
        else if (effort.kom_rank) rank = `Top ${effort.kom_rank}`;
        return `<tr>
            <td><a href="https://www.strava.com/segments/${effort.segment.id}" target="_blank">${effort.name}</a></td>
            <td>${formatTime(effort.moving_time)}</td>
            <td>${formatSpeed(effort.distance / effort.moving_time)}</td>
            <td>${effort.average_heartrate ? Math.round(effort.average_heartrate) + ' bpm' : '-'}</td>
            <td>${effort.average_watts ? Math.round(effort.average_watts) + ' W' : '-'}</td>
            <td>${rank}</td>
        </tr>`;
    }).join('');
    table.innerHTML = header + `<tbody>${body}</tbody>`;
}

function renderBestEfforts(bestEfforts) {
    const section = document.getElementById('best-efforts-section');
    const table = document.getElementById('best-efforts-table');
    if (!section || !table) return;
    if (!bestEfforts || bestEfforts.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const header = `<thead><tr><th>Distance</th><th>Time</th><th>Avg Speed</th><th>Achievement</th></tr></thead>`;
    const body = bestEfforts.map(effort => {
        const ach = effort.pr_rank ? `PR #${effort.pr_rank}` : (effort.achievements?.length > 0 ? '-' : '');
        return `<tr>
            <td>${effort.name}</td>
            <td>${formatTime(effort.moving_time)}</td>
            <td>${formatSpeed(effort.distance / effort.moving_time)}</td>
            <td>${ach}</td>
        </tr>`;
    }).join('');
    table.innerHTML = header + `<tbody>${body}</tbody>`;
}

// =====================================================
// 14. RENDERING — BIKE CLASSIFIER
// =====================================================

function renderBikeClassifier(activity, streams) {
    const container = document.getElementById('bike-classifier-results');
    if (!container) return;
    if (typeof window.classifyBike !== 'function') { container.innerHTML = '<p>Classifier not loaded.</p>'; return; }

    const classification = window.classifyBike(activity, streams);
    currentBikeClassification = classification;
    const results = classification?.top;
    if (!results || results.length === 0) { container.innerHTML = '<p>Could not classify bike type.</p>'; return; }

    const colors = ['#FC5200', '#6b7280', '#a0aec0'];
    container.innerHTML = results.map((r, i) => `
        <div class="classifier-result">
            <div class="classifier-type" style="color: ${colors[i] || '#ccc'};">${r.type}</div>
            <div class="classifier-bar-container">
                <div class="classifier-bar" style="width: ${r.pct}%; background-color: ${colors[i] || '#ccc'};"></div>
            </div>
            <div class="classifier-score" style="color: ${colors[i] || '#ccc'};">${r.pct}%</div>
        </div>`).join('');
}

// =====================================================
// 15. DYNAMIC CUSTOM CHART
// =====================================================

function getDataLabel(dataType) {
    const labels = { heartrate: 'Heart Rate (bpm)', speed: 'Speed (km/h)', altitude: 'Altitude (m)', cadence: 'Cadence (rpm)', watts: 'Power (W)' };
    return labels[dataType] || dataType;
}

function renderDynamicChart(primaryData, primaryType, primaryShow, secondaryData, secondaryType, secondaryShow, backgroundStat) {
    if (!primaryData || !primaryShow) {
        if (chartInstances['dynamic-custom-chart']) { chartInstances['dynamic-custom-chart'].destroy(); delete chartInstances['dynamic-custom-chart']; }
        return;
    }

    const labels = dynamicChartData.distance.map(d => (d / 1000).toFixed(2));
    const datasets = [];
    const yAxisConfigs = {};

    if (primaryShow && primaryData) {
        const c = chartColors[primaryData];
        datasets.push({ label: getDataLabel(primaryData), data: dynamicChartData[primaryData], borderColor: c.primary, backgroundColor: c.secondary, borderWidth: 2, fill: primaryType === 'area', pointRadius: primaryType === 'scatter' ? 3 : 0, yAxisID: 'y', tension: 0.3 });
        yAxisConfigs.y = { type: 'linear', position: 'left', title: { display: true, text: getDataLabel(primaryData) } };
    }

    if (secondaryShow && secondaryData && secondaryData !== primaryData) {
        const c = chartColors[secondaryData];
        datasets.push({ label: getDataLabel(secondaryData), data: dynamicChartData[secondaryData], borderColor: c.primary, backgroundColor: c.secondary, borderWidth: 2, fill: secondaryType === 'area', pointRadius: secondaryType === 'scatter' ? 3 : 0, yAxisID: 'y1', tension: 0.3 });
        yAxisConfigs.y1 = { type: 'linear', position: 'right', title: { display: true, text: getDataLabel(secondaryData) }, grid: { drawOnChartArea: false } };
    }

    if (backgroundStat && backgroundStat !== primaryData && backgroundStat !== secondaryData) {
        const c = chartColors[backgroundStat];
        datasets.push({ label: `${getDataLabel(backgroundStat)} (ref)`, data: originalDynamicChartData[backgroundStat], borderColor: c.primary, backgroundColor: 'rgba(200,200,200,0.15)', borderWidth: 1, borderDash: [5, 5], fill: true, pointRadius: 0, yAxisID: 'y', tension: 0.3, order: -1 });
    }

    createChart('dynamic-custom-chart', {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: true, position: 'top' } },
            scales: { x: { title: { display: true, text: 'Distance (km)' }, type: 'category' }, ...yAxisConfigs }
        }
    });
}

function initDynamicChartControls() {
    const primarySel = document.getElementById('dynamic-chart-primary-data');
    const secondarySel = document.getElementById('dynamic-chart-secondary-data');
    const primaryTypeSel = document.getElementById('dynamic-chart-primary-type');
    const secondaryTypeSel = document.getElementById('dynamic-chart-secondary-type');
    const bgSel = document.getElementById('dynamic-chart-background-stat');
    const primaryShow = document.getElementById('dynamic-chart-primary-show');
    const secondaryShow = document.getElementById('dynamic-chart-secondary-show');
    if (!primarySel) return;

    const update = () => renderDynamicChart(
        primarySel.value, primaryTypeSel.value, primaryShow.checked,
        secondarySel.value, secondaryTypeSel.value, secondaryShow.checked,
        bgSel.value
    );

    [primarySel, primaryTypeSel, bgSel].forEach(el => el?.addEventListener('change', update));
    primaryShow?.addEventListener('change', update);
    secondaryShow?.addEventListener('change', update);
    secondarySel?.addEventListener('change', () => { if (secondarySel.value) secondaryShow.checked = true; update(); });
    secondaryTypeSel?.addEventListener('change', update);

    if (primarySel.value) update();
}

function initSmoothingControl() {
    const slider = document.getElementById('smoothing-slider');
    const valueDisplay = document.getElementById('smoothing-value');
    if (!slider || !valueDisplay) return;

    slider.addEventListener('input', e => {
        currentSmoothingLevel = parseInt(e.target.value, 10);
        valueDisplay.textContent = currentSmoothingLevel;

        if (originalStreamData && lastActivityData) {
            const smoothed = applySmoothingToStreams(originalStreamData, currentSmoothingLevel);
            renderStreamCharts(smoothed, lastActivityData, currentSmoothingLevel);
            renderHrMinMaxAreaChart(smoothed, currentSmoothingLevel);
            renderSpeedMinMaxAreaChart(smoothed, currentSmoothingLevel);
            populateDynamicChartData(smoothed, false);

            const primarySel = document.getElementById('dynamic-chart-primary-data');
            if (primarySel?.value) {
                renderDynamicChart(
                    primarySel.value,
                    document.getElementById('dynamic-chart-primary-type').value,
                    document.getElementById('dynamic-chart-primary-show').checked,
                    document.getElementById('dynamic-chart-secondary-data').value,
                    document.getElementById('dynamic-chart-secondary-type').value,
                    document.getElementById('dynamic-chart-secondary-show').checked,
                    document.getElementById('dynamic-chart-background-stat').value
                );
            }
        }
    });
}

// =====================================================
// 16. MAIN INITIALIZATION
// =====================================================

async function main() {
    if (!activityId) {
        document.body.innerHTML = '<div style="padding:20px;text-align:center;"><h2>Error: No Activity ID</h2><button onclick="window.history.back()">Back</button></div>';
        return;
    }

    const authPayload = getAuthPayload();
    if (!authPayload) {
        document.body.innerHTML = '<div style="padding:20px;text-align:center;"><h2>Not authenticated</h2><p>Please log in to Strava.</p><button onclick="window.history.back()">Back</button></div>';
        return;
    }

    try {
        if (DOM.streamCharts) DOM.streamCharts.style.display = 'grid';

        const [activityData, streamData] = await Promise.all([
            fetchActivityDetails(activityId, authPayload),
            fetchActivityStreams(activityId, authPayload)
        ]);

        console.log('Bike activity loaded:', activityData.name, '|', activityData.sport_type || activityData.type);

        originalStreamData = JSON.parse(JSON.stringify(streamData));
        lastActivityData = activityData;
        activityData._streamData = streamData;

        populateDynamicChartData(originalStreamData, true);
        const initialSmoothed = applySmoothingToStreams(originalStreamData, currentSmoothingLevel);
        populateDynamicChartData(initialSmoothed, false);

        renderActivityInfo(activityData);
        renderActivityStats(activityData, streamData);
        renderAdvancedStats(activityData);
        renderActivityMap(activityData);
        renderSplitsCharts(activityData);
        renderStreamCharts(initialSmoothed, activityData, currentSmoothingLevel);
        renderPowerCurveChart(streamData);
        renderCadenceSpeedChart(streamData);
        renderHrZoneDistributionChart(streamData);
        renderHrMinMaxAreaChart(initialSmoothed, currentSmoothingLevel);
        renderSpeedMinMaxAreaChart(initialSmoothed, currentSmoothingLevel);
        renderLaps(activityData.laps);
        renderLapsChart(activityData.laps);
        renderSegments(activityData.segment_efforts);
        renderBestEfforts(activityData.best_efforts);
        renderBikeClassifier(activityData, streamData);

        initSmoothingControl();
        initDynamicChartControls();

        if (DOM.streamCharts) DOM.streamCharts.style.display = '';

    } catch (error) {
        console.error('Failed to load bike activity:', error);
        document.body.innerHTML = `
            <div style="padding:20px;text-align:center;color:#c00;">
                <h2>Error Loading Activity</h2>
                <p>${error.message}</p>
                <button onclick="window.history.back()">Back</button>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', main);
