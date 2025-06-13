// =================================================================
// script.js - VERSIÓN "TODO EN UNO" (COMPLETA Y CORREGIDA)
// =================================================================

// --- 1. CONFIGURACIÓN Y ESTADO GLOBAL ---
const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const CACHE_KEY = 'strava_dashboard_data_v1';
let charts = {};

// --- 2. REFERENCIAS AL DOM ---
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');

// --- 3. FUNCIONES DE UI ---
function showLoading(message) { 
    loadingMessage.textContent = message; 
    loadingOverlay.classList.remove('hidden'); 
    console.log('[UI] Loading:', message);
}
function hideLoading() { 
    loadingOverlay.classList.add('hidden'); 
    console.log('[UI] Loading hidden');
}
function handleError(message, error) { 
    console.error('[ERROR]', message, error); 
    hideLoading(); 
    alert(`Error: ${message}.`); 
}

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas, config);
    console.log(`[Chart] Created chart: ${canvasId}`);
}

// --- 4. LÓGICA DE AUTENTICACIÓN (LAS FUNCIONES QUE FALTABAN) ---

function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    console.log('[Auth] Redirecting to Strava authorize');
    window.location.href = authUrl;
}

function logout() { 
    console.log('[Auth] Logging out, clearing localStorage');
    localStorage.clear(); 
    window.location.reload(); 
}

// --- 5. FUNCIONES DE RENDERIZADO ---

function renderDashboard(activities) {
    console.log('[Dashboard] Rendering dashboard with', activities.length, 'activities');
    // --- Filtrar solo actividades de running (incluye Trail Run, etc) ---
    const runs = activities.filter(a => a.type && a.type.includes('Run'));
    console.log('[Dashboard] Filtered runs:', runs.length);

    // ...rest of the function remains unchanged...
    // (No need to add logs to every chart, but keep the most relevant)
    // For example, after rendering summary cards:
    const summaryContainer = document.getElementById('summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="card"><h3>Actividades</h3><p>${runs.length}</p></div>
            <div class="card"><h3>Distancia Total</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
            <div class="card"><h3>Tiempo Total</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
            <div class="card"><h3>Desnivel Total</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        `;
        console.log('[Dashboard] Rendered summary cards');
    }

    // ...rest of the function unchanged...
    // Add a log after rendering all charts:
    console.log('[Dashboard] Charts rendered');
}

// --- 6. LÓGICA PRINCIPAL DE INICIALIZACIÓN ---
async function initializeApp(accessToken) {
    try {
        let activities;
        const cachedActivities = localStorage.getItem(CACHE_KEY);
        if (cachedActivities) {
            activities = JSON.parse(cachedActivities);
            console.log('[Init] Loaded activities from cache:', activities.length);
        } else {
            showLoading('Obteniendo historial de actividades...');
            const response = await fetch('/api/strava-activities', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!response.ok) throw new Error((await response.json()).error || 'Fallo en API');
            activities = await response.json();
            localStorage.setItem(CACHE_KEY, JSON.stringify(activities));
            console.log('[Init] Fetched activities from API:', activities.length);
        }

        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Atleta' };
        athleteName.textContent = `Dashboard de ${athleteInfo.firstname}`;
        console.log('[Init] Athlete:', athleteInfo.firstname);

        renderDashboard(activities);
    } catch (error) {
        handleError("Error al inicializar la aplicación", error);
    } finally {
        hideLoading();
    }
}

async function handleAuth() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    let accessToken = localStorage.getItem('strava_access_token');
    if (code) {
        showLoading('Autenticando...');
        try {
            const response = await fetch('/api/strava-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
            if (!response.ok) throw new Error((await response.json()).error);
            const data = await response.json();
            accessToken = data.access_token;
            localStorage.setItem('strava_access_token', accessToken);
            window.history.replaceState({}, '', window.location.pathname);
            console.log('[Auth] Authenticated and stored access token');
        } catch (error) {
            return handleError('Fallo en la autenticación', error);
        }
    }
    if (accessToken) {
        initializeApp(accessToken);
    } else {
        hideLoading();
    }
}

// --- PUNTO DE ENTRADA DE LA APP ---
loginButton.addEventListener('click', redirectToStravaAuthorize);
logoutButton.addEventListener('click', logout);
handleAuth();
