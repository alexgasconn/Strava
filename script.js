// --- CONFIGURACIÓN ---
// ¡¡IMPORTANTE!! Reemplaza esto con tu Client ID de Strava
const STRAVA_CLIENT_ID = '143540'; 
const REDIRECT_URI = window.location.origin + window.location.pathname;

// --- ELEMENTOS DEL DOM ---
const loginSection = document.getElementById('login-section');
const statsSection = document.getElementById('stats-section');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');
const statsGrid = document.getElementById('stats-grid');
const loadingMessage = document.getElementById('loading-message');

// --- LÓGICA DE AUTENTICACIÓN ---

/**
 * Redirige al usuario a la página de autorización de Strava.
 */
function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all'; // Permisos que pedimos
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

/**
 * Maneja el código de autorización que Strava nos devuelve.
 * Esto es complicado en un sitio estático porque necesitamos intercambiar el código
 * por un token de acceso, y eso requiere el Client Secret (que no debe estar aquí).
 * 
 * SOLUCIÓN: Usaremos un "truco". El flujo OAuth de Strava para clientes públicos
 * (como el nuestro) está diseñado para devolver el token de acceso directamente
 * si usamos 'response_type=token'. PERO, por seguridad, es mejor el flujo de código.
 * Como este es un MVP y no manejaremos datos sensibles más allá de la lectura,
 * procederemos con el flujo de código, pero necesitaremos un pequeño "proxy" o
 * una solución más avanzada a futuro. Por ahora, asumiremos que obtenemos el token.
 * 
 * **Actualización para un enfoque 100% estático:**
 * Strava no soporta el flujo implícito (response_type=token) directamente.
 * El flujo estándar REQUIERE un backend para intercambiar el código.
 * 
 * **LA SOLUCIÓN REAL PARA UN SITIO ESTÁTICO:**
 * Strava en 2023 permite un flujo donde el `code` se intercambia por un `access_token`
 * sin `client_secret` para clientes públicos, pero la llamada debe ser POST,
 * lo que puede ser bloqueado por CORS si se hace desde el navegador.
 * 
 * Vamos a simular el flujo ideal y luego ver cómo resolverlo.
 * Por ahora, vamos a leer el token si ya lo tenemos guardado.
 */
// En tu archivo script.js

// ... (todo el código anterior se queda igual) ...

/**
 * ¡NUEVA VERSIÓN DE LA FUNCIÓN!
 * Maneja el código de autorización que Strava nos devuelve,
 * llamando a nuestro propio micro-backend para obtener el token.
 */
async function handleOAuthCallback(code) {
    loadingMessage.textContent = 'Autenticando con Strava...';
    
    try {
        // Hacemos una llamada POST a nuestra propia función serverless
        // Vercel la hará disponible en la ruta /api/strava-auth
        const response = await fetch('/api/strava-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: code }), // Enviamos el código en el cuerpo
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Fallo en el servidor de autenticación');
        }

        // La respuesta 'data' de nuestro proxy contiene el access_token, refresh_token, etc.
        const { access_token } = data;

        // Guardamos el token en localStorage
        localStorage.setItem('strava_access_token', access_token);

        // Limpiamos la URL y mostramos las estadísticas
        window.history.replaceState({}, document.title, window.location.pathname);
        showStats(access_token);

    } catch (error) {
        console.error('Error durante el proceso de autenticación:', error);
        loadingMessage.textContent = `Error de autenticación: ${error.message}`;
    }
}


// ... (el resto de tu script.js, como fetchAthleteStats, showStats, etc., se queda igual) ...


/**
 * Obtiene las estadísticas del atleta de la API de Strava.
 */
async function fetchAthleteStats(accessToken) {
    loadingMessage.textContent = 'Obteniendo tus estadísticas...';
    try {
        const response = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            // Si el token ha expirado o es inválido
            if (response.status === 401) {
                logout();
                alert('Tu sesión de Strava ha expirado. Por favor, conéctate de nuevo.');
            }
            throw new Error(`Error de la API de Strava: ${response.statusText}`);
        }

        const athleteData = await response.json();

        const statsResponse = await fetch(`https://www.strava.com/api/v3/athletes/${athleteData.id}/stats`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const statsData = await statsResponse.json();
        
        loadingMessage.textContent = '';
        return { athlete: athleteData, stats: statsData };

    } catch (error) {
        console.error('Error al obtener datos de Strava:', error);
        loadingMessage.textContent = 'No se pudieron cargar los datos.';
        return null;
    }
}

/**
 * Muestra las estadísticas en la página.
 */
function showStats(accessToken) {
    loginSection.classList.add('hidden');
    statsSection.classList.remove('hidden');

    fetchAthleteStats(accessToken).then(data => {
        if (!data) return;

        const { athlete, stats } = data;
        athleteName.textContent = `Bienvenido, ${athlete.firstname} ${athlete.lastname}!`;
        
        const allTimeRideTotals = stats.all_ride_totals;
        const allTimeRunTotals = stats.all_run_totals;

        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>Total Carreras</h3>
                <p>${allTimeRunTotals.count}</p>
            </div>
            <div class="stat-card">
                <h3>Distancia Corriendo</h3>
                <p>${(allTimeRunTotals.distance / 1000).toFixed(2)} km</p>
            </div>
            <div class="stat-card">
                <h3>Total Bici</h3>
                <p>${allTimeRideTotals.count}</p>
            </div>
            <div class="stat-card">
                <h3>Distancia en Bici</h3>
                <p>${(allTimeRideTotals.distance / 1000).toFixed(2)} km</p>
            </div>
        `;
    });
}

/**
 * Cierra la sesión borrando los datos guardados.
 */
function logout() {
    localStorage.removeItem('strava_access_token');
    localStorage.removeItem('strava_auth_code');
    loginSection.classList.remove('hidden');
    statsSection.classList.add('hidden');
    athleteName.textContent = '';
    statsGrid.innerHTML = '';
}

// --- LÓGICA DE INICIO ---

/**
 * Punto de entrada principal. Se ejecuta cuando la página se carga.
 */
function main() {
    loginButton.addEventListener('click', redirectToStravaAuthorize);
    logoutButton.addEventListener('click', logout);

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    const accessToken = localStorage.getItem('strava_access_token');

    if (accessToken) {
        // Si ya tenemos un token, mostramos las estadísticas
        showStats(accessToken);
    } else if (code) {
        // Si Strava nos ha devuelto un código, lo manejamos
        // NOTA: Como se explicó, este paso es problemático en un sitio estático.
        // La función handleOAuthCallback explica el problema y la solución temporal.
        handleOAuthCallback(code);
    } else {
        // Si no hay ni token ni código, mostramos el botón de login
        loginSection.classList.remove('hidden');
    }
}

main();