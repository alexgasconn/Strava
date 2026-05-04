/**
 * BIKE.JS - Cycling Activity Details Page Controller
 * Handles fetching, processing, and rendering cycling activity data
 * Entry point: Query parameter ?id={activityId}
 */

import { formatDate as sharedFormatDate } from '../../shared/utils/index.js';
import { renderWeatherAnalysis, renderWeatherMapDetails } from '../../shared/utils/weather-analysis.js';

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

const MAP_LAYERS = {
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' },
    },
    'carto-light': {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' },
    },
    'carto-dark': {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' },
    },
    'open-topo': {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        options: { maxZoom: 17, attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap' },
    },
    'esri-sat': {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { maxZoom: 20, attribution: 'Tiles &copy; Esri' },
    },
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

function calculateBestAveragePower(wattsData, durationSec) {
    if (!Array.isArray(wattsData) || wattsData.length < durationSec || durationSec <= 0) return null;
    let best = 0;
    for (let i = 0; i <= wattsData.length - durationSec; i++) {
        let sum = 0;
        for (let j = 0; j < durationSec; j++) sum += (wattsData[i + j] || 0);
        const avg = sum / durationSec;
        if (avg > best) best = avg;
    }
    return Math.round(best);
}

function estimatePowerDataFromStreams(streams, activity = null) {
    const distance = streams?.distance?.data;
    const time = streams?.time?.data;
    const speedStream = streams?.velocity_smooth?.data;
    const altitude = streams?.altitude?.data;

    const sampleCount = Math.max(
        distance?.length || 0,
        time?.length || 0,
        speedStream?.length || 0,
        altitude?.length || 0
    );

    if (sampleCount < 2) return [];

    const mass = 75;
    const cda = 0.35;
    const crr = 0.004;
    const airDensity = 1.225;
    const gravity = 9.81;
    const estimated = new Array(sampleCount).fill(0);

    for (let i = 0; i < sampleCount; i++) {
        let speedMs = Number.isFinite(speedStream?.[i]) ? speedStream[i] : null;

        if (!Number.isFinite(speedMs) && i > 0 && Number.isFinite(distance?.[i]) && Number.isFinite(distance?.[i - 1]) && Number.isFinite(time?.[i]) && Number.isFinite(time?.[i - 1])) {
            const deltaDistance = distance[i] - distance[i - 1];
            const deltaTime = time[i] - time[i - 1];
            speedMs = deltaTime > 0 ? deltaDistance / deltaTime : 0;
        }

        if (!Number.isFinite(speedMs) || speedMs <= 0) {
            estimated[i] = 0;
            continue;
        }

        let grade = 0;
        if (i > 0 && Number.isFinite(altitude?.[i]) && Number.isFinite(altitude?.[i - 1]) && Number.isFinite(distance?.[i]) && Number.isFinite(distance?.[i - 1])) {
            const deltaDistance = distance[i] - distance[i - 1];
            if (deltaDistance > 0) {
                grade = (altitude[i] - altitude[i - 1]) / deltaDistance;
                grade = Math.max(-0.2, Math.min(0.2, grade));
            }
        }

        const gravityPower = mass * gravity * grade * speedMs;
        const rollingPower = mass * gravity * crr * speedMs;
        const aeroPower = 0.5 * airDensity * cda * Math.pow(speedMs, 3);
        estimated[i] = Math.max(0, gravityPower + rollingPower + aeroPower);
    }

    const positiveSamples = estimated.filter(w => w > 0);
    if (!positiveSamples.length) return estimated;

    const targetAverage = activity?.average_watts || activity?.weighted_average_watts || null;
    if (targetAverage) {
        const estimatedAverage = positiveSamples.reduce((sum, value) => sum + value, 0) / positiveSamples.length;
        if (estimatedAverage > 0) {
            const scaleFactor = targetAverage / estimatedAverage;
            return estimated.map(value => Math.round(Math.max(0, value * scaleFactor)));
        }
    }

    return estimated.map(value => Math.round(value));
}

function getPowerData(streams, activity = null) {
    const measured = streams?.watts?.data
        ?.filter(w => w !== null && Number.isFinite(w) && w >= 0) || [];

    if (measured.some(w => w > 0)) {
        return { data: measured, source: 'measured' };
    }

    const estimated = estimatePowerDataFromStreams(streams, activity);
    if (estimated.some(w => w > 0)) {
        return { data: estimated, source: 'estimated' };
    }

    return { data: [], source: null };
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
    const name = activity.name || 'Cycling Activity';
    const pageTitle = document.getElementById('activity-page-title');
    if (pageTitle && name) pageTitle.textContent = name;
    document.title = name ? `${name} | Bike Performance Lab` : 'Bike Performance Lab';
    const description = activity.description || '';
    const date = formatDate(new Date(activity.start_date_local || activity.start_date));
    const gearId = activity.gear_id || activity.gear?.id || null;
    const gear = activity.gear?.name || activity.gear_name || (gearId ? `Gear ${gearId}` : null);
    const kudosValue = Number(activity.kudos_count);
    const commentsValue = Number(activity.comment_count);
    const kudos = Number.isFinite(kudosValue) ? kudosValue : null;
    const comments = Number.isFinite(commentsValue) ? commentsValue : null;
    const tempStr = activity.average_temp !== undefined && activity.average_temp !== null ? `${activity.average_temp}°C` : null;
    const stravaUrl = activity.id ? `https://www.strava.com/activities/${activity.id}` : null;
    const fields = [];
    const pushField = (label, value) => {
        if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'Not available' || value === '-' || value === 'null') return;
        fields.push(`<li><b>${label}:</b> ${value}</li>`);
    };

    const heroDate = document.getElementById('activity-hero-date');
    const heroDescription = document.getElementById('activity-hero-description');
    const heroType = document.getElementById('activity-hero-type');
    const heroGear = document.getElementById('activity-hero-gear');
    const heroKudos = document.getElementById('activity-hero-kudos');
    const heroComments = document.getElementById('activity-hero-comments');
    const heroLink = document.getElementById('activity-hero-strava-link');

    if (heroDate) heroDate.textContent = date;
    if (heroDescription) heroDescription.textContent = description || 'No description provided.';
    if (heroType) heroType.textContent = activity.sport_type || activity.type || 'Ride';
    if (heroGear) {
        heroGear.innerHTML = gearId
            ? `<a href="../html/gear.html?id=${gearId}">${gear || gearId}</a>`
            : (gear || 'No gear');
    }
    if (heroKudos) heroKudos.textContent = `❤️ ${kudos !== null ? kudos : '—'}`;
    if (heroComments) heroComments.textContent = `💬 ${comments !== null ? comments : '—'}`;
    if (heroLink && stravaUrl) heroLink.href = stravaUrl;
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
    const calories = activity.calories !== undefined && activity.calories !== null ? activity.calories : null;
    const hrAvg = activity.average_heartrate !== undefined && activity.average_heartrate !== null ? Math.round(activity.average_heartrate) : null;
    const hrMax = activity.max_heartrate !== undefined && activity.max_heartrate !== null ? Math.round(activity.max_heartrate) : null;
    const avgWatts = activity.average_watts !== undefined && activity.average_watts !== null ? Math.round(activity.average_watts) + ' W' : null;
    const maxWatts = activity.max_watts !== undefined && activity.max_watts !== null ? Math.round(activity.max_watts) + ' W' : null;
    const avgCadence = activity.average_cadence !== undefined && activity.average_cadence !== null ? Math.round(activity.average_cadence) + ' rpm' : null;
    const weightedWatts = activity.weighted_average_watts !== undefined && activity.weighted_average_watts !== null ? Math.round(activity.weighted_average_watts) + ' W' : null;

    let npDisplay = weightedWatts;
    if (!npDisplay && streams?.watts?.data) {
        const np = calculateNormalizedPower(streams.watts.data);
        if (np) npDisplay = np + ' W';
    }

    const fields = [];
    const pushField = (label, value) => {
        if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'Not available' || value === '-' || value === 'null') return;
        fields.push(`<li><b>${label}:</b> ${value}</li>`);
    };

    pushField('Duration', duration);
    pushField('Distance', `${distanceKm} km`);
    pushField('Avg Speed', avgSpeed);
    pushField('Max Speed', maxSpeed);
    pushField('Elevation Gain', `${elevation} m`);
    pushField('Elev/km', elevPerKm);
    pushField('Calories', calories);
    pushField('HR Avg', hrAvg ? `${hrAvg} bpm` : null);
    pushField('HR Max', hrMax ? `${hrMax} bpm` : null);
    pushField('Avg Power', avgWatts);
    pushField('Normalized Power', npDisplay);
    pushField('Max Power', maxWatts);
    pushField('Avg Cadence', avgCadence);

    DOM.stats.innerHTML = `
        <h3>Stats</h3>
        <ul>
            ${fields.join('')}
        </ul>
    `;
}

function renderAdvancedStats(activity) {
    if (!DOM.advanced) return;
    const kudos = activity.kudos_count || 0;
    const comments = activity.comment_count || 0;
    const photos = activity.photos?.count || 0;
    const prs = activity.pr_count !== undefined && activity.pr_count !== null ? activity.pr_count : null;
    const achievements = activity.achievement_count !== undefined && activity.achievement_count !== null ? activity.achievement_count : null;
    const sufferScore = activity.suffer_score !== undefined && activity.suffer_score !== null ? activity.suffer_score : null;
    const perceived = activity.perceived_exertion !== undefined && activity.perceived_exertion !== null ? activity.perceived_exertion : null;
    const hasLaps = activity.laps?.length > 0;
    const hasSegments = activity.segment_efforts?.length > 0;
    const deviceName = activity.device_name || '-';

    const lapSource = activity.laps?.length > 1 ? activity.laps : activity.splits_metric;
    const speedVariability = lapSource?.length > 1
        ? calculateVariability(lapSource.map(item => item.average_speed ? item.average_speed * 3.6 : null), 0)
        : '-';
    const hrVariability = lapSource?.length > 1
        ? calculateVariability(lapSource.map(item => item.average_heartrate ?? null), 0)
        : '-';
    const moveRatio = activity.elapsed_time
        ? `${((activity.moving_time / activity.elapsed_time) * 100).toFixed(1)}%`
        : '-';

    const fields = [];
    const pushField = (label, value) => {
        if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'Not available' || value === '-' || value === 'null') return;
        fields.push(`<li><b>${label}:</b> ${value}</li>`);
    };

    pushField('Device', deviceName);
    pushField('Suffer Score', sufferScore);
    pushField('Perceived Effort', perceived);
    pushField('PRs', prs);
    pushField('Achievements', achievements);
    pushField('Kudos', kudos);
    pushField('Comments', comments);
    pushField('Photos', photos);
    pushField('Move Ratio', moveRatio);
    pushField('Speed CV (Splits)', speedVariability);
    pushField('HR CV (Splits)', hrVariability);

    DOM.advanced.innerHTML = `
        <h3>Advanced</h3>
        <ul>
            ${fields.join('')}
            ${hasLaps ? `<li><b>Laps:</b> ${activity.laps.length}</li>` : ''}
            ${hasSegments ? `<li><b>Segments:</b> ${activity.segment_efforts.length}</li>` : ''}
        </ul>
    `;
}

function resampleSeries(values, targetLength) {
    if (!Array.isArray(values) || values.length === 0 || targetLength <= 0) return [];
    if (targetLength === values.length) return values.slice();
    if (targetLength === 1) return [values[0]];

    const resampled = [];
    for (let i = 0; i < targetLength; i++) {
        const ratio = i / (targetLength - 1);
        const position = ratio * (values.length - 1);
        const left = Math.floor(position);
        const right = Math.ceil(position);
        const mix = position - left;
        const leftValue = Number(values[left]);
        const rightValue = Number(values[right]);

        if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) {
            resampled.push(null);
        } else if (!Number.isFinite(rightValue) || left === right) {
            resampled.push(Number.isFinite(leftValue) ? leftValue : rightValue);
        } else if (!Number.isFinite(leftValue)) {
            resampled.push(rightValue);
        } else {
            resampled.push(leftValue + (rightValue - leftValue) * mix);
        }
    }
    return resampled;
}

function valueToRouteColor(value, minValue, maxValue) {
    if (!Number.isFinite(value) || !Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue === minValue) {
        return '#FC5200';
    }
    const normalized = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
    const hue = 220 - (normalized * 220);
    return `hsl(${hue}, 90%, 55%)`;
}

function getRouteColorSeries(streams, mode, pointCount) {
    if (!streams || mode === 'route') return null;

    let source = null;
    if (mode === 'heartrate') source = streams.heartrate?.data;
    if (mode === 'cadence') source = streams.cadence?.data;
    if (mode === 'watts') source = streams.watts?.data;
    if (mode === 'altitude') source = streams.altitude?.data;
    if (mode === 'speed') source = streams.velocity_smooth?.data?.map(v => v * 3.6) || null;
    if (mode === 'pace') source = streams.velocity_smooth?.data?.map(v => (v > 0 ? 60 / (v * 3.6) : null)) || null;

    if (!source || !Array.isArray(source) || source.length < 2) return null;
    return resampleSeries(source, pointCount);
}

// =====================================================
// 6. RENDERING — MAP
// =====================================================

function renderActivityMap(activity, streams) {
    if (!DOM.map) return;
    const polyline = activity.map?.summary_polyline || activity.map?.polyline;
    if (polyline && window.L) {
        const coords = decodePolyline(polyline);
        if (coords.length > 0) {
            DOM.map.innerHTML = '';
            if (window.activityRouteMap) {
                window.activityRouteMap.remove();
                window.activityRouteMap = null;
            }
            const map = L.map('activity-map').setView(coords[0], 13);
            window.activityRouteMap = map;
            const style = document.getElementById('activity-map-style')?.value || 'osm';
            const layer = MAP_LAYERS[style] || MAP_LAYERS.osm;
            L.tileLayer(layer.url, layer.options).addTo(map);

            const routeSelect = document.getElementById('route-color-mode');
            if (routeSelect) {
                const modes = [
                    { value: 'route', label: 'Route' },
                    ...(streams?.heartrate?.data?.length > 0 ? [{ value: 'heartrate', label: 'Heart Rate' }] : []),
                    ...(streams?.cadence?.data?.length > 0 ? [{ value: 'cadence', label: 'Cadence' }] : []),
                    ...(streams?.watts?.data?.length > 0 ? [{ value: 'watts', label: 'Power' }] : []),
                    ...(streams?.altitude?.data?.length > 0 ? [{ value: 'altitude', label: 'Altitude' }] : []),
                    ...(streams?.velocity_smooth?.data?.length > 0 ? [{ value: 'speed', label: 'Speed' }, { value: 'pace', label: 'Pace' }] : []),
                ];
                const currentValue = routeSelect.value;
                routeSelect.innerHTML = modes.map(mode => `<option value="${mode.value}">${mode.label}</option>`).join('');
                routeSelect.value = modes.some(mode => mode.value === currentValue) ? currentValue : 'route';
            }

            const colorMode = routeSelect?.value || 'route';
            const routeValues = getRouteColorSeries(streams, colorMode, coords.length);

            if (routeValues) {
                const finiteValues = routeValues.filter(Number.isFinite);
                const minValue = Math.min(...finiteValues);
                const maxValue = Math.max(...finiteValues);
                const group = L.featureGroup().addTo(map);

                for (let i = 1; i < coords.length; i++) {
                    const value = routeValues[i] ?? routeValues[i - 1];
                    const color = valueToRouteColor(value, minValue, maxValue);
                    L.polyline([coords[i - 1], coords[i]], { color, weight: 4, opacity: 0.9 }).addTo(group);
                }

                map.fitBounds(group.getBounds());
            } else {
                const polylineLayer = L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
                map.fitBounds(polylineLayer.getBounds());
            }

            const mapStyleSelect = document.getElementById('activity-map-style');
            if (mapStyleSelect && !mapStyleSelect.dataset.bound) {
                mapStyleSelect.dataset.bound = '1';
                mapStyleSelect.addEventListener('change', () => renderActivityMap(activity, streams));
            }

            if (routeSelect && !routeSelect.dataset.bound) {
                routeSelect.dataset.bound = '1';
                routeSelect.addEventListener('change', () => renderActivityMap(activity, streams));
            }

            const weatherToggle = document.getElementById('show-weather-details');
            if (weatherToggle && !weatherToggle.dataset.bound) {
                weatherToggle.dataset.bound = '1';
                weatherToggle.addEventListener('change', () => renderActivityMap(activity, streams));
            }

            renderWeatherAnalysis(activity, coords);
            renderWeatherMapDetails(activity, coords, map, weatherToggle?.checked);
        } else {
            DOM.map.innerHTML = '<p>No route data (empty polyline).</p>';
            renderWeatherAnalysis(activity, []);
            renderWeatherMapDetails(activity, [], null, false);
        }
    } else {
        DOM.map.innerHTML = '<p>No route data available.</p>';
        renderWeatherAnalysis(activity, []);
        renderWeatherMapDetails(activity, [], null, false);
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

function setChartContainerVisibility(canvasId, visible) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    canvas.parentElement.style.display = visible ? '' : 'none';
}

function moveAndHideCustomChartSection() {
    const section = document.getElementById('dynamic-chart-section');
    if (!section) return;

    section.classList.add('hidden');
    const container = section.closest('.container');
    const closeBtn = container?.querySelector('button[onclick="window.close()"]');
    if (container && closeBtn) {
        container.insertBefore(section, closeBtn);
    }
}

function isSectionVisible(el) {
    if (!el) return false;
    return !el.classList.contains('hidden') && el.style.display !== 'none';
}

function syncSideBySideContainers() {
    const containers = document.querySelectorAll('.side-by-side-container');
    containers.forEach(container => {
        const sections = Array.from(container.querySelectorAll(':scope > .data-section'));
        if (!sections.length) return;
        const hasVisible = sections.some(isSectionVisible);
        container.style.display = hasVisible ? '' : 'none';
    });
}

function renderBikeProfileChart(streams, smoothingLevel = 100) {
    const section = document.getElementById('bike-profile-section');
    if (!section) return;

    if (!streams?.distance?.data?.length || !streams?.altitude?.data?.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    const f = smoothingLevel / 100;
    const window = Math.max(1, Math.round(CONFIG.WINDOW_SIZES.altitude * f));
    const labels = streams.distance.data.map(d => (d / 1000).toFixed(2));
    const altitude = rollingMean(streams.altitude.data, window);

    createChart('bike-profile-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Elevation (m)',
                data: altitude,
                borderColor: '#4b5563',
                backgroundColor: 'rgba(75, 85, 99, 0.22)',
                fill: true,
                tension: 0.25,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Distance (km)' } },
                y: { title: { display: true, text: 'Elevation (m)' }, beginAtZero: false }
            }
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

    const hasAltitude = !!altitude?.data?.length;
    const hasSpeed = !!(time?.data?.length && distance?.data?.length);
    const hasHeartrate = !!heartrate?.data?.length;
    const hasCadence = !!cadence?.data?.length;
    const hasWatts = !!watts?.data?.some(w => w > 0);

    setChartContainerVisibility('chart-altitude', hasAltitude);
    setChartContainerVisibility('chart-speed-distance', hasSpeed);
    setChartContainerVisibility('chart-heart-distance', hasHeartrate);
    setChartContainerVisibility('chart-cadence-distance', hasCadence);
    setChartContainerVisibility('chart-watts-distance', hasWatts);

    if (hasAltitude) {
        createStreamChart('chart-altitude', 'Altitude (m)', rollingMean(altitude.data, ws.altitude), 'altitude', distLabels);
    }

    if (hasSpeed) {
        const speedKmh = [null];
        for (let i = 1; i < distance.data.length; i++) {
            const dD = distance.data[i] - distance.data[i - 1];
            const dT = time.data[i] - time.data[i - 1];
            speedKmh.push(dD > 0 && dT > 0 ? (dD / dT) * 3.6 : null);
        }
        createStreamChart('chart-speed-distance', 'Speed (km/h)', rollingMean(speedKmh, ws.speed), 'speed', distLabels);
    }

    if (hasHeartrate) {
        createStreamChart('chart-heart-distance', 'Heart Rate (bpm)', rollingMean(heartrate.data, ws.heartrate), 'heartrate', distLabels);
    }

    if (hasCadence) {
        createStreamChart('chart-cadence-distance', 'Cadence (rpm)', rollingMean(cadence.data, ws.cadence), 'cadence', distLabels);
    }

    if (hasWatts) {
        createStreamChart('chart-watts-distance', 'Power (W)', rollingMean(watts.data, ws.watts), 'watts', distLabels);
    }
}

// =====================================================
// 9. RENDERING — POWER CURVE
// =====================================================

function renderPowerCurveChart(streams, activity) {
    const section = document.getElementById('power-curve-section');
    if (!section) return;

    const powerData = getPowerData(streams, activity);
    if (!powerData.data.length) { section.style.display = 'none'; return; }
    section.style.display = '';

    const curve = calculatePowerCurve(powerData.data);

    createChart('power-curve-chart', {
        type: 'line',
        data: {
            labels: curve.map(c => c.duration < 60 ? `${c.duration}s` : c.duration < 3600 ? `${c.duration / 60}min` : `${c.duration / 3600}h`),
            datasets: [{
                label: powerData.source === 'estimated' ? 'Best Avg Estimated Power (W)' : 'Best Avg Power (W)', data: curve.map(c => c.power),
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

function renderPowerProfile(streams, activity) {
    const section = document.getElementById('bike-power-profile');
    const container = document.getElementById('bike-power-metrics');
    if (!section || !container) return;

    const powerData = getPowerData(streams, activity);
    if (!powerData.data.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    const watts = powerData.data;
    const np = activity?.weighted_average_watts ? Math.round(activity.weighted_average_watts) : calculateNormalizedPower(watts);
    const best5s = calculateBestAveragePower(watts, 5);
    const best1m = calculateBestAveragePower(watts, 60);
    const best5m = calculateBestAveragePower(watts, 300);
    const best20m = calculateBestAveragePower(watts, 1200);
    const ftpEst = best20m ? Math.round(best20m * 0.95) : null;

    const cards = [
        { label: 'Normalized Power', value: np ? `${np} W` : 'N/A' },
        { label: 'Best 5s', value: best5s ? `${best5s} W` : 'N/A' },
        { label: 'Best 1min', value: best1m ? `${best1m} W` : 'N/A' },
        { label: 'Best 5min', value: best5m ? `${best5m} W` : 'N/A' },
        { label: 'Best 20min', value: best20m ? `${best20m} W` : 'N/A' },
        { label: 'Estimated FTP', value: ftpEst ? `${ftpEst} W` : 'N/A' },
    ];

    container.innerHTML = cards.map(card => `
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; background:#fff;">
            <div style="font-size:0.78rem; color:#6b7280; margin-bottom:4px;">${card.label}</div>
            <div style="font-size:1.1rem; font-weight:700; color:#111827;">${card.value}</div>
        </div>
    `).join('');
}

function getClimbCategory(elevation, distanceKm) {
    if (elevation > 1000 || distanceKm > 20) return 'HC';
    if (elevation >= 500 || distanceKm >= 10) return 'Cat 1';
    if (elevation >= 250 || distanceKm >= 5) return 'Cat 2';
    if (elevation >= 100 || distanceKm >= 2) return 'Cat 3';
    return 'Cat 4';
}

function detectClimbsFromStreams(streams) {
    const distance = streams?.distance?.data;
    const altitude = streams?.altitude?.data;
    const time = streams?.time?.data;
    if (!distance || !altitude || distance.length < 3 || altitude.length < 3) return [];

    const climbs = [];
    let current = null;

    for (let i = 1; i < distance.length; i++) {
        const dDist = distance[i] - distance[i - 1];
        if (dDist < 5) continue;
        const dElev = altitude[i] - altitude[i - 1];
        const grade = (dElev / dDist) * 100;

        if (grade >= 3 && dElev > 0) {
            if (!current) {
                current = {
                    startIdx: i - 1,
                    endIdx: i,
                    elevationGain: Math.max(0, dElev),
                    distanceM: dDist,
                };
            } else {
                current.endIdx = i;
                current.elevationGain += Math.max(0, dElev);
                current.distanceM += dDist;
            }
            continue;
        }

        if (current) {
            const distanceKm = current.distanceM / 1000;
            const avgGrade = current.distanceM > 0 ? (current.elevationGain / current.distanceM) * 100 : 0;
            if (distanceKm >= 0.3 && current.elevationGain >= 20 && avgGrade >= 3) {
                const durationSec = (time && time[current.endIdx] != null && time[current.startIdx] != null)
                    ? time[current.endIdx] - time[current.startIdx]
                    : null;
                const vam = durationSec && durationSec > 0 ? Math.round(current.elevationGain / (durationSec / 3600)) : null;
                climbs.push({
                    distanceKm,
                    elevationGain: Math.round(current.elevationGain),
                    avgGrade: +avgGrade.toFixed(1),
                    durationSec,
                    vam,
                    category: getClimbCategory(current.elevationGain, distanceKm),
                });
            }
            current = null;
        }
    }

    return climbs.sort((a, b) => b.elevationGain - a.elevationGain);
}

function renderClimbInsights(streams) {
    const section = document.getElementById('climbs-section');
    const container = document.getElementById('climbs-list');
    if (!section || !container) return;

    const climbs = detectClimbsFromStreams(streams);
    if (!climbs.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = climbs.slice(0, 8).map((climb, index) => `
        <div style="border:1px solid #e5e7eb; border-left:4px solid #FC5200; border-radius:8px; padding:10px 12px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong>Climb ${index + 1}</strong>
                <span style="font-size:0.78rem; background:#FC5200; color:white; border-radius:999px; padding:2px 8px;">${climb.category}</span>
            </div>
            <div style="font-size:0.86rem; color:#374151; line-height:1.45;">
                <div>Distance: ${climb.distanceKm.toFixed(2)} km</div>
                <div>Elevation: +${climb.elevationGain} m</div>
                <div>Avg Grade: ${climb.avgGrade}%</div>
                <div>Duration: ${climb.durationSec ? formatTime(climb.durationSec) : 'N/A'}</div>
                <div>VAM: ${climb.vam ? `${climb.vam} m/h` : 'N/A'}</div>
            </div>
        </div>
    `).join('');
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
    const section = document.getElementById('hr-zones-section');
    if (!canvas || !section) return;
    if (!streams?.heartrate || !streams?.time) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

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
            renderBikeProfileChart(smoothed, currentSmoothingLevel);
            renderHrMinMaxAreaChart(smoothed, currentSmoothingLevel);
            renderSpeedMinMaxAreaChart(smoothed, currentSmoothingLevel);
            populateDynamicChartData(smoothed, false);
            syncSideBySideContainers();

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
        moveAndHideCustomChartSection();

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
        renderActivityMap(activityData, streamData);
        renderBikeProfileChart(initialSmoothed, currentSmoothingLevel);
        renderSplitsCharts(activityData);
        renderStreamCharts(initialSmoothed, activityData, currentSmoothingLevel);
        renderClimbInsights(streamData);
        renderPowerProfile(streamData, activityData);
        renderPowerCurveChart(streamData, activityData);
        renderCadenceSpeedChart(streamData);
        renderHrZoneDistributionChart(streamData);
        renderHrMinMaxAreaChart(initialSmoothed, currentSmoothingLevel);
        renderSpeedMinMaxAreaChart(initialSmoothed, currentSmoothingLevel);
        renderLaps(activityData.laps);
        renderLapsChart(activityData.laps);
        renderSegments(activityData.segment_efforts);
        renderBestEfforts(activityData.best_efforts);
        renderBikeClassifier(activityData, streamData);
        syncSideBySideContainers();

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
