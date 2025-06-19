// js/activity.js

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

// La función decodePolyline es necesaria si la API no devuelve la ruta decodificada.
// La mantenemos por si acaso, aunque la API de actividad suele darla.
function decodePolyline(str) { /* ... Tu función de decodePolyline original va aquí, sin cambios ... */ }


// --- 3. LÓGICA DE LA API ---

/**
 * Obtiene los tokens del localStorage.
 * ¡CORREGIDO! Ahora lee el objeto JSON 'strava_tokens'.
 * @returns {{accessToken: string, refreshToken: string}|null}
 */
function getTokens() {
    const tokenString = localStorage.getItem('strava_tokens');
    if (!tokenString) {
        return null;
    }
    try {
        const tokenData = JSON.parse(tokenString);
        return {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token
        };
    } catch (e) {
        console.error("Error parsing tokens from localStorage", e);
        return null;
    }
}

/**
 * Función genérica para hacer llamadas a nuestra API de backend.
 * Centraliza el manejo de cabeceras de autenticación.
 * @param {string} url - La URL del endpoint de la API.
 * @param {{accessToken: string, refreshToken: string}} tokens - Los tokens de autenticación.
 * @returns {Promise<any>} - Los datos JSON de la respuesta.
 */
async function fetchFromApi(url, tokens) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            // ¡IMPORTANTE! Pasamos el refresh token en una cabecera personalizada
            // que nuestros endpoints de backend (strava-activity, strava-streams) esperan.
            'x-refresh-token': tokens.refreshToken || ''
        }
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error ${response.status}: ${errorData.error || 'Failed to fetch'}`);
    }

    // Si la API nos devuelve un token nuevo (porque el anterior expiró), lo actualizamos.
    const newAccessToken = response.headers.get('x-new-access-token');
    if (newAccessToken) {
        console.log('Received a new access token, updating localStorage...');
        const storedTokens = JSON.parse(localStorage.getItem('strava_tokens'));
        storedTokens.access_token = newAccessToken;
        // Nota: La API de Strava puede o no devolver un nuevo refresh_token.
        // Por ahora, solo actualizamos el de acceso que es el que cambia más a menudo.
        localStorage.setItem('strava_tokens', JSON.stringify(storedTokens));
    }

    return response.json();
}

async function fetchActivityDetails(activityId, tokens) {
    return fetchFromApi(`/api/strava-activity?id=${activityId}`, tokens);
}

async function fetchActivityStreams(activityId, tokens) {
    const streamTypes = 'distance,time,heartrate,altitude';
    return fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, tokens);
}

// --- 4. LÓGICA DE RENDERIZADO ---

function renderActivity(act) {
    // ... (Tu función renderActivity original va aquí, casi sin cambios) ...
    // Solo asegúrate de que usas las funciones de formato actualizadas.
    // Por ejemplo:
    detailsDiv.innerHTML = `
        <h2>${act.name}</h2>
        <ul>
            <li>📅 <strong>Fecha:</strong> ${new Date(act.start_date_local).toLocaleDateString()}</li>
            <li>📏 <strong>Distancia:</strong> ${(act.distance / 1000).toFixed(2)} km</li>
            <li>⏱️ <strong>Duración:</strong> ${formatTime(act.moving_time)}</li>
            <li>🐢 <strong>Ritmo medio:</strong> ${formatPace(act.average_speed)} min/km</li>
            <!-- etc. -->
        </ul>
    `;

    // Renderizado del mapa
    if (act.map?.summary_polyline) {
        const coords = L.Polyline.fromEncoded(act.map.summary_polyline).getLatLngs();
        const map = L.map('activity-map').setView(coords[0], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
    } else {
        mapDiv.innerHTML = '<p>No route data available</p>';
    }

    // Renderizado de Splits (sin cambios)
    if (act.splits_metric?.length > 0) { /* ... */ }

    // Renderizado de Segmentos (sin cambios)
    if (act.segment_efforts?.length > 0) { /* ... */ }
}

function renderStreamCharts(streams) {
    streamChartsDiv.style.display = 'block';

    const { distance, time, heartrate, altitude } = streams;
    if (!distance || distance.data.length === 0) return;

    // 1. Altitud vs Distancia
    new Chart(document.getElementById('chart-altitude'), { /* ... config ... */ });
    
    // 2. Ritmo vs Distancia (¡Cálculo mejorado!)
    const paceStreamData = [];
    for (let i = 1; i < distance.data.length; i++) {
        const deltaDist = distance.data[i] - distance.data[i-1];
        const deltaTime = time.data[i] - time.data[i-1];
        if (deltaDist <= 0 || deltaTime <= 0) {
            paceStreamData.push(null);
        } else {
            const speed = deltaDist / deltaTime; // m/s
            paceStreamData.push(1000 / speed); // s/km
        }
    }
    // ... (Crear el gráfico de ritmo con paceStreamData) ...

    // 3. FC vs Distancia
    new Chart(document.getElementById('chart-heart-distance'), { /* ... config ... */ });
}

// --- 5. PUNTO DE ENTRADA DE LA APLICACIÓN ---

async function main() {
    if (!activityId) {
        detailsDiv.innerHTML = '<p>Error: No Activity ID provided.</p>';
        return;
    }

    const tokens = getTokens();
    if (!tokens) {
        detailsDiv.innerHTML = '<p>You must be logged in to view activity details. Please return to the dashboard and log in.</p>';
        return;
    }

    try {
        detailsDiv.innerHTML = '<p>Loading activity details...</p>';

        // Hacemos las llamadas a la API en paralelo para más velocidad
        const [activityData, streamData] = await Promise.all([
            fetchActivityDetails(activityId, tokens),
            fetchActivityStreams(activityId, tokens)
        ]);

        // Renderizamos todo
        renderActivity(activityData);
        renderStreamCharts(streamData);

    } catch (error) {
        console.error("Failed to load activity page:", error);
        detailsDiv.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
    }
}

// Ejecutamos la función principal
main();