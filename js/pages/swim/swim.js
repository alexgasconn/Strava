/**
 * SWIM.JS - Swimming Activity Details Page Controller
 * Specialized for swimming metrics: pace (min/100m), strokes, splits
 * Entry point: Query parameter ?id={activityId}
 */

import { formatDate as sharedFormatDate } from '../../shared/utils/index.js';
import { renderWeatherAnalysis, renderWeatherMapDetails } from '../../shared/utils/weather-analysis.js';

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

function calculateVariability(data) {
    return calculateCoefficient(data);
}

function getAvailableRouteColorModes(streams) {
    const modes = [{ value: 'route', label: 'Route' }];
    if (streams?.heartrate?.data?.length > 0) modes.push({ value: 'heartrate', label: 'Heart Rate' });
    if (streams?.cadence?.data?.length > 0) modes.push({ value: 'cadence', label: 'Cadence' });
    if (streams?.altitude?.data?.length > 0) modes.push({ value: 'altitude', label: 'Altitude' });
    if (streams?.velocity_smooth?.data?.length > 0) {
        modes.push({ value: 'speed', label: 'Speed' });
        modes.push({ value: 'pace', label: 'Pace' });
    }
    return modes;
}

function syncRouteColorSelect(select, streams) {
    if (!select) return 'route';
    const availableModes = getAvailableRouteColorModes(streams);
    const currentValue = select.value;
    select.innerHTML = availableModes.map(mode => `<option value="${mode.value}">${mode.label}</option>`).join('');
    select.value = availableModes.some(mode => mode.value === currentValue) ? currentValue : 'route';
    return select.value;
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

function renderActivityMap(activity, streams) {
    const section = document.getElementById('activity-map-container');
    if (!DOM.map || !section) return;

    const polyline = activity.map?.summary_polyline || activity.map?.polyline;
    if (!polyline || !window.L) {
        section.classList.add('hidden');
        renderWeatherAnalysis(activity, []);
        return;
    }

    const coords = decodePolyline(polyline);
    if (!coords.length) {
        section.classList.remove('hidden');
        DOM.map.innerHTML = '<p>No route data available (empty polyline).</p>';
        renderWeatherAnalysis(activity, []);
        return;
    }

    section.classList.remove('hidden');
    DOM.map.innerHTML = '';
    if (window.swimActivityMap) {
        window.swimActivityMap.remove();
        window.swimActivityMap = null;
    }

    const map = L.map('activity-map').setView(coords[0], 13);
    window.swimActivityMap = map;
    const style = document.getElementById('activity-map-style')?.value || 'osm';
    const layer = MAP_LAYERS[style] || MAP_LAYERS.osm;
    L.tileLayer(layer.url, layer.options).addTo(map);

    const routeSelect = document.getElementById('route-color-mode');
    const availableModes = getAvailableRouteColorModes(streams);
    if (routeSelect) {
        const currentValue = routeSelect.value;
        routeSelect.innerHTML = availableModes.map(mode => `<option value="${mode.value}">${mode.label}</option>`).join('');
        routeSelect.value = availableModes.some(mode => mode.value === currentValue) ? currentValue : 'route';
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

    return athleteId === TARGET_ATHLETE_ID || fullName === 'alex gascon' || username === 'gascn_alex' || username === 'alexgasconn' || username === 'alexgascon';
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

    const name = activity.name;
    const pageTitle = document.getElementById('activity-page-title');
    if (pageTitle && name) pageTitle.textContent = name;
    document.title = name ? `${name} | Swim Performance Deck` : 'Swim Performance Deck';
    const description = activity.description || '';
    const date = formatDate(new Date(activity.start_date_local));
    const activityType = 'Swimming';
    const gearId = activity.gear_id || activity.gear?.id || null;
    const gear = activity.gear?.name || activity.gear_name || (gearId ? `Gear ${gearId}` : null);
    const kudosValue = Number(activity.kudos_count);
    const commentValue = Number(activity.comment_count);
    const kudos = Number.isFinite(kudosValue) ? kudosValue : null;
    const commentCount = Number.isFinite(commentValue) ? commentValue : null;
    const tempStr = activity.average_temp !== undefined && activity.average_temp !== null ? `${activity.average_temp}°C` : null;
    const stravaUrl = activity.id ? `https://www.strava.com/activities/${activity.id}` : null;
    const heroDate = document.getElementById('activity-hero-date');
    const heroDescription = document.getElementById('activity-hero-description');
    const heroType = document.getElementById('activity-hero-type');
    const heroGear = document.getElementById('activity-hero-gear');
    const heroKudos = document.getElementById('activity-hero-kudos');
    const heroComments = document.getElementById('activity-hero-comments');
    const heroLink = document.getElementById('activity-hero-strava-link');

    if (heroDate) heroDate.textContent = date;
    if (heroDescription) heroDescription.textContent = description || 'No description provided.';
    if (heroType) heroType.textContent = activityType;
    if (heroGear) {
        heroGear.innerHTML = gearId
            ? `<a href="../html/gear.html?id=${gearId}">${gear || gearId}</a>`
            : (gear || 'No gear');
    }
    if (heroKudos) heroKudos.textContent = `❤️ ${kudos !== null ? kudos : '—'}`;
    if (heroComments) heroComments.textContent = `💬 ${commentCount !== null ? commentCount : '—'}`;
    if (heroLink && stravaUrl) heroLink.href = stravaUrl;
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
    const calories = activity.calories !== undefined && activity.calories !== null ? activity.calories : null;
    const hrAvg = activity.average_heartrate !== undefined && activity.average_heartrate !== null ? Math.round(activity.average_heartrate) : null;
    const hrMax = activity.max_heartrate !== undefined && activity.max_heartrate !== null ? Math.round(activity.max_heartrate) : null;
    const totalStrokes = activity.total_strokes !== undefined && activity.total_strokes !== null ? activity.total_strokes : null;
    const fields = [];
    const pushField = (label, value) => {
        if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'Not available' || value === '-' || value === 'null') return;
        fields.push(`<li><b>${label}:</b> ${value}</li>`);
    };

    pushField('Duration', duration);
    pushField('Distance', `${distanceM} m (${distanceKm} km)`);
    pushField('Pace', pace);
    pushField('Total Strokes', totalStrokes);
    pushField('Avg HR', hrAvg ? `${hrAvg} bpm` : null);
    pushField('Max HR', hrMax ? `${hrMax} bpm` : null);
    pushField('Calories', calories);

    DOM.stats.innerHTML = `
        <h3>Stats</h3>
        <ul>
            ${fields.join('')}
        </ul>
    `;
}
function renderActivityAdvanced(activity) {
    if (!DOM.advanced) return;

    const movingTime = activity.moving_time || 0;
    const elapsedTime = activity.elapsed_time || 0;
    const distance = activity.distance || 0;
    const totalStrokes = Number(activity.total_strokes);
    const avgStrokesPerM = distance > 0 && Number.isFinite(totalStrokes) && totalStrokes > 0
        ? (totalStrokes / distance).toFixed(2)
        : null;
    const poolLength = Number(activity.pool_length);
    const swolCount = activity.swolf_score !== undefined && activity.swolf_score !== null ? activity.swolf_score : null;
    const lapSource = activity.laps?.length > 1 ? activity.laps : activity.splits_swim;
    const paceVariability = lapSource?.length > 1
        ? calculateVariability(lapSource.map(item => item.average_speed ? 100 / item.average_speed : null), 0)
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

    pushField('Moving Time', formatTime(movingTime));
    pushField('Elapsed Time', formatTime(elapsedTime));
    pushField('Move Ratio', moveRatio);
    pushField('Pool Length', Number.isFinite(poolLength) && poolLength > 0 ? `${poolLength}m` : null);
    pushField('SWOLF Score', swolCount);
    pushField('Strokes per Meter', avgStrokesPerM);
    pushField('Pace CV (Splits)', paceVariability);
    pushField('HR CV (Splits)', hrVariability);

    DOM.advanced.innerHTML = `
        <h3>Advanced</h3>
        <ul>
            ${fields.join('')}
        </ul>
    `;
}

/**
 * Renders stroke breakdown if available
 */
function renderStrokeBreakdown(activity) {
    const section = document.getElementById('stroke-section');
    if (!section || !activityStrokes || activityStrokes.length === 0) {
        if (section) section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const strokeTypes = {
        0: 'Unknown',
        1: 'Freestyle',
        2: 'Backstroke',
        3: 'Breaststroke',
        4: 'Butterfly',
        5: 'Mixed',
        6: 'Drill'
    };

    const strokeBreakdown = activityStrokes.map(stroke => {
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
    const paces = laps.map(lap => (lap.average_speed && lap.average_speed > 0) ? 100 / lap.average_speed : 0);
    const positivePaces = paces.filter(p => p > 0);
    const minPace = Math.min(...positivePaces);
    const maxPace = Math.max(...positivePaces);

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
                        label: ctx => `Pace: ${formatSwimPace(laps[ctx.dataIndex].average_speed)}`,
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
        section.style.display = '';
        section.innerHTML = `
            <h3>Heart Rate Distribution</h3>
            <p class="empty-state">No heart rate stream is available for this swim.</p>
        `;
        return;
    }

    section.style.display = '';

    if (!zones || zones.length === 0) {
        section.innerHTML = `
            <h3>Heart Rate Distribution</h3>
            <p class="empty-state">No heart rate zones are configured for this swim.</p>
        `;
        return;
    }

    const heartrateStream = lastStreamData.heartrate;
    const timeStream = lastStreamData.time;
    const timeInZones = calculateTimeInZones(heartrateStream, timeStream, zones);
    const labels = zones.map((zone, index) => {
        const maxLabel = zone.max === -1 ? '∞' : zone.max;
        return `Z${index + 1} (${zone.min}-${maxLabel})`;
    });
    const data = timeInZones.map(time => +(time / 60).toFixed(1));

    createChart('hr-zones-chart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Time in Zone (min)',
                data,
                backgroundColor: ['#fde0e0', '#fababa', '#fa7a7a', '#f44336', '#b71c1c'].slice(0, zones.length),
                borderColor: ['#fde0e0', '#fababa', '#fa7a7a', '#f44336', '#b71c1c'].slice(0, zones.length),
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
                        label: context => `${context.dataset.label}: ${context.parsed.y} min`
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
        renderActivityMap(activityData, streams);
        renderStrokeBreakdown(activityData);
        renderLaps(activityData.laps);
        renderLapsChart(activityData.laps);

        // Get zones from localStorage for HR zone rendering
        const cachedZones = JSON.parse(localStorage.getItem('strava_zones') || '[]');
        if (cachedZones.length > 0) {
            renderHRZones(activityData, cachedZones);
        } else {
            renderHRZones(activityData, []);
        }

        renderStreamCharts(streams, activityData);

    } catch (error) {
        console.error('Error loading activity page:', error);
        document.body.innerHTML = `<div style="padding: 20px; color: red;"><h2>Error Loading Activity</h2><p>${error.message}</p></div>`;
    }
}

// Load page when DOM is ready
document.addEventListener('DOMContentLoaded', loadActivityPage);
