// js/activity.js

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS AL DOM Y ESTADO INICIAL ---
    const params = new URLSearchParams(window.location.search);
    const activityId = parseInt(params.get('id'), 10);
    const activityInfoDiv = document.getElementById('activity-info');
    const activityStatsDiv = document.getElementById('activity-stats');
    const activityAdvancedDiv = document.getElementById('activity-advanced');
    const mapDiv = document.getElementById('activity-map');
    const splitsSection = document.getElementById('splits-section');
    const streamChartsDiv = document.getElementById('stream-charts');
    const detailsDiv = document.getElementById('activity-details');


    // --- 2. FUNCIONES DE UTILIDAD ---
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.round(seconds % 60);
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // function formatPace(speedInMps) {
    //     if (!speedInMps || speedInMps === 0) return '-';
    //     const paceInSecPerKm = 1000 / speedInMps;
    //     const min = Math.floor(paceInSecPerKm / 60);
    //     const sec = Math.round(paceInSecPerKm % 60);
    //     return `${min}:${sec.toString().padStart(2, '0')}`;
    // }

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

    // --- 3. LÓGICA DE LA API ---
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

    // --- 4. LÓGICA DE RENDERIZADO ---

    // =============================================
    //      NUEVA FUNCIÓN: RENDER BEST EFFORTS
    // =============================================
    function renderBestEfforts(bestEfforts) {
        const section = document.getElementById('best-efforts-section');
        const table = document.getElementById('best-efforts-table');
        if (!section || !table || !bestEfforts || bestEfforts.length === 0) return;

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


    // =============================================
    //         NUEVA FUNCIÓN: RENDER LAPS
    // =============================================
    function renderLaps(laps) {
        const section = document.getElementById('laps-section');
        const table = document.getElementById('laps-table');
        if (!section || !table || !laps || laps.length === 0) return;

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


    // =============================================
    //      NUEVA FUNCIÓN: RENDER SEGMENTS
    // =============================================
    function renderSegments(segments) {
        const section = document.getElementById('segments-section');
        const table = document.getElementById('segments-table');
        if (!section || !table || !segments || segments.length === 0) return;

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


    function renderActivity(act) {
        console.log('Rendering activity:', act);
        // --- Info principales ---
        const name = act.name;
        const description = act.description || '';
        const date = new Date(act.start_date_local).toLocaleString();
        const typeLabels = ['Workout', 'Race', 'Long Run', 'Workout'];
        const activityType = act.workout_type !== undefined ? typeLabels[act.workout_type] || 'Other' : (act.type || 'Other');
        const gear = act.gear?.name || 'N/A';
        const kudos = act.kudos_count || 0;
        const commentCount = act.comment_count || 0;

        // Temperature (average)
        let tempStr = 'Not available';
        if (act.average_temp !== undefined && act.average_temp !== null) {
            tempStr = `${act.average_temp}°C`;
        }

        // --- Stats ---
        const distanceKm = (act.distance / 1000).toFixed(2);
        const duration = formatTime(act.moving_time);
        const pace = formatPace(act.average_speed);
        const elevation = act.total_elevation_gain !== undefined ? act.total_elevation_gain : '-';
        const elevationPerKm = act.distance > 0 ? (act.total_elevation_gain / (act.distance / 1000)).toFixed(2) : '-';

        const calories = act.calories !== undefined ? act.calories : '-';
        const hrAvg = act.average_heartrate ? Math.round(act.average_heartrate) : '-';
        const hrMax = act.max_heartrate ? Math.round(act.max_heartrate) : '-';

        // --- Advanced stats ---
        const moveRatio = act.elapsed_time ? (act.moving_time / act.elapsed_time).toFixed(2) : '-';
        const effort = act.suffer_score !== undefined ? act.suffer_score : (act.perceived_exertion !== undefined ? act.perceived_exertion : '-');
        const vo2max = estimateVO2max(act);
        const distance_rank = act.distance_rank !== undefined ? act.distance_rank : '-';
        const paceVariabilityStream = act.pace_variability_stream || '-';
        const hrVariabilityStream = act.hr_variability_stream || '-';
        const paceVariabilityLaps = act.pace_variability_laps || '-';
        const hrVariabilityLaps = act.hr_variability_laps || '-';

        const prCount = act.pr_count !== undefined ? act.pr_count : '-';
        const athleteCount = act.athlete_count !== undefined ? act.athlete_count : '-';
        const achievementCount = act.achievement_count !== undefined ? act.achievement_count : '-';

        // --- Render en 3 columnas ---
        document.getElementById('activity-info').innerHTML = `
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
        document.getElementById('activity-advanced').innerHTML = `
            <h3>Advanced Stats</h3>
            <ul>
                <li><b>Distance Rank:</b> #${distance_rank}</li>
                <li><b>Elevation per Km:</b> ${elevationPerKm}</li>
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

        // --- Renderizado del mapa ---
        if (act.map?.summary_polyline && window.L) {
            const coords = decodePolyline(act.map.summary_polyline);
            if (coords.length > 0) {
                mapDiv.innerHTML = ""; // Añade esto antes de L.map(...)
                const map = L.map('activity-map').setView(coords[0], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
            }
        } else {
            mapDiv.innerHTML = '<p>No route data available</p>';
        }

        // --- Renderizado de Splits ---
        if (act.splits_metric && act.splits_metric.length > 0) {
            splitsSection.classList.remove('hidden');
            const kmLabels = act.splits_metric.map((_, i) => `Km ${i + 1}`);
            const paceData = act.splits_metric.map(s => s.average_speed ? 1000 / s.average_speed : null);
            const hrData = act.splits_metric.map(s => s.average_heartrate || null);

            new Chart(document.getElementById('chart-pace'), {
                type: 'line',
                data: { labels: kmLabels, datasets: [{ label: 'Ritmo (s/km)', data: paceData, borderColor: '#FC5200' }] }
            });
            new Chart(document.getElementById('chart-heartrate'), {
                type: 'line',
                data: { labels: kmLabels, datasets: [{ label: 'FC Media (bpm)', data: hrData, borderColor: 'red' }] }
            });
        }

        document.getElementById('activity-stats').innerHTML = `
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


    function renderStreamCharts(streams, act) {
        if (!streams || !streams.distance || !streams.distance.data || streams.distance.data.length === 0) {
            streamChartsDiv.innerHTML = '<p>No detailed stream data available for this activity.</p>';
            return;
        }

        // Limpia los gráficos previos si los hay
        ['chart-altitude', 'chart-pace-distance', 'chart-heart-distance', 'chart-cadence-distance'].forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas && canvas.chartInstance) {
                canvas.chartInstance.destroy();
                canvas.chartInstance = null;
            }
        });

        const { distance, time, heartrate, altitude, cadence } = streams;
        const distLabels = distance.data.map(d => (d / 1000).toFixed(2)); // Eje X para todos los gráficos

        // Helper para crear gráficos bonitos y limpios
        function createStreamChart(canvasId, label, data, color, yAxisReverse = false) {
            const ctx = document.getElementById(canvasId).getContext('2d');
            if (ctx.canvas.chartInstance) ctx.canvas.chartInstance.destroy();
            ctx.canvas.chartInstance = new Chart(ctx, {
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
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Distancia (km)' } },
                        y: { reverse: yAxisReverse, title: { display: true, text: label } }
                    }
                }
            });
        }

        // 1. Altitud vs Distancia
        if (altitude && altitude.data) {
            createStreamChart('chart-altitude', 'Altitud (m)', altitude.data, '#888');
        }

        // 2. Ritmo vs Distancia (Cálculo corregido)
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
            // Aplica rolling mean al ritmo calculado
            const windowSize = 100; // Usa el mismo windowSize que para los streams
            const smoothPaceStreamData = rollingMean(paceStreamData, windowSize);

            const paceLabels = distLabels.slice(1);
            const ctx = document.getElementById('chart-pace-distance').getContext('2d');
            if (ctx.canvas.chartInstance) ctx.canvas.chartInstance.destroy();
            ctx.canvas.chartInstance = new Chart(ctx, {
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
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { title: { display: true, text: 'Distancia (km)' } },
                        y: { reverse: true, title: { display: true, text: 'Ritmo (min/km)' } }
                    }
                }
            });
        }

        // 3. Frecuencia Cardíaca vs Distancia
        if (heartrate && heartrate.data) {
            createStreamChart('chart-heart-distance', 'FC (bpm)', heartrate.data, 'red');
        }

        // 4. Cadencia vs Distancia
        if (cadence && cadence.data) {
            // La cadencia de carrera se multiplica por 2 (es por pierna)
            const cadenceData = act.type === 'Run' ? cadence.data.map(c => c * 2) : cadence.data;
            createStreamChart('chart-cadence-distance', 'Cadencia (spm)', cadenceData, '#0074D9');
        }
    }

    // --- 5. PUNTO DE ENTRADA DE LA APLICACIÓN ---
    async function main() {
        if (!activityId) {
            detailsDiv.innerHTML = '<p>Error: No Activity ID provided.</p>';
            return;
        }
        const authPayload = getAuthPayload();
        if (!authPayload) {
            detailsDiv.innerHTML = '<p>You must be logged in to view activity details.</p>';
            return;
        }

        try {
            streamChartsDiv.style.display = 'grid';

            const allActivitiesText = localStorage.getItem('strava_all_activities');
            const allActivities = allActivitiesText ? JSON.parse(allActivitiesText) : [];

            const [activityData, streamData] = await Promise.all([
                fetchActivityDetails(activityId, authPayload),
                fetchActivityStreams(activityId, authPayload)
            ]);

            if (allActivities.length > 0 && activityData.type && activityData.type.includes('Run')) {
                // Filtramos solo las carreras de la lista completa
                const runs = allActivities.filter(a => a.type && a.type.includes('Run'));
                // Ordenamos por distancia para obtener el ranking
                const sortedByDistance = [...runs].sort((a, b) => b.distance - a.distance);
                // Buscamos la posición (índice) de la actividad actual en la lista ordenada
                const rankIndex = sortedByDistance.findIndex(a => a.id === activityData.id);

                if (rankIndex !== -1) {
                    // El rango es el índice + 1. Lo añadimos al objeto de la actividad.
                    activityData.distance_rank = rankIndex + 1;
                }
            }


            // =================================================================
            //       BLOQUE ACTUALIZADO: CÁLCULO DE AMBAS VARIABILIDADES
            // =================================================================

            // --- Cálculo de Variabilidad por STREAMS (micro) ---
            let paceVariabilityStream = '-';
            let hrVariabilityStream = '-';

            if (streamData && streamData.time && streamData.distance) {
                const paceStream = [];
                for (let i = 1; i < streamData.distance.data.length; i++) {
                    const deltaDist = streamData.distance.data[i] - streamData.distance.data[i - 1];
                    const deltaTime = streamData.time.data[i] - streamData.time.data[i - 1];
                    if (deltaDist > 0 && deltaTime > 0) {
                        paceStream.push(deltaTime / deltaDist); // s/m
                    }
                }
                // Aplicamos suavizado a los datos de streams antes de calcular
                paceVariabilityStream = calculateVariability(paceStream, true);
            }

            if (streamData && streamData.heartrate) {
                // Aplicamos suavizado a los datos de streams antes de calcular
                hrVariabilityStream = calculateVariability(streamData.heartrate.data, true);
            }

            // --- Cálculo de Variabilidad por LAPS (macro) ---
            let paceVariabilityLaps = '-';
            let hrVariabilityLaps = '-';
            const lapsData = activityData.laps && activityData.laps.length > 1
                ? activityData.laps
                : activityData.splits_metric;

            if (lapsData && lapsData.length > 1) {
                const paceDataForCV = lapsData.map(lap => lap.average_speed);
                const hrDataForCV = lapsData.map(lap => lap.average_heartrate);

                // NO aplicamos suavizado a los datos de laps
                paceVariabilityLaps = calculateVariability(paceDataForCV, false);
                hrVariabilityLaps = calculateVariability(hrDataForCV, false);
            }

            // Añadimos TODAS las nuevas métricas al objeto de la actividad
            activityData.pace_variability_stream = paceVariabilityStream;
            activityData.hr_variability_stream = hrVariabilityStream;
            activityData.pace_variability_laps = paceVariabilityLaps;
            activityData.hr_variability_laps = hrVariabilityLaps;
            // =============================================
            //         FIN DEL BLOQUE ACTUALIZADO
            // =============================================


            // --- AQUI aplica rolling mean ---
            const windowSize = 100; // Puedes ajustar el tamaño de la ventana
            ['heartrate', 'altitude', 'cadence'].forEach(key => {
                if (streamData[key] && Array.isArray(streamData[key].data)) {
                    streamData[key].data = rollingMean(streamData[key].data, windowSize);
                }
            });

            renderActivity(activityData);
            renderStreamCharts(streamData, activityData);

            renderBestEfforts(activityData.best_efforts);
            renderLaps(activityData.laps);
            renderSegments(activityData.segment_efforts);

            const classificationResults = classifyRun(activityData, streamData);
            renderClassifierResults(classificationResults);

            renderHrZoneDistributionChart(streamData);

            streamChartsDiv.style.display = ''; // o 'grid'

        } catch (error) {
            console.error("Failed to load activity page:", error);
            detailsDiv.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
        }
    }

    // Ejecutamos la función principal
    main();
});

const USER_MAX_HR = 190; // Cambia esto por tu FC máxima real o estimada

function estimateVO2max(act, userMaxHr = USER_MAX_HR) {
    if (!act.distance || !act.moving_time || !act.average_heartrate) return '-';
    // Paso A: velocidad en m/min
    const vel_m_min = (act.distance / act.moving_time) * 60;
    // Paso B: VO2 al ritmo de la actividad
    const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
    // Paso C: % esfuerzo
    const percent_max_hr = act.average_heartrate / userMaxHr;
    if (percent_max_hr < 0.5 || percent_max_hr > 1.2) return '-'; // filtro valores raros
    // Paso D: Extrapolación
    const vo2max = vo2_at_pace / percent_max_hr;
    return vo2max.toFixed(1);
}

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


// =============================================
//  NUEVA FUNCIÓN: COEFICIENTE DE VARIACIÓN (CV)
// =============================================
/**
 * Calcula el Coeficiente de Variación (CV) para un array de números.
 * El CV es la desviación estándar dividida por la media, expresada como porcentaje.
 * @param {number[]} data - Array de números (ej. ritmo, FC).
 * @returns {string} El CV como un string de porcentaje (ej. "4.5%") o '-' si no se puede calcular.
 */
function calculateVariability(data, applySmoothing = false) {
    if (applySmoothing) {
        data = rollingMean(data, 150); // Aplica suavizado solo si se solicita
    }

    if (!data || data.length < 2) return '-';

    const validData = data.filter(d => d !== null && isFinite(d) && d > 0);
    if (validData.length < 2) return '-';

    const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
    if (mean === 0) return '-';

    const standardDeviation = Math.sqrt(
        validData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (validData.length - 1)
    );

    const cv = (standardDeviation / mean) * 100;

    return `${cv.toFixed(1)}%`;
}


function formatPace(speedInMps) {
    if (!speedInMps || speedInMps === 0) return '-';
    const paceInSecPerKm = 1000 / speedInMps;
    const min = Math.floor(paceInSecPerKm / 60);
    const sec = Math.round(paceInSecPerKm % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}
// =================================================================
//          NUEVO MÓDULO: CLASIFICADOR DE TIPO DE CARRERA
// =================================================================

// classifyRun.js
function classifyRun(act = {}, streams = {}) {
  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sum = arr => arr.reduce((s, x) => s + (x || 0), 0);

  function secsPerKmFromSpeed(mps) {
    if (!mps || mps <= 0) return null;
    return 1000 / mps; // seconds per km
  }
  function paceMinPerKmFromSpeed(mps) {
    const s = secsPerKmFromSpeed(mps);
    return s ? (s / 60) : null; // minutes per km
  }

  function calculateCV(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    const numeric = arr.map(x => Number(x)).filter(x => isFinite(x) && x > 0);
    if (numeric.length < 2) return 0;
    const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
    const sd = Math.sqrt(numeric.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / numeric.length);
    return (sd / mean) * 100; // percent
  }

  // If Strava HR zones provided, compute time in each zone (seconds)
  function timeInZonesFromStreams(hrStream, timeStream, hrZones) {
    // hrZones: array of zones with .max (as in your earlier code). We'll derive min from prev max.
    if (!hrStream || !timeStream || !Array.isArray(hrStream.data) || !Array.isArray(timeStream.data)) return null;
    const hr = hrStream.data;
    const times = timeStream.data;
    if (hr.length !== times.length) {
      // best-effort: align by min length
    }
    const n = Math.min(hr.length, times.length);
    if (n < 2) return null;

    // Prepare zone boundaries
    const zones = hrZones.map((z, i) => {
      const max = typeof z.max === 'number' ? z.max : null;
      const min = (i === 0) ? 0 : ((typeof hrZones[i - 1].max === 'number') ? hrZones[i - 1].max + 1 : 0);
      return { min, max };
    });

    const timePerZone = new Array(zones.length).fill(0);
    for (let i = 1; i < n; i++) {
      const dt = times[i] - times[i - 1];
      if (!(dt > 0)) continue;
      const hrVal = hr[i];
      // find zone:
      let zi = zones.findIndex(z => (z.max !== null ? (hrVal <= z.max && hrVal >= z.min) : hrVal >= z.min));
      if (zi === -1) {
        // fallback: put in last zone if greater than last.max
        zi = zones.length - 1;
      }
      timePerZone[zi] += dt;
    }
    return timePerZone; // seconds in each zone
  }

  // Normaliza effort a 0..1 con límite 300 (según tu dato max=274)
  function normalizeEffort(eff) {
    if (!eff && eff !== 0) return 0;
    const v = clamp(Number(eff) || 0, 0, 300);
    return v / 300;
  }

  // Scoring helpers: cada función devuelve objeto { type:score, ... }
  function emptyScores() {
    return {
      'Recovery Run': 0, 'Easy Run': 0, 'Long Run': 0, 'Race': 0,
      'Tempo Run': 0, 'Intervals': 0, 'Fartlek': 0, 'Progressive Run': 0,
      'Hill Repeats': 0, 'Trail Run': 0
    };
  }

  function addScores(target, addObj, weight = 1) {
    Object.keys(addObj).forEach(k => {
      target[k] = (target[k] || 0) + (addObj[k] || 0) * weight;
    });
  }

  // ---------- Extract basic metrics ----------
  const distKm = (act.distance || 0) / 1000;
  const movingTime = (act.moving_time || 0); // seconds
  const elapsedTime = (act.elapsed_time || movingTime || 1);
  const moveRatio = elapsedTime > 0 ? clamp(movingTime / elapsedTime, 0, 1) : 1;
  const elevationPerKm = distKm > 0 ? (act.total_elevation_gain || 0) / distKm : 0; // meters per km
  const paceAvgMinKm = paceMinPerKmFromSpeed(act.average_speed) || 0; // minutes per km
  const paceAvgSecKm = secsPerKmFromSpeed(act.average_speed) || 0; // seconds per km
  const hrAvg = act.average_heartrate || 0;
  const hrMax = act.max_heartrate || null;
  const effortNorm = normalizeEffort(act.suffer_score || act.perceived_exertion || act.perceived_effort || 0);
  const sportType = (act.sport_type || act.type || '').toString();

  // Streams-based metrics
  // paceStream: compute minutes/km per sample if distance+time present; else fallback to pace stream if exists.
  let paceStream = [];
  try {
    if (streams?.distance?.data && streams?.time?.data) {
      for (let i = 1; i < Math.min(streams.distance.data.length, streams.time.data.length); i++) {
        const dDist = streams.distance.data[i] - streams.distance.data[i - 1]; // meters
        const dTime = streams.time.data[i] - streams.time.data[i - 1]; // seconds
        if (dDist > 0 && dTime > 0) {
          const sPerKm = (dTime / dDist) * 1000; // seconds per km
          paceStream.push(sPerKm / 60); // minutes per km
        }
      }
    } else if (streams?.pace?.data) {
      // if pace stream in min/km or s/km — we try to interpret; assume min/km numbers (like 5 => 5 min/km)
      paceStream = streams.pace.data.map(x => Number(x)).filter(x => isFinite(x) && x > 0);
    }
  } catch (e) { paceStream = []; }

  const paceCV = calculateCV(paceStream) || (streams?.pace_variability_stream ? parseFloat(String(streams.pace_variability_stream).replace('%','')) : 0);
  const hrCV = Number(String(act.hr_variability_stream || act.hr_variability_laps || '').replace('%','')) || calculateCV(streams?.heartrate?.data) || 0;

  // Time in HR zones
  const zonesObj = (() => {
    try {
      const zonesText = localStorage?.getItem?.('strava_training_zones');
      if (!zonesText) return null;
      const parsed = JSON.parse(zonesText);
      return parsed?.heart_rate?.zones || null;
    } catch (e) { return null; }
  })();
  const timeInZones = (zonesObj && streams?.heartrate && streams?.time) ? timeInZonesFromStreams(streams.heartrate, streams.time, zonesObj) : null;
  const totalTimeInZones = timeInZones ? sum(timeInZones) : 0;
  let pctZ = { low: 0, tempo: 0, high: 0, byZone: [] };
  if (timeInZones && totalTimeInZones > 0) {
    // We define: low = Z1+Z2, tempo = Z3, high = Z4+Z5 (avoids overlap)
    const z = timeInZones;
    const zlen = z.length;
    const z1 = z[0] || 0;
    const z2 = z[1] || 0;
    const z3 = z[2] || 0;
    const z4 = z[3] || 0;
    const z5 = z[4] || 0;
    pctZ.low = ((z1 + z2) / totalTimeInZones) * 100;
    pctZ.tempo = (z3 / totalTimeInZones) * 100;
    pctZ.high = ((z4 + z5) / totalTimeInZones) * 100;
    pctZ.byZone = timeInZones.map(t => (t / totalTimeInZones) * 100);
  } else {
    // fallback thresholds on hrAvg relative simple bands (these are defaults; adjust if you want)
    // WARNING: absolute HR bands are person-specific; these are generic fallbacks.
    const h = hrAvg || 0;
    if (h === 0) { pctZ = { low: 0, tempo: 0, high: 0, byZone: [] }; }
    else {
      if (h < 130) pctZ.low = 100;
      else if (h < 150) pctZ.low = 50, pctZ.tempo = 50;
      else if (h < 165) pctZ.tempo = 60, pctZ.high = 40;
      else pctZ.high = 100;
    }
  }

  // Negative split ratio
  let negativeSplitRatio = 1;
  try {
    if (streams?.distance?.data && streams?.time?.data) {
      const halfway = (act.distance || 0) / 2;
      const idx = streams.distance.data.findIndex(d => d >= halfway);
      if (idx > 0) {
        const tHalf = streams.time.data[idx];
        const secondHalf = (movingTime || 0) - tHalf;
        negativeSplitRatio = tHalf > 0 ? secondHalf / tHalf : 1;
      }
    }
  } catch (e) { negativeSplitRatio = 1; }

  // ---------- Scoring components ----------
  const scores = emptyScores();

  // 1) sport_type strong hints
  if (/trail/i.test(sportType)) addScores(scores, {'Trail Run': 200});
  if (act.workout_type === 1) addScores(scores, {'Race': 200}); // Strava label race

  // 2) Distance: piecewise diminishing/ascending influence
  const distComponent = {};
  // long run base
  if (distKm >= 15) distComponent['Long Run'] = 80 + (distKm - 15) * 2; // more for longer
  else if (distKm >= 14) distComponent['Long Run'] = 60;
  else if (distKm >= 13) distComponent['Long Run'] = 45;
  else if (distKm >= 12) distComponent['Long Run'] = 30;
  // short distance: recovery and easy strong
  if (distKm < 5) distComponent['Recovery Run'] = 70;
  else if (distKm < 8) distComponent['Recovery Run'] = 40, distComponent['Easy Run'] = (distKm >= 5 ? 30 : 10);
  else if (distKm < 12) distComponent['Easy Run'] = 40;
  // mid-distance tempo/intervals/fartlek candidates
  if (distKm >= 5 && distKm < 16) {
    distComponent['Intervals'] = 8;
    distComponent['Fartlek'] = 8;
    distComponent['Tempo Run'] = distKm >= 6 && distKm <= 14 ? 12 : 0;
  }
  addScores(scores, distComponent, 1.0);

  // 3) Elevation per km: hill vs trail
  const elevComponent = {};
  if (elevationPerKm > 40) { elevComponent['Trail Run'] = 80; elevComponent['Hill Repeats'] = 20; }
  else if (elevationPerKm > 30) { elevComponent['Hill Repeats'] = 70; elevComponent['Trail Run'] = 30; }
  else if (elevationPerKm > 15) { elevComponent['Hill Repeats'] = 30; elevComponent['Trail Run'] = 10; }
  addScores(scores, elevComponent, 1.1);

  // 4) Moving ratio: low moving ratio suggests trail/stop/start (technical) or walking -> bias to Trail/Hill
  const moveComp = {};
  if (moveRatio < 0.9) { moveComp['Trail Run'] = 50; moveComp['Hill Repeats'] = 30; }
  else if (moveRatio < 0.95) { moveComp['Trail Run'] = 20; moveComp['Fartlek'] = 10; }
  else { moveComp['Easy Run'] = 5; }
  addScores(scores, moveComp, 0.9);

  // 5) Effort: differentiates race vs easy/long/fartlek
  const e = effortNorm; // 0..1
  const effComp = {};
  if (e > 0.7) { effComp['Race'] = 80 * e; effComp['Intervals'] = 50 * e; }
  else if (e > 0.45) { effComp['Tempo Run'] = 50 * e; effComp['Fartlek'] = 30 * e; effComp['Long Run'] = 20 * e; }
  else { effComp['Easy Run'] = 30 * (1 - e); effComp['Recovery Run'] = 60 * (1 - e); }
  addScores(scores, effComp, 1.4);

  // 6) HR zones: strong signal for recovery/easy/tempo/intervals/race
  const hrComp = {};
  if (pctZ.low > 80) hrComp['Recovery Run'] = 120, hrComp['Easy Run'] = 40;
  if (pctZ.low > 60 && pctZ.low <= 80) hrComp['Easy Run'] = 80;
  if (pctZ.tempo > 50) hrComp['Tempo Run'] = 100;
  if (pctZ.tempo > 35 && pctZ.tempo <= 50) hrComp['Progressive Run'] = 40;
  if (pctZ.high > 40) hrComp['Intervals'] = 90;
  if (pctZ.high > 60) hrComp['Race'] = 120;
  // Fartlek: moderate spread across zones
  if (pctZ.low > 20 && pctZ.high > 10 && pctZ.tempo > 10) hrComp['Fartlek'] = 30;
  addScores(scores, hrComp, 1.6);

  // 7) Pace and pace variability: intervals/fartlek/progressive/race
  const paceComp = {};
  // fast avg pace -> race/intervals
  if (paceAvgMinKm && paceAvgMinKm < 4.75) paceComp['Race'] = 60;
  if (paceAvgMinKm && paceAvgMinKm < 5.25) paceComp['Intervals'] = (paceAvgMinKm < 4.75 ? 40 : 15);
  // paceCV high => intervals/fartlek/progressive
  if (paceCV > 20) { paceComp['Intervals'] = (paceComp['Intervals'] || 0) + 80; paceComp['Fartlek'] = 60; }
  else if (paceCV > 12) { paceComp['Fartlek'] = 40; paceComp['Progressive Run'] = 30; }
  else if (paceCV < 6) { paceComp['Race'] = (paceComp['Race'] || 0) + 20; paceComp['Tempo Run'] = 10; }
  addScores(scores, paceComp, 1.1);

  // 8) HR variability (hrCV) sign of intervals/high-intensity variability
  const hrComp2 = {};
  if (hrCV > 10) hrComp2['Intervals'] = 40;
  if (hrCV < 5 && pctZ.low > 50) hrComp2['Easy Run'] = 20;
  addScores(scores, hrComp2, 0.8);

  // 9) Negative split -> progressive run signal
  const nsComp = {};
  if (distKm >= 8) {
    if (negativeSplitRatio < 0.95) nsComp['Progressive Run'] = 80;
    else if (negativeSplitRatio < 1.0) nsComp['Progressive Run'] = 30;
  }
  addScores(scores, nsComp, 1.0);

  // 10) small rules & tie-breakers
  if (distKm >= 21 && effortNorm > 0.6) addScores(scores, {'Race': 30, 'Long Run': 40}, 0.8);
  if (distKm >= 10 && elevationPerKm > 20 && moveRatio < 0.97) addScores(scores, {'Trail Run': 40}, 1.0);

  // If sport_type was 'Run' but name contains 'tempo', 'fartlek', give cue
  if (act.name && /tempo/i.test(act.name)) addScores(scores, {'Tempo Run': 60}, 0.9);
  if (act.name && /fartlek/i.test(act.name)) addScores(scores, {'Fartlek': 80}, 0.9);

  // ---------- Final normalization & output ----------
  const totalScore = sum(Object.values(scores));
  if (totalScore === 0) {
    return [{ type: 'General Run', score: 100, abs: 1 }];
  }

  const results = Object.entries(scores)
    .map(([type, sc]) => ({ type, abs: Math.round(sc), pct: +( (sc / totalScore) * 100 ).toFixed(1) }))
    .filter(r => r.abs > 0)
    .sort((a, b) => b.abs - a.abs);

  // return top 3 plus diagnostics (useful to tune)
  return {
    top: results.slice(0, 5),
    all: results,
    diagnostics: {
      distKm, paceAvgMinKm: +(paceAvgMinKm || 0).toFixed(2), paceCV: +paceCV.toFixed(1),
      hrAvg, hrCV: +hrCV.toFixed(1), effortNorm: +effortNorm.toFixed(3), elevationPerKm: +elevationPerKm.toFixed(1),
      moveRatio: +moveRatio.toFixed(3), pctZ, negativeSplitRatio: +negativeSplitRatio.toFixed(3)
    }
  };
}



/**
 * Renderiza los resultados del clasificador en la UI.
 * @param {object[]} results - El array de resultados de la función classifyRun.
 */
function renderClassifierResults(classificationData) {
    const container = document.getElementById('run-classifier-results');
    if (!container) return;

    // --- CAMBIO CLAVE: Ahora extraemos el array 'top' del objeto ---
    const results = classificationData ? classificationData.top : null;
    console.log("Classification Diagnostics:", classificationData.diagnostics); // Para depurar, muy útil

    if (!results || results.length === 0) {
        container.innerHTML = '<p>Could not classify this run.</p>';
        return;
    }

    const resultsHtml = results.map((result, index) => {
        // Asignar un color para el primer, segundo y tercer puesto
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



// =================================================================
//     NUEVO MÓDULO: GRÁFICO DE DISTRIBUCIÓN DE ZONAS DE FC
// =================================================================

/**
 * Procesa los streams de FC y tiempo para calcular el tiempo total en cada zona de FC.
 * @param {object} heartrateStream - El stream de datos de FC.
 * @param {object} timeStream - El stream de datos de tiempo.
 * @param {object[]} zones - Las zonas de FC del atleta (de la API).
 * @returns {number[]} Un array con el tiempo en segundos para cada zona.
 */
function calculateTimeInZones(heartrateStream, timeStream, zones) {
    if (!heartrateStream || !timeStream || !zones || zones.length === 0) {
        return [];
    }

    // Inicializamos un array para guardar los segundos en cada zona.
    const timeInZones = Array(zones.length).fill(0);

    for (let i = 1; i < heartrateStream.data.length; i++) {
        const hr = heartrateStream.data[i];
        if (hr === null) continue;

        // El tiempo transcurrido en este segmento del stream
        const deltaTime = timeStream.data[i] - timeStream.data[i - 1];

        // Encontrar en qué zona cae la FC actual
        let zoneIndex = -1;
        for (let j = 0; j < zones.length; j++) {
            const zone = zones[j];
            // La última zona no tiene máximo
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
 * Renderiza un gráfico circular (pie chart) con la distribución del tiempo en zonas de FC.
 * @param {object} streams - Los streams de la actividad.
 */
function renderHrZoneDistributionChart(streams) {
    const canvas = document.getElementById('hr-zones-pie-chart');
    if (!canvas || !streams.heartrate || !streams.time) {
        return; // No se puede renderizar si no hay canvas o datos de FC/tiempo
    }

    // 1. Obtener las zonas de FC del atleta desde localStorage
    const zonesDataText = localStorage.getItem('strava_training_zones');
    if (!zonesDataText) {
        console.warn("Training zones not found in localStorage.");
        return;
    }
    const allZones = JSON.parse(zonesDataText);
    const hrZones = allZones?.heart_rate?.zones?.filter(z => z.max > 0);

    if (!hrZones || hrZones.length === 0) {
        console.warn("Valid HR zones not found.");
        return;
    }

    // 2. Calcular el tiempo en cada zona
    const timeInZones = calculateTimeInZones(streams.heartrate, streams.time, hrZones);

    // 3. Preparar los datos para Chart.js
    const labels = hrZones.map((zone, i) => `Z${i + 1} (${zone.min}-${zone.max === -1 ? '∞' : zone.max})`);
    const data = timeInZones.map(time => (time / 60).toFixed(1)); // Convertir a minutos

    const backgroundColors = [ // Colores que definimos en style.css
        '#d1d5db', // Z1
        '#60a5fa', // Z2
        '#34d399', // Z3
        '#f59e0b', // Z4
        '#ef4444'  // Z5
    ];

    // 4. Crear el gráfico
    new Chart(canvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time in Zone (minutes)',
                data: data,
                backgroundColor: backgroundColors.slice(0, hrZones.length),
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += `${context.parsed} min`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}