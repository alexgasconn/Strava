// js/activity.js

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS AL DOM Y ESTADO INICIAL ---
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('id');

    const detailsDiv = document.getElementById('activity-details');
    const mapDiv = document.getElementById('activity-map');
    const splitsSection = document.getElementById('splits-section');
    const segmentsSection = document.getElementById('segments-section');
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
        const streamTypes = 'distance,time,heartrate,altitude';
        const result = await fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, authPayload);
        return result.streams;
    }

    // --- 4. LÓGICA DE RENDERIZADO ---
    
    // ¡CORREGIDO! Ahora esta función está definida ANTES de que main la llame.
    function renderActivity(act) {
        // --- Info principales ---
        const name = act.name;
        const description = act.description || '';
        const date = new Date(act.start_date_local).toLocaleString();
        const typeLabels = ['Workout', 'Race', 'Long Run', 'Workout'];
        const activityType = act.workout_type !== undefined ? typeLabels[act.workout_type] || 'Other' : (act.type || 'Other');
        const gear = act.gear?.name || 'N/A';
        const kudos = act.kudos_count || 0;
        const commentCount = act.comment_count || 0;

        // Weather (si tienes estos datos en act)
        let weatherStr = 'Not available';
        if (act.temperature || act.pressure || act.wind_speed) {
            weatherStr = [
                act.temperature ? `🌡️ ${act.temperature}°C` : '',
                act.pressure ? `⏲️ ${act.pressure} hPa` : '',
                act.wind_speed ? `💨 ${act.wind_speed} m/s` : ''
            ].filter(Boolean).join(' | ');
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
        const vo2max = act.vo2max_est ? act.vo2max_est.toFixed(1) : '-';

        detailsDiv.innerHTML = `
            <h2>${name}</h2>
            ${description ? `<p>${description}</p>` : ''}
            <ul>
                <li>📅 <strong>Date:</strong> ${date}</li>
                <li>🏷️ <strong>Type:</strong> ${activityType}</li>
                <li>👟 <strong>Gear:</strong> ${gear}</li>
                <li>🌦️ <strong>Weather:</strong> ${weatherStr}</li>
                <li>💬 <strong>Comments:</strong> ${commentCount}</li>
                <li>👍 <strong>Kudos:</strong> ${kudos}</li>
            </ul>
            <h3>Stats</h3>
            <ul>
                <li>⏱️ <strong>Duration:</strong> ${duration}</li>
                <li>📏 <strong>Distance:</strong> ${distanceKm} km</li>
                <li>🐢 <strong>Pace:</strong> ${pace} min/km</li>
                <li>⛰️ <strong>Elevation Gain:</strong> ${elevation} m</li>
                <li>🔥 <strong>Calories:</strong> ${calories}</li>
                <li>❤️ <strong>HR Avg:</strong> ${hrAvg} bpm</li>
                <li>❤️‍🔥 <strong>HR Max:</strong> ${hrMax} bpm</li>
            </ul>
            <h3>Advanced Stats</h3>
            <ul>
                <li>🚦 <strong>Move Ratio:</strong> ${moveRatio}</li>
                <li>💪 <strong>Effort:</strong> ${effort}</li>
                <li>🧬 <strong>VO₂max (est):</strong> ${vo2max}</li>
            </ul>
        `;

        // --- Renderizado del mapa ---
        if (act.map?.summary_polyline && window.L) {
            const coords = decodePolyline(act.map.summary_polyline);
            if (coords.length > 0) {
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
    }
    
    // ¡CORREGIDO! Ahora esta función está definida ANTES de que main la llame.
    function renderStreamCharts(streams) {
        if (!streams || !streams.distance || !streams.distance.data || streams.distance.data.length === 0) {
            streamChartsDiv.innerHTML = '<p>No detailed stream data available.</p>';
            return;
        }

        const { distance, time, heartrate, altitude } = streams;
        const distLabels = distance.data.map(d => (d/1000).toFixed(2));

        // 1. Altitud vs Distancia
        new Chart(document.getElementById('chart-altitude'), {
            type: 'line',
            data: { labels: distLabels, datasets: [{ label: 'Altitud (m)', data: altitude.data, borderColor: '#888', pointRadius: 0 }] }
        });
        
        // 2. Ritmo vs Distancia
        const paceStreamData = [];
        for (let i = 1; i < distance.data.length; i++) {
            const deltaDist = distance.data[i] - distance.data[i-1];
            const deltaTime = time.data[i] - time.data[i-1];
            if (deltaDist > 0 && deltaTime > 0) {
                const speed = deltaDist / deltaTime; // m/s
                paceStreamData.push(1000 / speed); // s/km
            } else {
                paceStreamData.push(null);
            }
        }
        new Chart(document.getElementById('chart-pace-distance'), {
            type: 'line',
            data: { labels: distLabels.slice(1), datasets: [{ label: 'Ritmo (s/km)', data: paceStreamData, borderColor: '#FC5200', pointRadius: 0 }] },
            options: { scales: { y: { reverse: true } } } // Invertir eje Y para que ritmos más rápidos estén arriba
        });

        // 3. FC vs Distancia
        new Chart(document.getElementById('chart-heart-distance'), {
            type: 'line',
            data: { labels: distLabels, datasets: [{ label: 'FC (bpm)', data: heartrate.data, borderColor: 'red', pointRadius: 0 }] }
        });
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
            detailsDiv.innerHTML = '<p>Loading activity details...</p>';
            streamChartsDiv.style.display = 'none';

            const [activityData, streamData] = await Promise.all([
                fetchActivityDetails(activityId, authPayload),
                fetchActivityStreams(activityId, authPayload)
            ]);

            // ¡Ahora estas llamadas funcionarán porque las funciones ya están definidas!
            renderActivity(activityData);
            renderStreamCharts(streamData);

        } catch (error) {
            console.error("Failed to load activity page:", error);
            detailsDiv.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
        }
    }

    // Ejecutamos la función principal
    main();
});