// =================================================================
// 1. CONFIGURACIÓN Y ELEMENTOS DEL DOM
// =================================================================
const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');
const tabsContainer = document.getElementById('tabs');

let allActivities = [];
// Objeto para almacenar instancias de todos los gráficos y evitar re-renderizado
let charts = {};

// =================================================================
// 2. LÓGICA DE AUTENTICACIÓN Y DATOS
// =================================================================

function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

async function handleOAuthCallback(code) {
    showLoading('Autenticando...');
    try {
        const response = await fetch('/api/strava-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        localStorage.setItem('strava_access_token', data.access_token);
        window.history.replaceState({}, document.title, window.location.pathname);
        initializeApp(data.access_token);
    } catch (error) {
        handleError('Fallo en la autenticación', error);
    }
}

async function fetchAllActivities(accessToken) {
    showLoading('Obteniendo historial de actividades... Esto puede tardar unos momentos.');
    try {
        const response = await fetch('/api/strava-activities', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) {
            const data = await response.json();
            if (response.status === 401) {
                logout();
                alert('Tu sesión ha expirado. Por favor, conéctate de nuevo.');
            }
            throw new Error(data.error || 'No se pudieron obtener las actividades.');
        }
        return await response.json();
    } catch (error) {
        handleError('No se pudieron cargar las actividades', error);
    }
}

// =================================================================
// 3. PROCESAMIENTO Y VISUALIZACIÓN DE DATOS
// =================================================================

function preprocessData(activities) {
    return activities.map(act => ({
        ...act,
        distance_km: act.distance / 1000,
        moving_time_hours: act.moving_time / 3600,
        elevation_gain_m: act.total_elevation_gain,
        start_date_local_obj: new Date(act.start_date_local),
    }));
}

function renderSummaryCards() {
    const totalRuns = allActivities.filter(a => a.type === 'Run').length;
    const totalRides = allActivities.filter(a => a.type === 'Ride').length;
    const totalSwims = allActivities.filter(a => a.type === 'Swim').length;
    const totalDistance = allActivities.reduce((sum, a) => sum + a.distance_km, 0);
    const summaryCardsContainer = document.getElementById('summary-cards');
    if(summaryCardsContainer){
        summaryCardsContainer.innerHTML = `
            <div class="card"><h3>Distancia Total</h3><p>${totalDistance.toFixed(0)} km</p></div>
            <div class="card"><h3>Carreras</h3><p>${totalRuns}</p></div>
            <div class="card"><h3>Salidas en Bici</h3><p>${totalRides}</p></div>
            <div class="card"><h3>Sesiones de Natación</h3><p>${totalSwims}</p></div>
        `;
    }
}

function renderOverviewTab() {
    console.log("Renderizando pestaña Overview...");
    renderSummaryCards();

    const cal = new CalHeatmap();
    const heatmapData = allActivities.map(act => ({
        date: act.start_date_local.substring(0, 10),
        value: 1
    }));
    
    // Agrupar datos para contar actividades por día
    const aggregatedData = heatmapData.reduce((acc, curr) => {
        acc[curr.date] = (acc[curr.date] || 0) + curr.value;
        return acc;
    }, {});

    const finalHeatmapData = Object.keys(aggregatedData).map(date => ({
        date: date,
        value: aggregatedData[date]
    }));

    cal.paint({
        itemSelector: "#cal-heatmap",
        domain: { type: "month" },
        subDomain: { type: "ghDay", radius: 2, width: 11, height: 11, gutter: 4 },
        range: 12,
        data: { source: finalHeatmapData, x: 'date', y: 'value' },
        scale: {
            color: {
                type: 'threshold',
                range: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
                domain: [1, 2, 3, 4]
            }
        },
        date: { start: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
    });
}

function renderAnalysisTab() {
    console.log("Renderizando pestaña Analysis...");
    renderDistanceOverTime();
    renderElevationDistribution();
    renderAvgSpeedByType();
}

function renderDistanceOverTime() {
    const canvasId = 'distance-over-time';
    const canvas = document.getElementById(canvasId);
    if (!canvas || charts[canvasId]) return;

    const sorted = [...allActivities].sort((a, b) => a.start_date_local_obj - b.start_date_local_obj);
    charts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: sorted.map(a => a.start_date_local_obj.toLocaleDateString()),
            datasets: [{
                label: 'Distancia (km)',
                data: sorted.map(a => a.distance_km),
                borderColor: '#FC5200',
                backgroundColor: 'rgba(252, 82, 0, 0.2)',
                fill: true,
                tension: 0.4
            }]
        }
    });
}

function renderElevationDistribution() {
    const canvasId = 'elevation-distribution';
    const canvas = document.getElementById(canvasId);
    if (!canvas || charts[canvasId]) return;

    const bins = allActivities.reduce((acc, a) => {
        const bin = Math.floor(a.elevation_gain_m / 100) * 100;
        acc[bin] = (acc[bin] || 0) + 1;
        return acc;
    }, {});
    const labels = Object.keys(bins).sort((a, b) => a - b);
    
    charts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels.map(l => `${l}-${parseInt(l)+99}m`),
            datasets: [{
                label: 'Número de actividades',
                data: labels.map(bin => bins[bin]),
                backgroundColor: 'rgba(0, 119, 182, 0.7)'
            }]
        }
    });
}

function renderAvgSpeedByType() {
    const canvasId = 'avg-speed-by-type';
    const canvas = document.getElementById(canvasId);
    if (!canvas || charts[canvasId]) return;

    const speedData = allActivities.reduce((acc, a) => {
        if (a.moving_time > 0) {
            if (!acc[a.type]) acc[a.type] = { total_speed: 0, count: 0 };
            acc[a.type].total_speed += (a.distance / a.moving_time) * 3.6; // km/h
            acc[a.type].count++;
        }
        return acc;
    }, {});
    const labels = Object.keys(speedData);

    charts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Velocidad Media (km/h)',
                data: labels.map(type => (speedData[type].total_speed / speedData[type].count)),
                backgroundColor: 'rgba(54, 162, 235, 0.7)'
            }]
        }
    });
}

function renderRunningTab() {
    console.log("Renderizando pestaña de Running...");
    const runs = allActivities.filter(a => a.type === 'Run');
    if (runs.length === 0) {
        document.getElementById('running').innerHTML = "<h2>Análisis de Running</h2><p>No se encontraron actividades de carrera.</p>";
        return;
    }

    runs.forEach(run => run.pace_seconds_per_km = run.distance_km > 0 ? run.moving_time / run.distance_km : 0);

    const totalRunDistance = runs.reduce((sum, r) => sum + r.distance_km, 0);
    const totalRunTime = runs.reduce((sum, r) => sum + r.moving_time_hours, 0);
    const totalRunElevation = runs.reduce((sum, r) => sum + r.elevation_gain_m, 0);

    document.getElementById('running-summary-cards').innerHTML = `
        <div class="card"><h3>Carreras Totales</h3><p>${runs.length}</p></div>
        <div class="card"><h3>Distancia Total</h3><p>${totalRunDistance.toFixed(0)} km</p></div>
        <div class="card"><h3>Horas Corriendo</h3><p>${totalRunTime.toFixed(1)} h</p></div>
        <div class="card"><h3>Desnivel Total</h3><p>${totalRunElevation.toFixed(0)} m</p></div>
    `;

    const paceVsDistanceCanvas = document.getElementById('pace-vs-distance-chart');
    if (paceVsDistanceCanvas && !charts['pace-vs-distance-chart']) {
        charts['pace-vs-distance-chart'] = new Chart(paceVsDistanceCanvas.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Carreras',
                    data: runs.map(r => ({ x: r.distance_km, y: r.pace_seconds_per_km })).filter(d => d.y > 0),
                    backgroundColor: 'rgba(252, 82, 0, 0.7)'
                }]
            },
            options: {
                scales: {
                    x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Distancia (km)' } },
                    y: {
                        title: { display: true, text: 'Ritmo (min/km)' },
                        ticks: {
                            callback: (value) => `${Math.floor(value / 60)}:${Math.round(value % 60).toString().padStart(2, '0')}`
                        }
                    }
                }
            }
        });
    }

    const formatPace = (s) => s > 0 ? `${Math.floor(s / 60)}'${Math.round(s % 60).toString().padStart(2, '0')}"` : "N/A";
    const topDistanceRuns = [...runs].sort((a, b) => b.distance_km - a.distance_km).slice(0, 5);
    const topPaceRuns = runs.filter(r => r.distance_km >= 1).sort((a, b) => a.pace_seconds_per_km - b.pace_seconds_per_km).slice(0, 5);

    document.querySelector('#top-distance-runs').innerHTML = `<thead><tr><th>Fecha</th><th>Distancia</th><th>Ritmo</th></tr></thead><tbody>${topDistanceRuns.map(r => `<tr><td>${r.start_date_local_obj.toLocaleDateString()}</td><td>${r.distance_km.toFixed(2)} km</td><td>${formatPace(r.pace_seconds_per_km)}/km</td></tr>`).join('')}</tbody>`;
    document.querySelector('#top-pace-runs').innerHTML = `<thead><tr><th>Fecha</th><th>Ritmo</th><th>Distancia</th></tr></thead><tbody>${topPaceRuns.map(r => `<tr><td>${r.start_date_local_obj.toLocaleDateString()}</td><td>${formatPace(r.pace_seconds_per_km)}/km</td><td>${r.distance_km.toFixed(2)} km</td></tr>`).join('')}</tbody>`;
}

// =================================================================
// 4. LÓGICA DE LA INTERFAZ DE USUARIO (UI)
// =================================================================

function showLoading(message) { loadingMessage.textContent = message; loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay.classList.add('hidden'); }
function handleError(message, error) { console.error(message, error); hideLoading(); }

function setupTabs() {
    const renderedTabs = {};
    tabsContainer.addEventListener('click', (e) => {
        if (!e.target.matches('.tab-link')) return;
        const tabId = e.target.getAttribute('data-tab');
        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        if (!renderedTabs[tabId]) {
            switch (tabId) {
                case 'overview': renderOverviewTab(); break;
                case 'analysis': renderAnalysisTab(); break;
                case 'running': renderRunningTab(); break;
                // case 'cycling': renderCyclingTab(); break;
                // case 'swimming': renderSwimmingTab(); break;
            }
            renderedTabs[tabId] = true;
        }
    });
}

function logout() {
    localStorage.clear();
    appSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    allActivities = [];
    Object.values(charts).forEach(chart => chart && chart.destroy());
    charts = {};
    document.getElementById('cal-heatmap').innerHTML = '';
}

// =================================================================
// 5. FUNCIÓN PRINCIPAL DE INICIALIZACIÓN
// =================================================================

async function initializeApp(accessToken) {
    const cachedActivities = localStorage.getItem('strava_all_activities');
    if (cachedActivities) {
        console.log('Cargando actividades desde la caché local...');
        allActivities = JSON.parse(cachedActivities);
    } else {
        console.log('No hay caché. Obteniendo actividades desde la API de Strava...');
        const rawActivities = await fetchAllActivities(accessToken);
        if (!rawActivities) return;
        localStorage.setItem('strava_all_activities', JSON.stringify(rawActivities));
        allActivities = rawActivities;
    }
    allActivities = preprocessData(allActivities);
    
    hideLoading();
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    
    const athleteInfo = allActivities.find(a => a.athlete)?.athlete || { firstname: 'Atleta', lastname: '' };
    athleteName.textContent = `Dashboard de ${athleteInfo.firstname} ${athleteInfo.lastname}`;

    document.querySelector('[data-tab="overview"]').click();
}

function main() {
    loginButton.addEventListener('click', redirectToStravaAuthorize);
    logoutButton.addEventListener('click', logout);
    setupTabs();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const accessToken = localStorage.getItem('strava_access_token');
    if (code) {
        handleOAuthCallback(code);
    } else if (accessToken) {
        initializeApp(accessToken);
    } else {
        hideLoading();
    }
}

// ¡Ejecutar la aplicación!
main();
