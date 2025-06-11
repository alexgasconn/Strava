// =================================================================
// script.js - VERSIÓN ULTRA-SIMPLIFICADA
// =================================================================

// --- 1. CONFIGURACIÓN Y REFERENCIAS AL DOM ---
const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const CACHE_KEY = 'strava_simple_data_v1';

const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');

// --- 2. FUNCIONES DE UI ---
function showLoading(message) {
    loadingMessage.textContent = message;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Revisa la consola.`);
}

// --- 3. LÓGICA DE LA APP ---
function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

function renderDashboard(activities) {
    console.log("Renderizando dashboard simple...");

    // 1. Calcular resúmenes
    const totalActivities = activities.length;
    const totalDistance = activities.reduce((sum, act) => sum + (act.distance / 1000), 0);
    const totalHours = activities.reduce((sum, act) => sum + (act.moving_time / 3600), 0);

    // 2. Mostrar tarjetas de resumen
    const summaryContainer = document.getElementById('summary-cards');
    summaryContainer.innerHTML = `
        <div class="card"><h3>Actividades</h3><p>${totalActivities}</p></div>
        <div class="card"><h3>Distancia Total</h3><p>${totalDistance.toFixed(0)} km</p></div>
        <div class="card"><h3>Horas en Mov.</h3><p>${totalHours.toFixed(1)} h</p></div>
    `;

    // 3. Contar actividades por tipo para el gráfico
    const activityCounts = activities.reduce((acc, act) => {
        acc[act.type] = (acc[act.type] || 0) + 1;
        return acc;
    }, {});
    
    // 4. Renderizar un gráfico de barras simple
    const canvas = document.getElementById('simple-bar-chart');
    if (canvas) {
        new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(activityCounts),
                datasets: [{
                    label: 'Número de Actividades',
                    data: Object.values(activityCounts),
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                }]
            },
            options: { indexAxis: 'y' } // Barras horizontales para mejor lectura
        });
    }
}

async function initializeApp(accessToken) {
    try {
        showLoading('Cargando datos...');
        let activities;
        const cachedActivities = localStorage.getItem(CACHE_KEY);

        if (cachedActivities) {
            console.log('Cargando desde caché...');
            activities = JSON.parse(cachedActivities);
        } else {
            console.log('Obteniendo desde API de Strava...');
            const response = await fetch('/api/strava-activities', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) throw new Error('Fallo al obtener actividades de la API.');
            activities = await response.json();
            localStorage.setItem(CACHE_KEY, JSON.stringify(activities));
        }

        console.log(`${activities.length} actividades cargadas.`);

        // Mostrar la app y el nombre del atleta
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Atleta', lastname: '' };
        athleteName.textContent = `Dashboard de ${athleteInfo.firstname} ${athleteInfo.lastname}`;

        // Renderizar el contenido
        renderDashboard(activities);

    } catch (error) {
        handleError("Error al inicializar la aplicación", error);
    } finally {
        // Asegurarnos de que el spinner siempre desaparece
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
            const response = await fetch('/api/strava-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            accessToken = data.access_token;
            localStorage.setItem('strava_access_token', accessToken);
            window.history.replaceState({}, '', window.location.pathname);
        } catch (error) {
            handleError('Fallo en la autenticación', error);
            return;
        }
    }

    if (accessToken) {
        initializeApp(accessToken);
    } else {
        hideLoading(); // Ocultar si no hay token y no hay código
    }
}

// --- PUNTO DE ENTRADA ---
loginButton.addEventListener('click', redirectToStravaAuthorize);
logoutButton.addEventListener('click', logout);
handleAuth();