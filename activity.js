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

    // --- 2. FUNCIONES DE UTILIDAD ---
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.round(seconds % 60);
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function formatPace(speedInMps) {
        if (!speedInMps || speedInMps === 0) return '-';
        const paceInSecPerKm = 1000 / speedInMps;
        const min = Math.floor(paceInSecPerKm / 60);
        const sec = Math.round(paceInSecPerKm % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

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
        const paceVariability = act.pace_variability || '-';
        const hrVariability = act.hr_variability || '-';

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
                <li><b>Move Ratio:</b> ${moveRatio}</li>
                <li><b>Effort:</b> ${effort}</li>
                <li><b>VO₂max (est):</b> ${vo2max}</li>
                <li><b>Pace Variability (CV):</b> ${paceVariability}</li>
            <li><b>Heart Rate Variability (CV):</b> ${hrVariability}</li>
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


            // =============================================
            //       NUEVO BLOQUE: CÁLCULO DE VARIABILIDAD
            // =============================================
            let paceVariability = '-';
            let hrVariability = '-';

            if (streamData && streamData.time && streamData.distance) {
                // Calcula el ritmo (segundos por metro) para cada punto del stream
                const paceStream = [];
                for (let i = 1; i < streamData.distance.data.length; i++) {
                    const deltaDist = streamData.distance.data[i] - streamData.distance.data[i - 1];
                    const deltaTime = streamData.time.data[i] - streamData.time.data[i - 1];
                    if (deltaDist > 0 && deltaTime > 0) {
                        paceStream.push(deltaTime / deltaDist); // s/m
                    }
                }
                paceVariability = calculateVariability(paceStream);
            }

            if (streamData && streamData.heartrate) {
                hrVariability = calculateVariability(streamData.heartrate.data);
            }

            // Añadimos las nuevas métricas al objeto de la actividad para pasarlas al renderizador
            activityData.pace_variability = paceVariability;
            activityData.hr_variability = hrVariability;
            // =============================================
            //         FIN DEL NUEVO BLOQUE
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
function calculateVariability(data) {
    data = rollingMean(data, 150);
    if (!data || data.length < 2) return '-';

    // Filtra valores nulos o inválidos
    const validData = data.filter(d => d !== null && isFinite(d) && d > 0);
    if (validData.length < 2) return '-';

    // 1. Calcular la media (promedio)
    const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
    if (mean === 0) return '-';

    // 2. Calcular la desviación estándar
    const standardDeviation = Math.sqrt(
        validData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (validData.length - 1)
    );

    // 3. Calcular el Coeficiente de Variación (CV)
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

/**
 * Clasifica una carrera en un tipo de entrenamiento basado en un sistema de puntuación.
 * @param {object} act - El objeto de la actividad de Strava.
 * @param {object} streams - Los datos de los streams de la actividad.
 * @returns {object[]} Un array de los 3 tipos de carrera más probables con su puntuación.
 */
function classifyRun(act, streams) {
    
    // --- 1. Extraer y preparar todas las métricas necesarias ---
    const distKm = act.distance / 1000;
    const effort = act.suffer_score || act.perceived_exertion || 0;
    const moveRatio = act.elapsed_time ? act.moving_time / act.elapsed_time : 1;
    const elevationPerKm = distKm > 0 ? act.total_elevation_gain / distKm : 0;
    const paceAvg = formatPace(act.average_speed);
    const heartRateAvg = act.average_heartrate ? Math.round(act.average_heartrate) : '-';

    const paceStream = [];
    if (streams && streams.time && streams.distance) {
        for (let i = 1; i < streams.distance.data.length; i++) {
            const dDist = streams.distance.data[i] - streams.distance.data[i - 1];
            const dTime = streams.time.data[i] - streams.time.data[i - 1];
            if (dDist > 0 && dTime > 0) paceStream.push(dTime / dDist); // s/m
        }
    }
    const paceCV = parseFloat(calculateVariability(paceStream).replace('%', ''));
    const hrCV = parseFloat(calculateVariability(streams?.heartrate?.data).replace('%', ''));

    // Asumimos una FC Máxima teórica para calcular zonas si no está disponible la real
    const maxHr = act.max_heartrate || USER_MAX_HR + 5;
    const avgHrRatio = act.average_heartrate / maxHr;

    // Análisis de Negative Split para carreras progresivas
    const firstHalfTime = act.moving_time / 2;
    let timeAtHalfway = 0;
    if (streams && streams.distance) {
        const halfwayPoint = act.distance / 2;
        const halfwayIndex = streams.distance.data.findIndex(d => d >= halfwayPoint);
        if (halfwayIndex > 0) {
            timeAtHalfway = streams.time.data[halfwayIndex];
        }
    }
    const secondHalfTime = act.moving_time - timeAtHalfway;
    const negativeSplitRatio = timeAtHalfway > 0 ? secondHalfTime / timeAtHalfway : 1;


    // --- 2. Definir las reglas para cada tipo de entrenamiento ---
    const runTypes = {
        'Race': 0, 'Long Run': 0, 'Trail Run': 0, 'Hill Repeats': 0,
        'Intervals': 0, 'Fartlek': 0, 'Tempo Run': 0, 'Progressive Run': 0,
        'Easy Run': 0, 'Recovery Run': 0
    };

    // --- Sistema de Puntuación ---

    // Recovery Run (muy estricto)
    if (distKm < 8 && effort < 25 && avgHrRatio < 0.70) runTypes['Recovery Run'] += 60;
    if (paceCV < 4) runTypes['Recovery Run'] += 15;
    if (paceAvg > 6) runTypes['Recovery Run'] += 10;
    if (heartRateAvg < 135) runTypes['Recovery Run'] += 5;

    // Easy Run
    if (effort >= 15 && effort < 60 && avgHrRatio < 0.78) runTypes['Easy Run'] += 50;
    if (distKm > 4 && distKm < 13) runTypes['Easy Run'] += 10;
    if (paceCV < 5 && elevationPerKm < 30) runTypes['Easy Run'] += 20;
    if (paceAvg > 5.75) runTypes['Easy Run'] += 10;
    if (heartRateAvg < 150) runTypes['Easy Run'] += 5;

    // Long Run
    if (distKm > 14.9) runTypes['Long Run'] += 60;
    if (effort > 60 && effort < 160) runTypes['Long Run'] += 20;
    if (paceCV < 7) runTypes['Long Run'] += 10;
    if (paceAvg > 5.25) runTypes['Long Run'] += 5;
    if (heartRateAvg < 155) runTypes['Long Run'] += 5;


    // Race (alta prioridad si se cumplen las condiciones)
    const isRaceDist = [5, 10, 21.1, 42.2].some(d => Math.abs(distKm - d) < 0.5);
    if (isRaceDist && effort > 150 && avgHrRatio > 0.88 && paceCV < 4) runTypes['Race'] += 100;
    if (act.workout_type === 1) runTypes['Race'] += 150; // ¡La etiqueta de Strava es el mejor indicador!
    if (heartRateAvg > 170) runTypes['Race'] += 5;

    // Tempo Run
    if (distKm > 5 && distKm < 16 && avgHrRatio > 0.84 && avgHrRatio < 0.91) runTypes['Tempo Run'] += 60;
    if (paceCV < 4.5) runTypes['Tempo Run'] += 25;
    if (heartRateAvg > 165) runTypes['Tempo Run'] += 5;
    if (paceAvg < 5) runTypes['Tempo Run'] += 10;

    // Progressive Run
    if (distKm > 8 && negativeSplitRatio < 0.99) runTypes['Progressive Run'] += 70; // 1% negative split
    if (paceCV > 5 && paceCV < 12) runTypes['Progressive Run'] += 15;

    // Intervals / Series
    if (paceCV > 12 && hrCV > 8) runTypes['Intervals'] += 70;
    if (effort > 100) runTypes['Intervals'] += 20;
    if (paceAvg < 5.25) runTypes['Intervals'] += 10;
    if (heartRateAvg > 166) runTypes['Intervals'] += 5;

    // Fartlek (menos estructurado que los intervalos)
    if (paceCV > 7 && paceCV < 15 && hrCV > 5) runTypes['Fartlek'] += 60;
    if (distKm > 5 && distKm < 16) runTypes['Fartlek'] += 10;
    if (paceAvg < 5.25) runTypes['Fartlek'] += 10;
    if (heartRateAvg > 166) runTypes['Fartlek'] += 5;

    // Hill Repeats
    if (elevationPerKm > 30 && paceCV > 9) runTypes['Hill Repeats'] += 70;
    if (heartRateAvg > 166) runTypes['Hill Repeats'] += 5;
    if (paceAvg > 5.25) runTypes['Hill Repeats'] += 5;

    // Trail Run
    if (elevationPerKm > 40) runTypes['Trail Run'] += 50;
    if (moveRatio < 0.75) runTypes['Trail Run'] += 30; // Mucho tiempo parado = técnico
    if (heartRateAvg > 170) runTypes['Trail Run'] += 5;
    if (paceAvg > 5.25) runTypes['Trail Run'] += 5;
    if (act.sport_type === 'TrailRun') runTypes['Trail Run'] += 100;

    // HEART RATE
    if (heartRateAvg < 135) runTypes['Recovery Run'] += 70;
    if (heartRateAvg < 140 && heartRateAvg > 130) runTypes['Easy Run'] += 40;
    if (heartRateAvg < 160 && heartRateAvg > 150) runTypes['Long Run'] += 10;
    if (heartRateAvg < 170 && heartRateAvg > 150) runTypes['Tempo Run'] += 10;
    if (heartRateAvg < 180 && heartRateAvg > 170) runTypes['Intervals'] += 10;
    if (heartRateAvg > 180) runTypes['Race'] += 60;
    if (heartRateAvg < 175 && heartRateAvg > 160) runTypes['Fartlek'] += 10;
    if (heartRateAvg < 180 && heartRateAvg > 160) runTypes['Hill Repeats'] += 10;
    if (heartRateAvg > 170) runTypes['Trail Run'] += 20;
    if (heartRateAvg < 180 && heartRateAvg > 160) runTypes['Progressive Run'] += 20;

    // DISTANCE
    if (distKm < 5) runTypes['Recovery Run'] += 50;
    if (distKm < 10 && distKm > 5) runTypes['Easy Run'] += 30;
    if (distKm > 15) runTypes['Long Run'] += 30;
    if (distKm < 14 && distKm > 6) runTypes['Tempo Run'] += 10;
    if (distKm > 5) runTypes['Intervals'] += 10;
    if (distKm > 6) runTypes['Fartlek'] += 10;
    if (distKm < 14) runTypes['Hill Repeats'] += 10;
    if (distKm > 7) runTypes['Trail Run'] += 10;
    if (distKm > 9) runTypes['Progressive Run'] += 30;

    // PACE CV
    if (paceCV > 15) runTypes['Long Run'] += 30;
    if (paceCV < 14) runTypes['Tempo Run'] += 10;
    if (paceCV > 15) runTypes['Trail Run'] += 25;
    if (paceCV > 15) runTypes['Progressive Run'] += 30;
    if (paceCV > 20) runTypes['Intervals'] += 30;
    if (paceCV > 20) runTypes['Fartlek'] += 30;
    if (paceCV < 10) runTypes['Race'] += 10;
    

    // --- 3. Calcular porcentajes y devolver los 3 mejores ---
    const totalScore = Object.values(runTypes).reduce((sum, score) => sum + score, 0);

    if (totalScore === 0) {
        return [{ type: 'General Run', score: 100 }];
    }

    const results = Object.entries(runTypes)
        .map(([type, score]) => ({
            type,
            score: Math.round((score / totalScore) * 100)
        }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

    return results.slice(0, 10);
}


/**
 * Renderiza los resultados del clasificador en la UI.
 * @param {object[]} results - El array de resultados de la función classifyRun.
 */
function renderClassifierResults(results) {
    const container = document.getElementById('run-classifier-results');
    if (!container) return;

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
                    <div class="classifier-bar" style="width: ${result.score}%; background-color: ${color};"></div>
                </div>
                <div class="classifier-score" style="color: ${color};">${result.score}%</div>
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
                        label: function(context) {
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