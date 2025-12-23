// js/activity.js
// import { classifyRun } from './classifyRun.js';

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


    function renderLapsChart(laps) {
    const canvas = document.getElementById('laps-chart');
    const section = document.getElementById('laps-chart-section');
    if (!canvas || !section || !laps || laps.length === 0) return;

    section.classList.remove('hidden');

    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
        canvas.chartInstance = null;
    }

    // Lap labels and data
    const labels = laps.map((_, i) => `Lap ${i + 1}`);
    const paces = laps.map(lap => 1000 / lap.average_speed);

    // Color bars by pace (faster = darker)
    const minPace = Math.min(...paces);
    const maxPace = Math.max(...paces);

    const colors = paces.map(pace => {
        const t = (pace - minPace) / (maxPace - minPace || 1);
        const lightness = 35 + t * 35;
        return `hsl(15, 90%, ${lightness}%)`;
    });

    canvas.chartInstance = new Chart(canvas, {
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
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Lap'
                    }
                },
                y: {
                    reverse: true,
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Pace (min/km)'
                    }
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
                mapDiv.innerHTML = "";
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
                data: { labels: kmLabels, datasets: [{ label: 'Pace (s/km)', data: paceData, borderColor: '#FC5200' }] }
            });
            new Chart(document.getElementById('chart-heartrate'), {
                type: 'line',
                data: { labels: kmLabels, datasets: [{ label: 'HR Avg (bpm)', data: hrData, borderColor: 'red' }] }
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

        // --- CONFIGURACIÓN DE WINDOW SIZE POR STREAM ---
        const windowSizes = {
            altitude: 50,
            pace: 200,
            heartrate: 80,
            cadence: 60
        };

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
            const ctx = document.getElementById(canvasId);
            if (!ctx) {
                console.warn(`Canvas element not found: ${canvasId}`);
                return;
            }
            if (ctx.chartInstance) ctx.chartInstance.destroy();
            ctx.chartInstance = new Chart(ctx, {
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
                        x: { title: { display: true, text: 'Distance (km)' } },
                        y: { reverse: yAxisReverse, title: { display: true, text: label } }
                    }
                }
            });
        }

        // 1. Altitud vs Distance
        if (altitude && altitude.data) {
            const smoothAltitude = rollingMean(altitude.data, windowSizes.altitude);
            createStreamChart('chart-altitude', 'Altitud (m)', smoothAltitude, '#888');
        } else {
            const altCanvas = document.getElementById('chart-altitude');
            if (altCanvas) altCanvas.parentElement.innerHTML = '<p>⚠️ Altitude data not available</p>';
        }

        // 2. Ritmo vs Distance (Cálculo corregido)
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
            const smoothPaceStreamData = rollingMean(paceStreamData, windowSizes.pace);

            const paceLabels = distLabels.slice(1);
            const ctx = document.getElementById('chart-pace-distance');
            if (!ctx) {
                console.warn('Canvas element not found: chart-pace-distance');
            } else {
                if (ctx.chartInstance) ctx.chartInstance.destroy();
                ctx.chartInstance = new Chart(ctx, {
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
                            x: { title: { display: true, text: 'Distance (km)' } },
                            y: { reverse: true, title: { display: true, text: 'Ritmo (min/km)' } }
                        }
                    }
                });
            }
        } else {
            const paceCanvas = document.getElementById('chart-pace-distance');
            if (paceCanvas) paceCanvas.parentElement.innerHTML = '<p>⚠️ Pace data not available</p>';
        }

        // 3. Frecuencia Cardíaca vs Distance
        if (heartrate && heartrate.data) {
            const smoothHeartrate = rollingMean(heartrate.data, windowSizes.heartrate);
            createStreamChart('chart-heart-distance', 'FC (bpm)', smoothHeartrate, 'red');
        } else {
            const hrCanvas = document.getElementById('chart-heart-distance');
            if (hrCanvas) hrCanvas.parentElement.innerHTML = '<p>⚠️ Heart rate data not available</p>';
        }

        // 4. Cadencia vs Distance
        if (cadence && cadence.data) {
            // La cadencia de carrera se multiplica por 2 (es por pierna)
            const cadenceData = act.type === 'Run' ? cadence.data.map(c => c * 2) : cadence.data;
            const smoothCadence = rollingMean(cadenceData, windowSizes.cadence);
            createStreamChart('chart-cadence-distance', 'Cadencia (spm)', smoothCadence, '#0074D9');
        } else {
            const cadenceCanvas = document.getElementById('chart-cadence-distance');
            if (cadenceCanvas) cadenceCanvas.parentElement.innerHTML = '<p>⚠️ Cadence data not available</p>';
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
                // Ordenamos por Distance para obtener el ranking
                const sortedByDistance = [...runs].sort((a, b) => b.distance - a.distance);
                // Buscamos la posición (índice) de la actividad actual en la lista ordenada
                const rankIndex = sortedByDistance.findIndex(a => a.id === activityData.id);
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
            renderLapsChart(activityData.laps);
            renderSegments(activityData.segment_efforts);

            const classificationResults = classifyRun(activityData, streamData);
            renderClassifierResults(classificationResults);
            renderHrMinMaxAreaChartHr(streamData);
            renderHrMinMaxAreaChartPace(streamData);
            renderHrZoneDistributionChart(streamData);

            streamChartsDiv.style.display = '';

        } catch (error) {
            console.error("Failed to load activity page:", error);
            detailsDiv.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
        }
    }

    main();
});

const USER_MAX_HR = 195;

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


function renderHrZoneDistributionChart(streams) {
    const canvas = document.getElementById('hr-zones-chart');
    if (!canvas || !streams.heartrate || !streams.time) {
        return;
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
    const data = timeInZones.map(time => +(time / 60).toFixed(1)); // minutos

    // 4. Colores: gradiente de rojo (de claro a oscuro)
    const gradientColors = [
        "#fde0e0", // Z1 - rojo muy claro
        "#fababa", // Z2 - rojo claro
        "#fa7a7a", // Z3 - rojo medio
        "#f44336", // Z4 - rojo fuerte
        "#b71c1c"  // Z5 - rojo oscuro
    ];

    // 5. Crear el gráfico de barras
    new Chart(canvas, {
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
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.parsed} min`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'HR Zone' }
                },
                y: {
                    title: { display: true, text: 'Time (min)' },
                    beginAtZero: true
                }
            }
        }
    });
}


function renderHrMinMaxAreaChartHr(streams) {
    const canvas = document.getElementById('hr-minmax-area-chart');
    const section = document.getElementById('hr-min-max-area-section');

    if (!canvas || !section || !streams.heartrate || !streams.distance) return;

    const hr = streams.heartrate.data;
    const dist = streams.distance.data;
    if (!Array.isArray(hr) || !Array.isArray(dist) || hr.length !== dist.length || hr.length < 2) return;

    section.classList.remove('hidden');

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

    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
        canvas.chartInstance = null;
    }

    canvas.chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'HR Min',
                    data: minArr,
                    fill: '+1', // llena hacia el Max
                    backgroundColor: 'rgba(252,82,0,0.3)', // más intenso
                    borderColor: 'rgba(252,82,0,0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'HR Max',
                    data: maxArr,
                    fill: '-1', // rellena hacia el Min
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


function renderHrMinMaxAreaChartPace(streams) {
    const canvas = document.getElementById('pace-minmax-area-chart');
    const section = document.getElementById('pace-min-max-area-section');

    if (!canvas || !section || !streams.distance || !streams.pace) return;

    const pace = streams.pace.data;
    const dist = streams.distance.data;
    if (!Array.isArray(pace) || !Array.isArray(dist) || pace.length !== dist.length || pace.length < 2) return;

    section.classList.remove('hidden');

    const N_SEGMENTS = 40;
    const totalDist = dist[dist.length - 1];
    const segmentLength = totalDist / N_SEGMENTS;

    const minArr = [], maxArr = [], avgArr = [], labels = [];
    let segStart = 0, segEnd = segmentLength, i = 0;

    for (let s = 0; s < N_SEGMENTS; s++) {
        const paceVals = [];
        while (i < dist.length && dist[i] < segEnd) {
            if (pace[i] !== null && pace[i] !== undefined) paceVals.push(pace[i]);
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
        segStart = segEnd;
        segEnd += segmentLength;
    }

    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
        canvas.chartInstance = null;
    }

    canvas.chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Pace Min',
                    data: minArr,
                    fill: '+1',
                    backgroundColor: 'rgba(0, 123, 255, 0.3)',
                    borderColor: 'rgba(0, 123, 255, 0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Pace Max',
                    data: maxArr,
                    fill: '-1',
                    backgroundColor: 'rgba(0, 123, 255, 0.3)',
                    borderColor: 'rgba(0, 123, 255, 0.6)',
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Pace Avg',
                    data: avgArr,
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
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.dataset.label}: ${Math.round(context.parsed.y)} min/km`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Distance (km)' } },
                y: { title: { display: true, text: 'Pace (min/km)' }, beginAtZero: false }
            }
        }
    });
}