// js/activity.js

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS AL DOM Y ESTADO INICIAL ---
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('id');
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

    // ¡CORREGIDO! Ahora esta función está definida ANTES de que main la llame.
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
                <li><b>Move Ratio:</b> ${moveRatio}</li>
                <li><b>Effort:</b> ${effort}</li>
                <li><b>VO₂max (est):</b> ${vo2max}</li>
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

    // ¡CORREGIDO! Ahora esta función está definida ANTES de que main la llame.
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

            const [activityData, streamData] = await Promise.all([
                fetchActivityDetails(activityId, authPayload),
                fetchActivityStreams(activityId, authPayload)
            ]);

            // --- AQUI aplica rolling mean ---
            const windowSize = 100; // Puedes ajustar el tamaño de la ventana
            ['heartrate', 'altitude', 'cadence'].forEach(key => {
                if (streamData[key] && Array.isArray(streamData[key].data)) {
                    streamData[key].data = rollingMean(streamData[key].data, windowSize);
                }
            });

            renderActivity(activityData);
            renderStreamCharts(streamData, activityData);
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
