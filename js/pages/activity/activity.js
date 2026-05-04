/**
 * ACTIVITY.JS - Activity Details Page Controller
 * Handles fetching, processing, and rendering activity data with comprehensive charts and stats
 * Entry point: Query parameter ?id={activityId}
 */

import { formatDate as sharedFormatDate, formatPace as sharedFormatPace } from '../../shared/utils/index.js';
import { AdvancedActivityAnalyzer } from './advanced-analysis.js';
import { AnalysisResultsUI } from './analysis-ui-components.js';
import { renderWeatherAnalysis, renderWeatherMapDetails } from '../../shared/utils/weather-analysis.js';

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

// Parse activity ID from URL
const params = new URLSearchParams(window.location.search);
const activityId = parseInt(params.get('id'), 10);

// Chart instances registry for cleanup
const chartInstances = {};

// Smoothing control
let currentSmoothingLevel = 100;
let originalStreamData = null; // Store unsmoothed data
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

// Original unsmoothed dynamic chart data (for secondary and background stats)
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
    return sharedFormatDate(date);
}

/**
 * Converts decimal pace (e.g. 5.5) to MM:SS string (e.g. "5:30")
 */
function paceDecimalToTime(paceDecimal) {
    if (isNaN(paceDecimal) || paceDecimal <= 0) return "–";
    const minutes = Math.floor(paceDecimal);
    const seconds = Math.round((paceDecimal - minutes) * 60);
    const adjMinutes = seconds === 60 ? minutes + 1 : minutes;
    const adjSeconds = seconds === 60 ? 0 : seconds;
    return `${adjMinutes}:${adjSeconds.toString().padStart(2, "0")}`;
}

/**
 * Formats speed (m/s) into pace (min/km)
 */
function formatPace(speedInMps) {
    if (!speedInMps || speedInMps === 0) return '-';
    return sharedFormatPace(1000 / speedInMps, 1).replace(' /km', '');
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
function calculateVariability(data, smoothingWindow = 0) {
    let processedData = data;
    if (smoothingWindow > 0) {
        processedData = rollingMean(data, smoothingWindow);
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
 * Applies smoothing to a copy of stream data based on smoothing level
 */
function applySmoothingToStreams(streams, smoothingLevel) {
    if (!streams) return null;

    const smoothingFactor = smoothingLevel / 100;
    const smoothed = JSON.parse(JSON.stringify(streams)); // Deep copy

    // Calculate window sizes based on smoothing level
    const windowSizes = {
        altitude: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.altitude * smoothingFactor)),
        heartrate: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.heartrate * smoothingFactor)),
        cadence: Math.max(1, Math.round(CONFIG.WINDOW_SIZES.cadence * smoothingFactor)),
        watts: Math.max(1, Math.round(60 * smoothingFactor)),
    };

    // Apply rolling mean to streams
    ['heartrate', 'altitude', 'cadence', 'watts'].forEach(key => {
        if (smoothed[key] && Array.isArray(smoothed[key].data)) {
            smoothed[key].data = rollingMean(smoothed[key].data, windowSizes[key]);
        }
    });

    return smoothed;
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
    if (mode === 'altitude') source = streams.altitude?.data;
    if (mode === 'watts') source = streams.watts?.data;
    if (mode === 'speed') source = streams.velocity_smooth?.data?.map(v => v * 3.6) || null;
    if (mode === 'pace') source = streams.velocity_smooth?.data?.map(v => (v > 0 ? 60 / (v * 3.6) : null)) || null;

    if (!source || !Array.isArray(source) || source.length < 2) return null;
    return resampleSeries(source, pointCount);
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

        // Apply smoothing only to primary data and smoothing-dependent charts
        if (originalStreamData && lastActivityData) {
            const smoothedStreams = applySmoothingToStreams(originalStreamData, currentSmoothingLevel);

            // Re-render stream and variability charts (affected by smoothing)
            renderStreamCharts(smoothedStreams, lastActivityData, currentSmoothingLevel);
            renderHrMinMaxAreaChart(smoothedStreams, currentSmoothingLevel);
            renderPaceMinMaxAreaChart(smoothedStreams, currentSmoothingLevel);

            // Update dynamic chart data and re-render
            populateDynamicChartData(smoothedStreams);
            const primaryData = document.getElementById('dynamic-chart-primary-data');
            if (primaryData && primaryData.value) {
                const primaryType = document.getElementById('dynamic-chart-primary-type').value;
                const primaryShow = document.getElementById('dynamic-chart-primary-show').checked;
                const secondaryData = document.getElementById('dynamic-chart-secondary-data').value;
                const secondaryType = document.getElementById('dynamic-chart-secondary-type').value;
                const secondaryShow = document.getElementById('dynamic-chart-secondary-show').checked;
                const backgroundStat = document.getElementById('dynamic-chart-background-stat').value;

                // Primary uses smoothed data; secondary and background use original
                renderDynamicChart(primaryData.value, primaryType, primaryShow, secondaryData, secondaryType, secondaryShow, backgroundStat);
            }
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
    secondaryDataSelect.addEventListener('change', () => {
        // Auto-check secondary show checkbox when secondary data is selected
        if (secondaryDataSelect.value) {
            secondaryShowCheckbox.checked = true;
        }
        updateDynamicChart();
    });
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

    // Secondary dataset (uses smoothed data)
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

    // Background stream dataset (if selected) - uses original unsmoothed data
    let backgroundPlugin = null;
    if (backgroundStat && backgroundStat !== primaryData && backgroundStat !== secondaryData) {
        const bgColor = chartColors[backgroundStat];
        datasets.push({
            label: `${getDataLabel(backgroundStat)} (background)`,
            data: originalDynamicChartData[backgroundStat],
            borderColor: bgColor.primary,
            backgroundColor: 'rgba(200, 200, 200, 0.15)',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: true,
            pointRadius: 0,
            yAxisID: 'y',
            tension: 0.3,
            order: -1,
        });
    }

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
        watts: 'Power (W)',
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
        // Prepend null to match distance array length
        data.pace = [null, ...pace];

        // Apply rolling mean smoothing to pace when not original
        if (!isOriginal) {
            const smoothingFactor = currentSmoothingLevel / 100;
            const paceWindow = Math.max(1, Math.round(CONFIG.WINDOW_SIZES.pace * smoothingFactor));
            data.pace = rollingMean(data.pace, paceWindow);
        }
    }

    // Apply cadence doubling for runs
    if (lastActivityData && lastActivityData.type === 'Run') {
        data.cadence = data.cadence.map(c => c ? c * 2 : null);
    }

    // Store in appropriate location
    if (isOriginal) {
        originalDynamicChartData = data;
    } else {
        dynamicChartData = data;
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
    const streamTypes = 'distance,time,heartrate,altitude,cadence,watts,velocity_smooth';
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
    const date = formatDate(new Date(activity.start_date_local));
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
    const avgPower = activity.average_watts ? Math.round(activity.average_watts) : null;

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
            ${avgPower ? `<li><b>Avg Power:</b> ${avgPower} W</li>` : ''}
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
function renderActivityMap(activity, streams) {
    if (!DOM.map) return;

    if (activity.map?.summary_polyline && window.L) {
        const coords = decodePolyline(activity.map.summary_polyline);
        if (coords.length > 0) {
            DOM.map.innerHTML = '';
            if (window.activitySharedMap) {
                window.activitySharedMap.remove();
                window.activitySharedMap = null;
            }

            const style = document.getElementById('activity-map-style')?.value || 'osm';
            const layer = MAP_LAYERS[style] || MAP_LAYERS.osm;
            const map = L.map('activity-map').setView(coords[0], 13);
            window.activitySharedMap = map;
            L.tileLayer(layer.url, layer.options).addTo(map);

            const colorMode = document.getElementById('activity-route-color-mode')?.value || 'route';
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
                const polyline = L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
                map.fitBounds(polyline.getBounds());
            }

            const mapStyleSelect = document.getElementById('activity-map-style');
            const routeColorSelect = document.getElementById('activity-route-color-mode');
            if (mapStyleSelect && !mapStyleSelect.dataset.bound) {
                mapStyleSelect.dataset.bound = '1';
                mapStyleSelect.addEventListener('change', () => renderActivityMap(activity, streams));
            }
            if (routeColorSelect && !routeColorSelect.dataset.bound) {
                routeColorSelect.dataset.bound = '1';
                routeColorSelect.addEventListener('change', () => renderActivityMap(activity, streams));
            }

            const weatherToggle = document.getElementById('show-weather-details');
            if (weatherToggle && !weatherToggle.dataset.bound) {
                weatherToggle.dataset.bound = '1';
                weatherToggle.addEventListener('change', () => renderActivityMap(activity, streams));
            }

            renderWeatherAnalysis(activity, coords);
            renderWeatherMapDetails(activity, coords, map, weatherToggle?.checked);
        } else {
            DOM.map.innerHTML = '<p>No route data available (empty polyline).</p>';
            renderWeatherAnalysis(activity, []);
            renderWeatherMapDetails(activity, [], null, false);
        }
    } else {
        DOM.map.innerHTML = '<p>No route data available or Leaflet not loaded.</p>';
        renderWeatherAnalysis(activity, []);
        renderWeatherMapDetails(activity, [], null, false);
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
        watts: Math.max(1, Math.round(60 * smoothingFactor)),
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

    // Power (watts) chart
    const watts = streams.watts;
    if (watts && watts.data && watts.data.some(w => w > 0)) {
        const smoothWatts = rollingMean(watts.data, windowSizes.watts);
        createStreamChart('chart-watts-distance', 'Power (W)', smoothWatts, '#9b59b6');
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
    const allZones = zonesDataText ? JSON.parse(zonesDataText) : null;
    const hrZones = allZones?.heart_rate?.zones?.filter(z => z.max > 0);

    if (hrZones && hrZones.length > 0) {
        const timeInZones = calculateTimeInZones(streams.heartrate, streams.time, hrZones);
        const labels = hrZones.map((zone, i) => `Z${i + 1} (${zone.min}-${zone.max === -1 ? '∞' : zone.max})`);
        const data = timeInZones.map(time => +(time / 60).toFixed(1));
        const gradientColors = ['#fde0e0', '#fababa', '#fa7a7a', '#f44336', '#b71c1c'];

        createChart('hr-zones-chart', {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Time in Zone (min)',
                    data,
                    backgroundColor: gradientColors.slice(0, hrZones.length),
                    borderColor: gradientColors.slice(0, hrZones.length),
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${context.parsed.y} min`,
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'HR Zone' } },
                    y: { title: { display: true, text: 'Time (min)' }, beginAtZero: true }
                }
            }
        });
        return;
    }

    const labels = streams.distance?.data?.length
        ? streams.distance.data.map(d => (d / 1000).toFixed(2))
        : streams.time.data.map(t => formatTime(t));

    createChart('hr-zones-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Heart Rate (bpm)',
                data: streams.heartrate.data,
                borderColor: '#d64b4b',
                backgroundColor: 'rgba(214, 75, 75, 0.08)',
                fill: true,
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: streams.distance?.data?.length ? 'Distance (km)' : 'Time' } },
                y: { title: { display: true, text: 'Heart Rate (bpm)' }, beginAtZero: false }
            }
        }
    });
}

/**
 * Renders HR min/max/avg area chart segmented over distance
 */
function renderHrMinMaxAreaChart(streams, smoothingLevel = 100) {
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

    // Apply smoothing to the variability arrays based on smoothing level
    const smoothingWindow = Math.max(1, Math.round(8 * smoothingLevel / 100));
    const smoothMinArr = rollingMean(minArr, smoothingWindow);
    const smoothMaxArr = rollingMean(maxArr, smoothingWindow);
    const smoothAvgArr = rollingMean(avgArr, smoothingWindow);

    createChart('hr-minmax-area-chart', {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'HR Min',
                    data: smoothMinArr,
                    fill: '+1',
                    backgroundColor: 'rgba(252,82,0,0.3)',
                    borderColor: 'rgba(252,82,0,0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'HR Max',
                    data: smoothMaxArr,
                    fill: '-1',
                    backgroundColor: 'rgba(252,82,0,0.3)',
                    borderColor: 'rgba(252,82,0,0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'HR Avg',
                    data: smoothAvgArr,
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
function renderPaceMinMaxAreaChart(streams, smoothingLevel = 100) {
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

    // Apply smoothing to the variability arrays based on smoothing level
    const smoothingWindow = Math.max(1, Math.round(8 * smoothingLevel / 100));
    const smoothMinArr = rollingMean(minArr, smoothingWindow);
    const smoothMaxArr = rollingMean(maxArr, smoothingWindow);
    const smoothAvgArr = rollingMean(avgArr, smoothingWindow);

    createChart('pace-min-max-area-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Pace Min',
                    data: smoothMinArr,
                    fill: '+1',
                    backgroundColor: 'rgba(0, 123, 255, 0.25)',
                    borderColor: 'rgba(0, 123, 255, 0.5)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Pace Max',
                    data: smoothMaxArr,
                    fill: '-1',
                    backgroundColor: 'rgba(0, 123, 255, 0.25)',
                    borderColor: 'rgba(0, 123, 255, 0.5)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Pace Avg',
                    data: smoothAvgArr,
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
    const confidence = classificationData?.confidence || null;

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

    const confidenceColor = confidence?.level === 'high'
        ? '#166534'
        : confidence?.level === 'medium'
            ? '#92400e'
            : '#991b1b';

    const confidenceHtml = confidence
        ? `<div style="margin:0 0 10px 0; padding:8px 10px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; font-size:12px; color:#334155;">
                <div style="font-weight:700; color:${confidenceColor};">Confidence: ${Math.round(confidence.score * 100)}% (${confidence.level})</div>
                <div>Feature coverage: ${confidence.coverage}% · Top-class margin: ${confidence.margin}%</div>
                ${confidence.missingFeatures?.length ? `<div style="margin-top:4px; color:#64748b;">Missing/weak signals: ${confidence.missingFeatures.join(', ')}</div>` : ''}
           </div>`
        : '';

    container.innerHTML = confidenceHtml + resultsHtml;
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
            const smoothingWindowForVariability = Math.max(1, Math.round(150 * (currentSmoothingLevel / 100)));
            paceVariabilityStream = calculateVariability(paceStream, smoothingWindowForVariability);
        }

        if (streamData && streamData.heartrate) {
            const smoothingWindowForVariability = Math.max(1, Math.round(150 * (currentSmoothingLevel / 100)));
            hrVariabilityStream = calculateVariability(streamData.heartrate.data, smoothingWindowForVariability);
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

        // Store original stream data BEFORE applying smoothing
        originalStreamData = JSON.parse(JSON.stringify(streamData));
        lastActivityData = activityData;

        // Populate original dynamic chart data (for secondary and background stats)
        populateDynamicChartData(originalStreamData, true);

        // Apply initial smoothing to streams
        const initialSmoothedStreams = applySmoothingToStreams(originalStreamData, currentSmoothingLevel);

        // Populate dynamic chart data with smoothed data (for primary stat)
        populateDynamicChartData(initialSmoothedStreams, false);

        // Render all sections
        renderActivityInfo(activityData);
        renderActivityStats(activityData);
        renderAdvancedStats(activityData);
        renderActivityMap(activityData, streamData);
        renderSplitsCharts(activityData);
        renderStreamCharts(initialSmoothedStreams, activityData, currentSmoothingLevel);
        renderBestEfforts(activityData.best_efforts);
        renderLaps(activityData.laps);
        renderLapsChart(activityData.laps);
        renderSegments(activityData.segment_efforts);
        renderClassifierResults(classifyRun(activityData, streamData));
        renderHrZoneDistributionChart(streamData);
        renderHrMinMaxAreaChart(initialSmoothedStreams, currentSmoothingLevel);
        renderPaceMinMaxAreaChart(initialSmoothedStreams, currentSmoothingLevel);

        // Initialize dynamic chart controls
        initDynamicChartControls();

        // Initialize advanced analysis button
        initAdvancedAnalysis();

        if (DOM.streamCharts) DOM.streamCharts.style.display = '';

    } catch (error) {
        console.error('Failed to load activity page:', error);
        if (DOM.details) DOM.details.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
    }
}

/**
 * Initialize advanced analysis button and handler
 */
function initAdvancedAnalysis() {
    const btn = document.getElementById('advanced-analysis-btn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        const mode = document.getElementById('analysis-mode')?.value || 'normal';
        const container = document.getElementById('analysis-results-container');
        const loading = document.getElementById('analysis-loading');
        const content = document.getElementById('analysis-content');

        if (!container || !loading || !content) return;

        // Show loading state
        container.style.display = 'block';
        loading.style.display = 'block';
        content.innerHTML = '';
        btn.disabled = true;
        btn.textContent = '⏳ Analyzing...';

        try {
            // Create analyzer instance
            const analyzer = new AdvancedActivityAnalyzer(activityId);

            // Fetch data from API
            await analyzer.fetchActivityData();

            // Run analysis
            const results = await analyzer.analyze(mode);
            console.log(`📊 Analysis results:`, results);

            // Get summary data
            const summary = analyzer.getSummary();

            // Create UI renderer
            const ui = new AnalysisResultsUI(content);

            // Render all components
            ui.renderSummary(summary);
            ui.renderInsights(results.insights || []);
            ui.renderClimbs(results.climbs || []);
            ui.renderSegments(results.segments || {});
            ui.renderExports(analyzer);

            console.log(`✅ Analysis results rendered successfully`);

            // Hide loading
            loading.style.display = 'none';

        } catch (error) {
            console.error('Analysis error:', error);
            content.innerHTML = `<div style="padding: 15px; background-color: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c00;">
                <strong>❌ Analysis failed:</strong> ${error.message}
            </div>`;
            loading.style.display = 'none';
        } finally {
            btn.disabled = false;
            btn.textContent = '🔬 Analyze Activity';
        }
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', main);
