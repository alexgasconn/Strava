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
        const name = act.name;
        const date = new Date(act.start_date_local).toLocaleDateString();
        const distanceKm = (act.distance / 1000).toFixed(2);
        const duration = formatTime(act.moving_time);
        const pace = formatPace(act.average_speed);
        const hr = act.average_heartrate ? Math.round(act.average_heartrate) : '-';
        const gear = act.gear?.name || 'N/A';
        const device = act.device_name || 'N/A';

        detailsDiv.innerHTML = `
            <h2>${name}</h2>
            <ul>
                <li>📅 <strong>Fecha:</strong> ${date}</li>
                <li>📏 <strong>Distancia:</strong> ${distanceKm} km</li>
                <li>⏱️ <strong>Duración:</strong> ${duration}</li>
                <li>🐢 <strong>Ritmo medio:</strong> ${pace} min/km</li>
                <li>❤️ <strong>FC media:</strong> ${hr} bpm</li>
                <li>👟 <strong>Zapatillas:</strong> ${gear}</li>
                <li>📱 <strong>Dispositivo:</strong> ${device}</li>
            </ul>
        `;

        // Renderizado del mapa
        if (act.map?.summary_polyline && window.L) {
            const coords = L.Polyline.fromEncoded(act.map.summary_polyline).getLatLngs();
            if (coords.length > 0) {
                const map = L.map('activity-map').setView(coords[0], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
            }
        } else {
            mapDiv.innerHTML = '<p>No route data available</p>';
        }

        // Renderizado de Splits
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