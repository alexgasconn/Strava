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
 * ¡CORRECCIÓN CLAVE!
 * En lugar de devolver un objeto con accessToken y refreshToken,
 * esta función ahora devuelve el objeto de token completo codificado
 * en Base64, igual que en la app principal.
 * @returns {string|null} - El payload del token codificado o null.
 */
function getAuthPayload() {
    const tokenString = localStorage.getItem('strava_tokens');
    if (!tokenString) {
        return null;
    }
    // No necesitamos parsearlo, solo lo codificamos
    return btoa(tokenString); 
}


/**
 * Función genérica para hacer llamadas a nuestra API de backend.
 * @param {string} url - La URL del endpoint de la API.
 * @param {string} authPayload - El payload del token codificado.
 * @returns {Promise<any>} - Los datos JSON de la respuesta.
 */
async function fetchFromApi(url, authPayload) {
    const response = await fetch(url, {
        headers: {
            // Enviamos el payload completo, igual que en main.js
            'Authorization': `Bearer ${authPayload}`
        }
    });

    if (!response.ok) {
        // Intentamos leer el error como texto, ya que puede no ser JSON
        const errorText = await response.text();
        console.error("API Error Response Text:", errorText);
        try {
            // Intentamos parsear por si acaso es JSON
            const errorData = JSON.parse(errorText);
            throw new Error(`API Error ${response.status}: ${errorData.error || 'Failed to fetch'}`);
        } catch (e) {
            // Si no es JSON, mostramos el texto del error
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
    }

    const result = await response.json();
    
    // Si la API devuelve tokens actualizados, los guardamos
    if (result.tokens) {
        console.log('Received new tokens, updating localStorage.');
        localStorage.setItem('strava_tokens', JSON.stringify(result.tokens));
    }

    return result;
}

async function fetchActivityDetails(activityId, authPayload) {
    // La función ahora devuelve el objeto de la actividad directamente
    const result = await fetchFromApi(`/api/strava-activity?id=${activityId}`, authPayload);
    return result.activity; // Asumimos que el backend devuelve { activity: {...}, tokens: ... }
}

async function fetchActivityStreams(activityId, authPayload) {
    const streamTypes = 'distance,time,heartrate,altitude';
    const result = await fetchFromApi(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, authPayload);
    return result.streams; // Asumimos que el backend devuelve { streams: {...}, tokens: ... }
}


// --- 5. PUNTO DE ENTRADA DE LA APLICACIÓN ---

async function main() {
    if (!activityId) { /* ... */ }

    // Obtenemos el payload codificado directamente
    const authPayload = getAuthPayload();
    if (!authPayload) {
        detailsDiv.innerHTML = '<p>You must be logged in to view activity details...</p>';
        return;
    }

    try {
        detailsDiv.innerHTML = '<p>Loading activity details...</p>';
        
        const [activityData, streamData] = await Promise.all([
            fetchActivityDetails(activityId, authPayload),
            fetchActivityStreams(activityId, authPayload)
        ]);

        renderActivity(activityData);
        renderStreamCharts(streamData);

    } catch (error) {
        console.error("Failed to load activity page:", error);
        detailsDiv.innerHTML = `<p><strong>Error loading activity:</strong> ${error.message}</p>`;
    }
}

// Ejecutamos la función principal
main();