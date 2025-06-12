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
function showLoading(message) { loadingMessage.textContent = message; loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay.classList.add('hidden'); }
function handleError(message, error) { console.error(message, error); hideLoading(); alert(`Error: ${message}.`); }

// --- 4. LÓGICA DE AUTENTICACIÓN (LAS FUNCIONES QUE FALTABAN) ---

function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

function logout() { 
    localStorage.clear(); 
    window.location.reload(); 
}

// --- 5. FUNCIONES DE RENDERIZADO ---

// REEMPLAZA ESTA FUNCIÓN ENTERA
function renderDashboard(activities) {
    // --- Tarjetas de Resumen (Sin cambios) ---
    const summaryContainer = document.getElementById('summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="card"><h3>Actividades</h3><p>${activities.length}</p></div>
            <div class="card"><h3>Distancia Total</h3><p>${(activities.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
            <div class="card"><h3>Tiempo Total</h3><p>${(activities.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
            <div class="card"><h3>Desnivel Total</h3><p>${activities.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        `;
    }

    // --- Heatmap de Consistencia (Sin cambios) ---
    const cal = new CalHeatmap();
    // ... (El código del heatmap se queda igual, no lo he pegado aquí para abreviar)
    const aggregatedData = activities.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {});
    const heatmapContainer = document.getElementById('cal-heatmap');
    if (heatmapContainer) {
        heatmapContainer.innerHTML = '';
        cal.paint({
            itemSelector: heatmapContainer,
            domain: { type: "month", label: { text: "MMM" } },
            subDomain: { type: "ghDay", radius: 2, width: 11, height: 11 },
            range: 12,
            data: { source: Object.entries(aggregatedData).map(([date, value]) => ({ date, value })), x: 'date', y: 'value' },
            scale: { color: { type: 'threshold', range: ['#ebedf0', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26'], domain: [1, 2, 3, 4] } },
            date: { start: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
        });
    }

    // --- Creación de gráficos explícita y segura ---

    // Gráfico de Barras: Actividades por Tipo
    const counts = activities.reduce((acc, act) => { acc[act.type] = (acc[act.type] || 0) + 1; return acc; }, {});
    const activityTypeCanvas = document.getElementById('activity-type-barchart');
    if (activityTypeCanvas && !charts['activity-type-barchart']) {
        charts['activity-type-barchart'] = new Chart(activityTypeCanvas, {
            type: 'bar', // TIPO CORRECTO
            data: { labels: Object.keys(counts), datasets: [{ label: '# Actividades', data: Object.values(counts), backgroundColor: 'rgba(252, 82, 0, 0.7)' }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // Gráfico de Líneas: Distancia Mensual
    const monthlyDistance = activities.reduce((acc, act) => {
        const month = act.start_date_local.substring(0, 7);
        acc[month] = (acc[month] || 0) + (act.distance / 1000);
        return acc;
    }, {});
    const monthlyDistanceCanvas = document.getElementById('monthly-distance-chart');
    if (monthlyDistanceCanvas && !charts['monthly-distance-chart']) {
        charts['monthly-distance-chart'] = new Chart(monthlyDistanceCanvas, {
            type: 'line', // TIPO CORRECTO
            data: {
                labels: Object.keys(monthlyDistance).sort(),
                datasets: [{ label: 'Distancia (km)', data: Object.values(monthlyDistance), borderColor: '#FC5200', fill: false, tension: 0.1 }]
            }
        });
    }

    // Scatter Plot: Ritmo vs Distancia (Running)
    const runs = activities.filter(a => a.type === 'Run' && a.distance > 0);
    const paceVsDistanceCanvas = document.getElementById('pace-vs-distance-chart');
    if (paceVsDistanceCanvas && !charts['pace-vs-distance-chart']) {
        charts['pace-vs-distance-chart'] = new Chart(paceVsDistanceCanvas, {
            type: 'scatter', // TIPO CORRECTO
            data: {
                datasets: [{
                    label: 'Carreras',
                    data: runs.map(r => ({ x: r.distance / 1000, y: r.moving_time / (r.distance / 1000) })),
                    backgroundColor: 'rgba(252, 82, 0, 0.7)'
                }]
            },
            options: { scales: { x: { title: { display: true, text: 'Distancia (km)' } }, y: { title: { display: true, text: 'Ritmo (seg/km)' } } } }
        });
    }

    // Histograma: Desnivel (Ciclismo)
    const rides = activities.filter(a => a.type === 'Ride');
    const rideElevBins = rides.reduce((acc, ride) => {
        const bin = Math.floor(ride.total_elevation_gain / 200) * 200;
        acc[bin] = (acc[bin] || 0) + 1;
        return acc;
    }, {});
    const rideElevationCanvas = document.getElementById('ride-elevation-histogram');
    if (rideElevationCanvas && !charts['ride-elevation-histogram']) {
        charts['ride-elevation-histogram'] = new Chart(rideElevationCanvas, {
            type: 'bar', // TIPO CORRECTO
            data: {
                labels: Object.keys(rideElevBins).sort((a,b) => parseInt(a)-parseInt(b)).map(l => `${l}m`),
                datasets: [{ label: '# Salidas', data: Object.values(rideElevBins), backgroundColor: 'rgba(0, 119, 182, 0.7)' }]
            }
        });
    }
}

// --- 6. LÓGICA PRINCIPAL DE INICIALIZACIÓN ---
async function initializeApp(accessToken) {
    try {
        let activities;
        const cachedActivities = localStorage.getItem(CACHE_KEY);
        if (cachedActivities) {
            activities = JSON.parse(cachedActivities);
        } else {
            showLoading('Obteniendo historial de actividades...');
            const response = await fetch('/api/strava-activities', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!response.ok) throw new Error((await response.json()).error || 'Fallo en API');
            activities = await response.json();
            localStorage.setItem(CACHE_KEY, JSON.stringify(activities));
        }

        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Atleta' };
        athleteName.textContent = `Dashboard de ${athleteInfo.firstname}`;

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
