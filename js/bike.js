/**
 * BIKE.JS - Cycling Activity Details Page Controller
 * Handles fetching, processing, and rendering cycling activity data with comprehensive charts and stats
 * Entry point: Query parameter ?id={activityId}
 */

// =====================================================
// 1. INITIALIZATION & CONFIGURATION
// =====================================================

const CONFIG = {
    USER_MAX_HR: 195,
    WINDOW_SIZES: {
        altitude: 50,
        speed: 200,
        heartrate: 80,
        cadence: 60,
        watts: 100,
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
    bikeClassifier: document.getElementById('bike-classifier-results'),
    hrZonesChart: document.getElementById('hr-zones-chart'),
    powerCurveChart: document.getElementById('power-curve-chart'),
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
    speed: [],
    altitude: [],
    cadence: [],
    watts: [],
};

// Original unsmoothed dynamic chart data (for secondary and background stats)
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

// Bike classification result
let currentBikeClassification = null;

/**
 * Gets chart colors based on bike classification
 */
function getBikeClassificationBasedColors() {
    if (!currentBikeClassification || !currentBikeClassification.top || currentBikeClassification.top.length === 0) {
        return chartColors; // Default colors
    }

    const primaryType = currentBikeClassification.top[0].type;

    // Define color schemes for different bike types
    const colorSchemes = {
        'Road Bike': {
            heartrate: { primary: 'rgb(255, 20, 147)', secondary: 'rgba(255, 20, 147, 0.3)' }, // Deep Pink
            speed: { primary: 'rgb(0, 191, 255)', secondary: 'rgba(0, 191, 255, 0.3)' }, // Deep Sky Blue
            altitude: { primary: 'rgb(105, 105, 105)', secondary: 'rgba(105, 105, 105, 0.3)' },
            cadence: { primary: 'rgb(30, 144, 255)', secondary: 'rgba(30, 144, 255, 0.3)' }, // Dodger Blue
            watts: { primary: 'rgb(138, 43, 226)', secondary: 'rgba(138, 43, 226, 0.3)' }, // Blue Violet
        },
        'Mountain Bike': {
            heartrate: { primary: 'rgb(34, 139, 34)', secondary: 'rgba(34, 139, 34, 0.3)' }, // Forest Green
            speed: { primary: 'rgb(160, 82, 45)', secondary: 'rgba(160, 82, 45, 0.3)' }, // Sienna
            altitude: { primary: 'rgb(139, 69, 19)', secondary: 'rgba(139, 69, 19, 0.3)' }, // Saddle Brown
            cadence: { primary: 'rgb(0, 100, 0)', secondary: 'rgba(0, 100, 0, 0.3)' }, // Dark Green
            watts: { primary: 'rgb(85, 107, 47)', secondary: 'rgba(85, 107, 47, 0.3)' }, // Dark Olive Green
        }
    };

    return colorSchemes[primaryType] || chartColors;
}

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
 * Formats speed (m/s) into km/h
 */
function formatSpeed(speedInMps) {
    if (!speedInMps || speedInMps === 0) return '-';
    return (speedInMps * 3.6).toFixed(1) + ' km/h';
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

        coordinates.push([lat * 1e-5, lng * 1e-5]);
    }
    return coordinates;
}

// =====================================================
// 3. DATA FETCHING & PROCESSING
// =====================================================

/**
 * Fetches activity data from API
 */
async function fetchActivityData(id) {
    try {
        const response = await fetch(`../api/strava-activity.js?id=${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching activity data:', error);
        throw error;
    }
}

/**
 * Fetches activity streams from API
 */
async function fetchActivityStreams(id) {
    try {
        const response = await fetch(`../api/strava-streams.js?id=${id}&keys=distance,time,heartrate,altitude,cadence,watts,velocity_smooth`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching activity streams:', error);
        throw error;
    }
}

/**
 * Processes raw activity data into display format
 */
function processActivityData(activity) {
    const processed = {
        id: activity.id,
        name: activity.name,
        type: activity.type,
        date: formatDate(activity.start_date),
        time: formatTime(activity.moving_time),
        distance: (activity.distance / 1000).toFixed(2) + ' km',
        elevation: activity.total_elevation_gain + ' m',
        avgSpeed: formatSpeed(activity.average_speed),
        maxSpeed: formatSpeed(activity.max_speed),
        avgHeartrate: activity.average_heartrate ? Math.round(activity.average_heartrate) + ' bpm' : '-',
        maxHeartrate: activity.max_heartrate ? Math.round(activity.max_heartrate) + ' bpm' : '-',
        avgCadence: activity.average_cadence ? Math.round(activity.average_cadence) + ' rpm' : '-',
        avgWatts: activity.average_watts ? Math.round(activity.average_watts) + ' W' : '-',
        sufferScore: activity.suffer_score || '-',
        calories: activity.calories ? Math.round(activity.calories) + ' kcal' : '-',
        gear: activity.gear?.name || '-',
        description: activity.description || '',
        photoCount: activity.photos?.count || 0,
        kudosCount: activity.kudos_count || 0,
        commentCount: activity.comment_count || 0,
        achievementCount: activity.achievement_count || 0,
        prCount: activity.pr_count || 0,
        hasLaps: activity.has_laps || false,
        hasSplits: activity.has_splits || false,
        hasSegments: activity.segment_efforts?.length > 0 || false,
        hasBestEfforts: activity.best_efforts?.length > 0 || false,
        mapPolyline: activity.map?.polyline || null,
    };

    return processed;
}

/**
 * Processes stream data with smoothing
 */
function processStreamData(streams, smoothingLevel = 100) {
    const processed = {
        distance: streams.distance?.data || [],
        time: streams.time?.data || [],
        heartrate: streams.heartrate?.data || [],
        altitude: streams.altitude?.data || [],
        cadence: streams.cadence?.data || [],
        watts: streams.watts?.data || [],
        velocity_smooth: streams.velocity_smooth?.data || [],
    };

    // Calculate speed from distance/time if velocity_smooth not available
    if (!processed.velocity_smooth.length && processed.distance.length && processed.time.length) {
        processed.velocity_smooth = [];
        for (let i = 1; i < Math.min(processed.distance.length, processed.time.length); i++) {
            const dDist = processed.distance[i] - processed.distance[i - 1];
            const dTime = processed.time[i] - processed.time[i - 1];
            if (dDist > 0 && dTime > 0) {
                processed.velocity_smooth.push(dDist / dTime);
            } else {
                processed.velocity_smooth.push(processed.velocity_smooth[processed.velocity_smooth.length - 1] || 0);
            }
        }
    }

    // Apply smoothing if level > 0
    if (smoothingLevel > 0) {
        const smooth = (arr, window) => {
            if (!arr.length) return arr;
            const result = [];
            for (let i = 0; i < arr.length; i++) {
                const start = Math.max(0, i - window);
                const end = Math.min(arr.length, i + window + 1);
                const sum = arr.slice(start, end).reduce((a, b) => a + (b || 0), 0);
                const count = end - start;
                result.push(sum / count);
            }
            return result;
        };

        const windowSizes = CONFIG.WINDOW_SIZES;
        processed.heartrate = smooth(processed.heartrate, windowSizes.heartrate * smoothingLevel / 100);
        processed.altitude = smooth(processed.altitude, windowSizes.altitude * smoothingLevel / 100);
        processed.cadence = smooth(processed.cadence, windowSizes.cadence * smoothingLevel / 100);
        processed.watts = smooth(processed.watts, windowSizes.watts * smoothingLevel / 100);
        processed.velocity_smooth = smooth(processed.velocity_smooth, windowSizes.speed * smoothingLevel / 100);
    }

    return processed;
}

// =====================================================
// 4. UI RENDERING FUNCTIONS
// =====================================================

/**
 * Renders activity overview information
 */
function renderActivityInfo(activity) {
    DOM.info.innerHTML = `
        <h3>📊 Activity Overview</h3>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Name:</span>
                <span class="info-value">${activity.name}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Date:</span>
                <span class="info-value">${activity.date}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Type:</span>
                <span class="info-value">${activity.type}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Gear:</span>
                <span class="info-value">${activity.gear}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Moving Time:</span>
                <span class="info-value">${activity.time}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Distance:</span>
                <span class="info-value">${activity.distance}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Elevation Gain:</span>
                <span class="info-value">${activity.elevation}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Suffer Score:</span>
                <span class="info-value">${activity.sufferScore}</span>
            </div>
        </div>
        ${activity.description ? `<div class="activity-description"><h4>Description:</h4><p>${activity.description}</p></div>` : ''}
    `;
}

/**
 * Renders activity statistics
 */
function renderActivityStats(activity) {
    DOM.stats.innerHTML = `
        <h3>📈 Key Statistics</h3>
        <div class="stats-grid">
            <div class="stat-item">
                <span class="stat-label">Avg Speed:</span>
                <span class="stat-value">${activity.avgSpeed}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Max Speed:</span>
                <span class="stat-value">${activity.maxSpeed}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Avg Heart Rate:</span>
                <span class="stat-value">${activity.avgHeartrate}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Max Heart Rate:</span>
                <span class="stat-value">${activity.maxHeartrate}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Avg Cadence:</span>
                <span class="stat-value">${activity.avgCadence}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Avg Power:</span>
                <span class="stat-value">${activity.avgWatts}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Calories:</span>
                <span class="stat-value">${activity.calories}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Achievements:</span>
                <span class="stat-value">${activity.achievementCount}</span>
            </div>
        </div>
    `;
}

/**
 * Renders advanced metrics
 */
function renderActivityAdvanced(activity) {
    DOM.advanced.innerHTML = `
        <h3>🔧 Advanced Metrics</h3>
        <div class="advanced-grid">
            <div class="advanced-item">
                <span class="advanced-label">Kudos:</span>
                <span class="advanced-value">${activity.kudosCount}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">Comments:</span>
                <span class="advanced-value">${activity.commentCount}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">Photos:</span>
                <span class="advanced-value">${activity.photoCount}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">PRs:</span>
                <span class="advanced-value">${activity.prCount}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">Has Laps:</span>
                <span class="advanced-value">${activity.hasLaps ? 'Yes' : 'No'}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">Has Splits:</span>
                <span class="advanced-value">${activity.hasSplits ? 'Yes' : 'No'}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">Has Segments:</span>
                <span class="advanced-value">${activity.hasSegments ? 'Yes' : 'No'}</span>
            </div>
            <div class="advanced-item">
                <span class="advanced-label">Has Best Efforts:</span>
                <span class="advanced-value">${activity.hasBestEfforts ? 'Yes' : 'No'}</span>
            </div>
        </div>
    `;
}

/**
 * Renders the activity map
 */
function renderActivityMap(activity, streams) {
    if (!activity.mapPolyline) {
        DOM.map.innerHTML = '<p>No map data available</p>';
        return;
    }

    const coordinates = decodePolyline(activity.mapPolyline);
    if (!coordinates.length) {
        DOM.map.innerHTML = '<p>Unable to decode map data</p>';
        return;
    }

    // Initialize map
    const map = L.map(DOM.map).setView(coordinates[0], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add route polyline
    const polyline = L.polyline(coordinates, { color: 'red', weight: 3 }).addTo(map);

    // Fit map to route
    map.fitBounds(polyline.getBounds());

    // Store map instance for cleanup
    chartInstances.map = map;
}

/**
 * Renders bike type classification
 */
function renderBikeClassifier(activity, streams) {
    const classification = window.classifyBike(activity, streams);
    const topTypes = classification.top;

    // Store classification for chart styling
    currentBikeClassification = classification;

    let html = '<div class="classification-results">';

    if (topTypes.length > 0) {
        html += '<div class="top-classification">';
        html += `<h4>Primary Type: ${topTypes[0].type} (${topTypes[0].pct}%)</h4>`;
        if (topTypes.length > 1) {
            html += `<p>Secondary: ${topTypes[1].type} (${topTypes[1].pct}%)</p>`;
        }
        html += '</div>';

        html += '<div class="classification-breakdown">';
        html += '<h4>Classification Breakdown:</h4>';
        html += '<ul>';
        classification.all.forEach(item => {
            html += `<li>${item.type}: ${item.pct}% (${item.abs > 0 ? '+' : ''}${item.abs})</li>`;
        });
        html += '</ul>';
        html += '</div>';
    } else {
        html += '<p>Unable to classify bike type</p>';
    }

    html += '</div>';
    DOM.bikeClassifier.innerHTML = html;
}

// =====================================================
// 5. CHART RENDERING FUNCTIONS
// =====================================================

/**
 * Renders heart rate zones chart
 */
function renderHRZonesChart(activity, streams) {
    // Implementation similar to run.js but adapted for bike
    // ... (would need to implement HR zones calculation)
    DOM.hrZonesChart.parentElement.style.display = 'none'; // Hide for now
}

/**
 * Renders power curve chart
 */
function renderPowerCurveChart(activity, streams) {
    const ctx = DOM.powerCurveChart.getContext('2d');

    // Calculate power curve data
    const powerData = streams.watts || [];
    const timeData = streams.time || [];

    if (!powerData.length || !timeData.length) {
        DOM.powerCurveChart.parentElement.parentElement.style.display = 'none';
        return;
    }

    // Calculate average power over different durations
    const durations = [1, 5, 10, 30, 60, 300, 600, 1200, 1800, 3600]; // seconds
    const powerCurve = durations.map(duration => {
        let maxAvg = 0;
        for (let i = 0; i < powerData.length - duration; i++) {
            const avg = powerData.slice(i, i + duration).reduce((a, b) => a + b, 0) / duration;
            maxAvg = Math.max(maxAvg, avg);
        }
        return maxAvg;
    });

    const data = {
        labels: durations.map(d => d < 60 ? `${d}s` : `${d / 60}min`),
        datasets: [{
            label: 'Max Average Power (W)',
            data: powerCurve,
            borderColor: chartColors.watts.primary,
            backgroundColor: chartColors.watts.secondary,
            fill: true,
            tension: 0.4
        }]
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Estimated Power Curve'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Power (W)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Duration'
                    }
                }
            }
        }
    };

    chartInstances.powerCurve = new Chart(ctx, config);
}

/**
 * Renders cadence vs speed scatter chart
 */
function renderCadenceSpeedChart(streams) {
    const ctx = document.getElementById('chart-cadence-speed').getContext('2d');

    const cadenceData = streams.cadence || [];
    const speedData = streams.velocity_smooth || [];

    if (!cadenceData.length || !speedData.length) {
        document.getElementById('chart-cadence-speed').parentElement.style.display = 'none';
        return;
    }

    // Sample data points (take every 10th point to avoid overcrowding)
    const sampledCadence = [];
    const sampledSpeed = [];
    const step = Math.max(1, Math.floor(Math.min(cadenceData.length, speedData.length) / 1000));

    for (let i = 0; i < Math.min(cadenceData.length, speedData.length); i += step) {
        if (cadenceData[i] > 0 && speedData[i] > 0) {
            sampledCadence.push(cadenceData[i]);
            sampledSpeed.push(speedData[i] * 3.6); // Convert to km/h
        }
    }

    const data = {
        datasets: [{
            label: 'Cadence vs Speed',
            data: sampledCadence.map((c, i) => ({ x: sampledSpeed[i], y: c })),
            borderColor: chartColors.cadence.primary,
            backgroundColor: chartColors.cadence.secondary,
            pointRadius: 2,
            showLine: false
        }]
    };

    const config = {
        type: 'scatter',
        data: data,
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Cadence vs Speed'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Speed (km/h)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Cadence (rpm)'
                    },
                    beginAtZero: true
                }
            }
        }
    };

    chartInstances.cadenceSpeed = new Chart(ctx, config);
}

// =====================================================
// 6. MAIN EXECUTION
// =====================================================

/**
 * Main initialization function
 */
async function init() {
    console.log('Initializing activity page for ID:', activityId);
    try {
        // Fetch data
        const [activityData, streamsData] = await Promise.all([
            fetchActivityData(activityId),
            fetchActivityStreams(activityId)
        ]);

        console.log('Fetched activity data:', activityData);

        // Process data
        const processedActivity = processActivityData(activityData);
        console.log('Processed activity data:', processedActivity);
        const processedStreams = processStreamData(streamsData, currentSmoothingLevel);

        // Store for smoothing updates
        lastActivityData = processedActivity;
        lastStreamData = processedStreams;
        originalStreamData = processStreamData(streamsData, 0);

        // Render UI
        renderActivityInfo(processedActivity);
        renderActivityStats(processedActivity);
        renderActivityAdvanced(processedActivity);
        renderActivityMap(processedActivity, processedStreams);
        renderBikeClassifier(activityData, streamsData);
        renderHRZonesChart(activityData, streamsData);
        renderPowerCurveChart(activityData, processedStreams);
        renderCadenceSpeedChart(processedStreams);

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Error initializing activity page:', error);
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <h2>Error Loading Activity</h2>
                <p>${error.message}</p>
                <button onclick="window.close()">Close</button>
            </div>
        `;
    }
}

/**
 * Sets up event listeners
 */
function setupEventListeners() {
    // Smoothing slider
    const smoothingSlider = document.getElementById('smoothing-slider');
    const smoothingValue = document.getElementById('smoothing-value');

    if (smoothingSlider && smoothingValue) {
        smoothingSlider.addEventListener('input', (e) => {
            currentSmoothingLevel = parseInt(e.target.value);
            smoothingValue.textContent = currentSmoothingLevel;

            if (lastActivityData && originalStreamData) {
                const smoothedStreams = processStreamData(originalStreamData, currentSmoothingLevel);
                updateChartsWithNewData(smoothedStreams);
            }
        });
    }

    // Dynamic chart controls
    setupDynamicChartControls();
}

/**
 * Updates charts with new smoothed data
 */
function updateChartsWithNewData(newStreams) {
    // Update dynamic chart data
    updateDynamicChartData(newStreams);

    // Re-render charts that use stream data
    // ... (implement chart updates)
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}