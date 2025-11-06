// js/activity.js


//NO OFFICIAL

// --- 1. IMPORTACIONES ---
import * as utils from './utils.js';
import { classifyRun } from './classifyRun.js';

// --- 2. CONSTANTES GLOBALES Y ESTADO ---
const USER_MAX_HR = 195;
let activityCharts = {};

// --- 3. FUNCIONES AUXILIARES ---
export function decodePolyline(str) {
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


export function estimateVO2max(act, userMaxHr = USER_MAX_HR) {
    if (!act.distance || !act.moving_time || !act.average_heartrate || act.moving_time === 0) return '-';
    const vel_m_min = (act.distance / act.moving_time) * 60;
    const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
    const percent_max_hr = act.average_heartrate / userMaxHr;
    if (percent_max_hr < 0.5 || percent_max_hr > 1.2) return '-';
    const vo2max = vo2_at_pace / percent_max_hr;
    return vo2max.toFixed(1);
}


export function rollingMean(arr, windowSize = 25) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
        const windowSlice = arr.slice(start, end); // Renombrado de 'window' a 'windowSlice'
        const mean = windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length;
        result.push(mean);
    }
    return result;
}


export function calculateVariability(data, applySmoothing = false) {
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


export function calculateTimeInZones(heartrateStream, timeStream, zones) {
    if (!heartrateStream || !timeStream || !zones || zones.length === 0 || !heartrateStream.data || !timeStream.data) {
        return Array(zones.length).fill(0);
    }

    const timeInZones = Array(zones.length).fill(0);

    for (let i = 1; i < heartrateStream.data.length; i++) {
        const hr = heartrateStream.data[i];
        if (hr === null || hr === undefined) continue;
        const deltaTime = timeStream.data[i] - timeStream.data[i - 1];
        if (deltaTime <= 0) continue; // Asegura que el tiempo avance

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


function createActivityChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found.`);
        return;
    }
    if (activityCharts[canvasId]) {
        activityCharts[canvasId].destroy();
    }
    activityCharts[canvasId] = new Chart(canvas, config);
}


// --- 4. LÓGICA DE LA API ---

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
    const streamTypes = 'distance,time,heartrate,altitude,cadence';
    const result = await fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, authPayload);
    console.log('Fetched streams:', result);
    return result.streams;
}


// --- 5. FUNCIONES DE RENDERIZADO (exportadas) ---

export function renderActivityDetails(act) {
    console.log('Rendering activity:', act);
    const activityInfoDiv = document.getElementById('activity-info');
    const activityStatsDiv = document.getElementById('activity-stats');
    const activityAdvancedDiv = document.getElementById('activity-advanced');

    // --- Info principales ---
    const name = act.name;
    const description = act.description || '';
    const date = new Date(act.start_date_local).toLocaleString();
    const typeLabels = ['Workout', 'Race', 'Long Run', 'Workout'];
    const activityType = act.workout_type !== undefined ? typeLabels[act.workout_type] || 'Other' : (act.type || 'Other');
    const gear = act.gear?.name || 'N/A';
    const kudos = act.kudos_count || 0;
    const commentCount = act.comment_count || 0;
    let tempStr = 'Not available';
    if (act.average_temp !== undefined && act.average_temp !== null) {
        tempStr = `${act.average_temp}°C`;
    }

    // --- Stats ---
    const distanceKm = (act.distance / 1000).toFixed(2);
    const duration = utils.formatTime(act.moving_time);
    const pace = utils.formatPace(act.average_speed);
    const elevation = act.total_elevation_gain !== undefined ? act.total_elevation_gain : '-';
    const elevationPerKm = act.distance > 0 ? (act.total_elevation_gain / (act.distance / 1000)).toFixed(2) : '-';
    const calories = act.calories !== undefined ? act.calories : '-';
    const hrAvg = act.average_heartrate ? Math.round(act.average_heartrate) : '-';
    const hrMax = act.max_heartrate ? Math.round(act.max_heartrate) : '-';

    // --- Advanced stats ---
    const moveRatio = act.elapsed_time ? (act.moving_time / act.elapsed_time).toFixed(2) : '-';
    const effort = act.suffer_score !== undefined ? act.suffer_score : (act.perceived_exertion !== undefined ? act.perceived_exertion : '-');
    const vo2max = estimateVO2max(act);
    const prCount = act.pr_count !== undefined ? act.pr_count : '-';
    const athleteCount = act.athlete_count !== undefined ? act.athlete_count : '-';
    const achievementCount = act.achievement_count !== undefined ? act.achievement_count : '-';

    // Se asignan las variabilidades calculadas en main()
    const paceVariabilityStream = act.pace_variability_stream || '-';
    const hrVariabilityStream = act.hr_variability_stream || '-';
    const paceVariabilityLaps = act.pace_variability_laps || '-';
    const hrVariabilityLaps = act.hr_variability_laps || '-';

    activityInfoDiv.innerHTML = `
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
    activityAdvancedDiv.innerHTML = `
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

    activityStatsDiv.innerHTML = `
        <h3>Stats</h3>
        <ul>
            <li><b>Duration:</b> ${duration}</li>
            <li><b>Distance:</b> ${distanceKm} km</li>
            <li><b>Pace:</b> ${pace}</li>
            <li><b>Elevation Gain:</b> ${elevation} m</li>
            <li><b>Calories:</b> ${calories}</li>
            <li><b>HR Avg:</b> ${hrAvg} bpm</li>
            <li><b>HR Max:</b> ${hrMax} bpm</li>
        </ul>
    `;
}

/**
 * Renderiza el mapa de la actividad.
 * @param {object} act - Objeto de actividad.
 */
export function renderActivityMap(act) {
    const mapDiv = document.getElementById('activity-map');
    if (!mapDiv) return;

    if (act.map?.summary_polyline && window.L) {
        const coords = decodePolyline(act.map.summary_polyline);
        if (coords.length > 0) {
            mapDiv.innerHTML = "";
            const map = L.map('activity-map').setView(coords[0], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
        } else {
            mapDiv.innerHTML = '<p>No route data available (empty polyline).</p>';
        }
    } else {
        mapDiv.innerHTML = '<p>No route data available or Leaflet not loaded.</p>';
    }
}

/**
 * Renderiza los gráficos de splits (ritmo y FC por kilómetro).
 * @param {object} act - Objeto de actividad.
 */
export function renderSplitsCharts(act) {
    const splitsSection = document.getElementById('splits-section');
    if (!splitsSection) return;

    if (act.splits_metric && act.splits_metric.length > 0) {
        splitsSection.classList.remove('hidden');
        const kmLabels = act.splits_metric.map((_, i) => `Km ${i + 1}`);
        const paceData = act.splits_metric.map(s => s.average_speed ? 1000 / s.average_speed : null);
        const hrData = act.splits_metric.map(s => s.average_heartrate || null);

        createActivityChart('chart-pace', {
            type: 'line',
            data: { labels: kmLabels, datasets: [{ label: 'Pace (s/km)', data: paceData, borderColor: '#FC5200' }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { reverse: true, title: { display: true, text: 'Pace (min/km)' } } }
            }
        });
        createActivityChart('chart-heartrate', {
            type: 'line',
            data: { labels: kmLabels, datasets: [{ label: 'HR Avg (bpm)', data: hrData, borderColor: 'red' }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { title: { display: true, text: 'Heart Rate (bpm)' } } }
            }
        });
    } else {
        splitsSection.classList.add('hidden');
    }
}

/**
 * Renderiza los gráficos de streams (altitud, ritmo, FC, cadencia vs distancia).
 * @param {object} streams - Streams de datos de la actividad.
 * @param {object} act - Objeto de actividad (usado para tipo de actividad en cadencia).
 */
export function renderStreamCharts(streams, act) {
    const streamChartsDiv = document.getElementById('stream-charts');
    if (!streamChartsDiv) return;

    if (!streams || !streams.distance || !streams.distance.data || streams.distance.data.length === 0) {
        streamChartsDiv.innerHTML = '<p>No detailed stream data available for this activity.</p>';
        return;
    }

    const { distance, time, heartrate, altitude, cadence } = streams;
    const distLabels = distance.data.map(d => (d / 1000).toFixed(2));

    function createSingleStreamChart(canvasId, label, data, color, yAxisReverse = false) {
        createActivityChart(canvasId, {
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

    if (altitude && altitude.data) {
        createSingleStreamChart('chart-altitude', 'Altitud (m)', altitude.data, '#888');
    }

    if (time && time.data) {
        const paceStreamData = [];
        for (let i = 1; i < distance.data.length; i++) {
            const deltaDist = distance.data[i] - distance.data[i - 1];
            const deltaTime = time.data[i] - time.data[i - 1];
            if (deltaDist > 0 && deltaTime > 0) {
                const speed = deltaDist / deltaTime; // m/s
                paceStreamData.push(1000 / speed / 60); // Ritmo en min/km
            } else {
                paceStreamData.push(null);
            }
        }
        const windowSize = 100;
        const smoothPaceStreamData = rollingMean(paceStreamData, windowSize);
        const paceLabels = distLabels.slice(1); // Ajustar etiquetas para el ritmo

        createActivityChart('chart-pace-distance', {
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

    if (heartrate && heartrate.data) {
        createSingleStreamChart('chart-heart-distance', 'FC (bpm)', heartrate.data, 'red');
    }

    if (cadence && cadence.data) {
        const cadenceData = act.type && act.type.includes('Run') ? cadence.data.map(c => c * 2) : cadence.data;
        createSingleStreamChart('chart-cadence-distance', 'Cadencia (spm)', cadenceData, '#0074D9');
    }
}

/**
 * Renderiza la tabla de los mejores esfuerzos (Best Efforts).
 * @param {Array<object>} bestEfforts - Array de objetos de mejores esfuerzos.
 */
export function renderBestEfforts(bestEfforts) {
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
        const pace = utils.formatPace(effort.distance / effort.moving_time);
        const achievements = effort.pr_rank ? `🏆 PR #${effort.pr_rank}` : (effort.achievements.length > 0 ? '🏅' : '');
        return `
        <tr>
            <td>${effort.name}</td>
            <td>${utils.formatTime(effort.moving_time)}</td>
            <td>${pace} /km</td>
            <td>${achievements}</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

/**
 * Renderiza la tabla de vueltas (Laps).
 * @param {Array<object>} laps - Array de objetos de vueltas.
 */
export function renderLaps(laps) {
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
        const pace = utils.formatPace(lap.average_speed);
        return `
        <tr>
            <td>${lap.lap_index}</td>
            <td>${(lap.distance / 1000).toFixed(2)} km</td>
            <td>${utils.formatTime(lap.moving_time)}</td>
            <td>${pace} /km</td>
            <td>${Math.round(lap.total_elevation_gain)} m</td>
            <td>${lap.average_heartrate ? Math.round(lap.average_heartrate) : '-'} bpm</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

/**
 * Renderiza la tabla de esfuerzos de segmento (Segments Efforts).
 * @param {Array<object>} segments - Array de objetos de esfuerzos de segmento.
 */
export function renderSegments(segments) {
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
        const pace = utils.formatPace(effort.distance / effort.moving_time);
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
            <td>${utils.formatTime(effort.moving_time)}</td>
            <td>${pace} /km</td>
            <td>${effort.average_heartrate ? Math.round(effort.average_heartrate) : '-'} bpm</td>
            <td>${rank}</td>
        </tr>`;
    }).join('');

    table.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

/**
 * Renderiza los resultados del clasificador de carreras.
 * @param {object} classificationData - Datos de clasificación de la carrera.
 */
export function renderClassifierResults(classificationData) {
    const container = document.getElementById('run-classifier-results');
    if (!container) return;

    const results = classificationData ? classificationData.top : null;
    console.log("Classification Diagnostics:", classificationData.diagnostics);

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

/**
 * Renderiza el gráfico de distribución de tiempo en zonas de FC.
 * @param {object} streams - Streams de datos de la actividad.
 */
export function renderHrZoneDistributionChart(streams) {
    const canvas = document.getElementById('hr-zones-chart');
    if (!canvas) return;

    if (!streams.heartrate || !streams.time) {
        canvas.innerHTML = '<p style="text-align:center; padding:2rem;">No heart rate data for zones.</p>';
        return;
    }

    const zonesDataText = localStorage.getItem('strava_training_zones');
    if (!zonesDataText) {
        console.warn("Training zones not found in localStorage.");
        canvas.innerHTML = '<p style="text-align:center; padding:2rem;">Training zones not configured.</p>';
        return;
    }
    const allZones = JSON.parse(zonesDataText);
    const hrZones = allZones?.heart_rate?.zones?.filter(z => z.max > 0);

    if (!hrZones || hrZones.length === 0) {
        console.warn("Valid HR zones not found.");
        canvas.innerHTML = '<p style="text-align:center; padding:2rem;">Valid HR zones not found.</p>';
        return;
    }

    const timeInZones = calculateTimeInZones(streams.heartrate, streams.time, hrZones);

    const labels = hrZones.map((zone, i) => `Z${i + 1} (${zone.min}-${zone.max === -1 ? '∞' : zone.max})`);
    const data = timeInZones.map(time => +(time / 60).toFixed(1));

    const gradientColors = [
        "#fde0e0", "#fababa", "#fa7a7a", "#f44336", "#b71c1c"
    ];

    createActivityChart('hr-zones-chart', {
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
 * Renderiza el gráfico de área de HR Mín/Máx/Promedio sobre la distancia.
 * @param {object} streams - Streams de datos de la actividad.
 */
export function renderHrMinMaxAreaChart(streams) {
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
    const N_SEGMENTS = 40;
    const totalDist = dist[dist.length - 1];
    const segmentLength = totalDist / N_SEGMENTS;

    const minArr = [], maxArr = [], avgArr = [], labels = [];
    let segStart = 0, segEnd = segmentLength, i = 0;

    for (let s = 0; s < N_SEGMENTS; s++) {
        const hrVals = [];
        while (i < dist.length && dist[i] < segEnd) {
            if (hr[i] !== null && hr[i] !== undefined) hrVals.push(hr[i]);
            i++;
        }

        if (hrVals.length === 0) {
            // Si no hay datos, se repite el último valor válido o se pone null
            minArr.push(minArr.length ? minArr[minArr.length - 1] : null);
            maxArr.push(maxArr.length ? maxArr[maxArr.length - 1] : null);
            avgArr.push(avgArr.length ? avgArr[avgArr.length - 1] : null);
        } else {
            minArr.push(Math.min(...hrVals));
            maxArr.push(Math.max(...hrVals));
            avgArr.push(hrVals.reduce((a, b) => a + b, 0) / hrVals.length);
        }

        labels.push((segEnd / 1000).toFixed(2));
        segStart = segEnd;
        segEnd += segmentLength;
    }

    createActivityChart('hr-minmax-area-chart', {
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
                        label: context =>
                            `${context.dataset.label}: ${Math.round(context.parsed.y)} bpm`
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


// --- 6. FUNCIÓN PRINCIPAL DE INICIO ---
/**
 * Inicializa la página de detalles de la actividad.
 */
export async function renderActivityTab() {
    const params = new URLSearchParams(window.location.search);
    const activityId = parseInt(params.get('id'), 10);
    const detailsDiv = document.getElementById('activity-details'); // Contenedor principal

    if (!activityId) {
        if (detailsDiv) detailsDiv.innerHTML = '<p>Error: No Activity ID provided.</p>';
        return;
    }
    const authPayload = getAuthPayload();
    if (!authPayload) {
        if (detailsDiv) detailsDiv.innerHTML = '<p>You must be logged in to view activity details.</p>';
        return;
    }

    try {
        const streamChartsDiv = document.getElementById('stream-charts');
        if (streamChartsDiv) streamChartsDiv.style.display = 'grid'; // Mostrar por defecto

        const allActivitiesText = localStorage.getItem('strava_all_activities');
        const allActivities = allActivitiesText ? JSON.parse(allActivitiesText) : [];

        const [activityData, streamData] = await Promise.all([
            fetchActivityDetails(activityId, authPayload),
            fetchActivityStreams(activityId, authPayload)
        ]);

        // Cálculo de variabilidad de Streams
        activityData.pace_variability_stream = '-';
        activityData.hr_variability_stream = '-';
        if (streamData && streamData.time && streamData.distance) {
            const paceStream = [];
            for (let i = 1; i < streamData.distance.data.length; i++) {
                const deltaDist = streamData.distance.data[i] - streamData.distance.data[i - 1];
                const deltaTime = streamData.time.data[i] - streamData.time.data[i - 1];
                if (deltaDist > 0 && deltaTime > 0) {
                    paceStream.push(deltaTime / deltaDist); // s/m
                }
            }
            activityData.pace_variability_stream = calculateVariability(paceStream, true);
        }
        if (streamData && streamData.heartrate) {
            activityData.hr_variability_stream = calculateVariability(streamData.heartrate.data, true);
        }

        // Cálculo de variabilidad de Laps
        activityData.pace_variability_laps = '-';
        activityData.hr_variability_laps = '-';
        const lapsData = activityData.laps && activityData.laps.length > 1
            ? activityData.laps
            : activityData.splits_metric;

        if (lapsData && lapsData.length > 1) {
            const paceDataForCV = lapsData.map(lap => lap.average_speed);
            const hrDataForCV = lapsData.map(lap => lap.average_heartrate);
            activityData.pace_variability_laps = calculateVariability(paceDataForCV, false);
            activityData.hr_variability_laps = calculateVariability(hrDataForCV, false);
        }

        // Aplicar rolling mean a los streams antes de renderizar los gráficos de detalle
        const windowSize = 100;
        ['heartrate', 'altitude', 'cadence'].forEach(key => {
            if (streamData[key] && Array.isArray(streamData[key].data)) {
                streamData[key].data = rollingMean(streamData[key].data, windowSize);
            }
        });

        // Llamar a las funciones de renderizado
        renderActivityDetails(activityData);
        renderActivityMap(activityData);
        renderSplitsCharts(activityData);
        renderStreamCharts(streamData, activityData);
        renderBestEfforts(activityData.best_efforts);
        renderLaps(activityData.laps);
        renderSegments(activityData.segment_efforts);
        renderClassifierResults(classifyRun(activityData, streamData)); // Asegúrate de que classifyRun se importa correctamente
        renderHrMinMaxAreaChart(streamData);
        renderHrZoneDistributionChart(streamData);


        if (streamChartsDiv) streamChartsDiv.style.display = ''; // Asegurar visibilidad al finalizar

    } catch (error) {
        console.error("Failed to load activity page:", error);
        if (detailsDiv) detailsDiv.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
        const streamChartsDiv = document.getElementById('stream-charts');
        if (streamChartsDiv) streamChartsDiv.innerHTML = `<p><strong>Error loading stream data:</strong> ${error.message}</p>`;
    }
}

// El punto de entrada para la ejecución inicial del script
document.addEventListener('DOMContentLoaded', renderActivityTab);