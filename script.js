// =================================================================
// 1. CONFIGURACIÓN Y ELEMENTOS DEL DOM
// =================================================================
const STRAVA_CLIENT_ID = '143540'; // Tu Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname;

// Referencias a los elementos de la página
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');
const tabsContainer = document.getElementById('tabs');

// Almacén global de datos
let allActivities = [];
let activityPieChart = null;


// =================================================================
// 2. LÓGICA DE AUTENTICACIÓN Y OBTENCIÓN DE DATOS
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

        const { access_token } = data;
        localStorage.setItem('strava_access_token', access_token);
        
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Una vez autenticados, obtenemos los datos
        initializeApp(access_token);
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
            // Si el token ha expirado, forzamos el logout
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
        // Convertimos a unidades más manejables
        distance_km: act.distance / 1000,
        moving_time_hours: act.moving_time / 3600,
        elevation_gain_m: act.total_elevation_gain,
        start_date_local_obj: new Date(act.start_date_local),
    }));
}

// En script.js, reemplaza esta función

// En script.js, reemplaza la función renderGeneralTab por completo

// En script.js, añade esta nueva función y modifica la de renderGeneralTab

function renderSummaryCards() {
    console.log("Renderizando tarjetas de resumen...");
    const totalRuns = allActivities.filter(a => a.type === 'Run').length;
    const totalRides = allActivities.filter(a => a.type === 'Ride').length;
    const totalSwims = allActivities.filter(a => a.type === 'Swim').length;
    const totalDistance = allActivities.reduce((sum, a) => sum + a.distance_km, 0);

    const summaryCardsContainer = document.getElementById('summary-cards');
    summaryCardsContainer.innerHTML = `
        <div class="card"><h3>Distancia Total</h3><p>${totalDistance.toFixed(0)} km</p></div>
        <div class="card"><h3>Carreras</h3><p>${totalRuns}</p></div>
        <div class="card"><h3>Salidas en Bici</h3><p>${totalRides}</p></div>
        <div class="card"><h3>Sesiones de Natación</h3><p>${totalSwims}</p></div>
    `;
}

// Esta función AHORA SOLO se encarga de crear el gráfico
function renderPieChart() {
    const canvas = document.getElementById('activity-pie-chart');
    
    // Doble comprobación de seguridad: si ya tiene un gráfico, no hacemos nada.
    if (Chart.getChart(canvas)) {
        console.log("El gráfico de tarta ya existe. No se creará de nuevo.");
        return; 
    }

    console.log("Creando gráfico de tarta por primera y única vez.");
    
    const activityCounts = allActivities.reduce((acc, act) => {
        acc[act.type] = (acc[act.type] || 0) + 1;
        return acc;
    }, {});
    
    const labels = Object.keys(activityCounts);
    const data = Object.values(activityCounts);

    const ctx = canvas.getContext('2d');
    activityPieChart = new Chart(ctx, { // activityPieChart sigue siendo nuestra variable global
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Número de Actividades',
                data: data,
                backgroundColor: [
                    'rgba(252, 82, 0, 0.8)', 'rgba(0, 128, 255, 0.8)', 'rgba(54, 162, 235, 0.8)',
                    'rgba(255, 206, 86, 0.8)', 'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)',
                ],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}


// En script.js, añade esta nueva función y modifica la de renderGeneralTab

function renderSummaryCards() {
    console.log("Renderizando tarjetas de resumen...");
    const totalRuns = allActivities.filter(a => a.type === 'Run').length;
    const totalRides = allActivities.filter(a => a.type === 'Ride').length;
    const totalSwims = allActivities.filter(a => a.type === 'Swim').length;
    const totalDistance = allActivities.reduce((sum, a) => sum + a.distance_km, 0);

    const summaryCardsContainer = document.getElementById('summary-cards');
    summaryCardsContainer.innerHTML = `
        <div class="card"><h3>Distancia Total</h3><p>${totalDistance.toFixed(0)} km</p></div>
        <div class="card"><h3>Carreras</h3><p>${totalRuns}</p></div>
        <div class="card"><h3>Salidas en Bici</h3><p>${totalRides}</p></div>
        <div class="card"><h3>Sesiones de Natación</h3><p>${totalSwims}</p></div>
    `;
}

// Esta función AHORA SOLO se encarga de crear el gráfico
function renderPieChart() {
    const canvas = document.getElementById('activity-pie-chart');
    
    // Doble comprobación de seguridad: si ya tiene un gráfico, no hacemos nada.
    if (Chart.getChart(canvas)) {
        console.log("El gráfico de tarta ya existe. No se creará de nuevo.");
        return; 
    }

    console.log("Creando gráfico de tarta por primera y única vez.");
    
    const activityCounts = allActivities.reduce((acc, act) => {
        acc[act.type] = (acc[act.type] || 0) + 1;
        return acc;
    }, {});
    
    const labels = Object.keys(activityCounts);
    const data = Object.values(activityCounts);

    const ctx = canvas.getContext('2d');
    activityPieChart = new Chart(ctx, { // activityPieChart sigue siendo nuestra variable global
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Número de Actividades',
                data: data,
                backgroundColor: [
                    'rgba(252, 82, 0, 0.8)', 'rgba(0, 128, 255, 0.8)', 'rgba(54, 162, 235, 0.8)',
                    'rgba(255, 206, 86, 0.8)', 'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)',
                ],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
// =================================================================
// 4. LÓGICA DE LA INTERFAZ DE USUARIO (UI)
// =================================================================

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
    // Podríamos mostrar un mensaje de error más visible al usuario aquí
}

// En script.js, reemplaza también esta función

// En script.js, reemplaza la función setupTabs

function setupTabs() {
    const renderedTabs = {
        general: false, // Lo inicializamos a false. El gráfico no se ha renderizado.
        running: false,
        cycling: false,
        swimming: false,
    };

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.tab-link')) {
            const tabId = e.target.getAttribute('data-tab');

            document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            e.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            // Lógica de renderizado bajo demanda
            if (!renderedTabs[tabId]) {
                switch (tabId) {
                    case 'general':
                        // ¡AQUÍ! La creación del gráfico solo ocurre al hacer clic en la pestaña "General"
                        renderPieChart();
                        break;
                    case 'running':
                        // renderRunningTab();
                        console.log('Renderizando pestaña de Running por primera vez');
                        break;
                    case 'cycling':
                        // renderCyclingTab();
                        console.log('Renderizando pestaña de Ciclismo por primera vez');
                        break;
                    case 'swimming':
                        // renderSwimmingTab();
                        console.log('Renderizando pestaña de Natación por primera vez');
                        break;
                }
                renderedTabs[tabId] = true; // Marcar como renderizada para no volver a llamar
            }
        }
    });
}

// En script.js, reemplaza la función logout

// En script.js, asegúrate de que tu función logout se ve así:

function logout() {
    // Borramos tanto el token como las actividades cacheadas
    localStorage.removeItem('strava_access_token');
    localStorage.removeItem('strava_all_activities'); 

    appSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    allActivities = []; // Limpiamos los datos en memoria
    
    // ¡PASO CRUCIAL! Destruimos la instancia del gráfico si existe
    if (activityPieChart) {
        console.log("Destruyendo gráfico al cerrar sesión.");
        activityPieChart.destroy();
        activityPieChart = null; // Reseteamos la variable a null
    }
}

// =================================================================
// 5. FUNCIÓN PRINCIPAL DE INICIALIZACIÓN
// =================================================================

// En script.js, reemplaza la función initializeApp

// En script.js, reemplaza la función initializeApp

async function initializeApp(accessToken) {
    // --- LÓGICA DE CACHÉ (se mantiene igual) ---
    const cachedActivities = localStorage.getItem('strava_all_activities');
    if (cachedActivities) {
        console.log('Cargando actividades desde la caché local...');
        allActivities = JSON.parse(cachedActivities);
        allActivities = preprocessData(allActivities); 
    } else {
        console.log('No hay caché. Obteniendo actividades desde la API de Strava...');
        const rawActivities = await fetchAllActivities(accessToken);
        if (!rawActivities) return; 
        localStorage.setItem('strava_all_activities', JSON.stringify(rawActivities));
        allActivities = preprocessData(rawActivities);
    }
    
    // --- ACTUALIZAR LA UI (se mantiene igual) ---
    hideLoading();
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    
    const athleteInfo = allActivities.find(a => a.athlete)?.athlete || {firstname: 'Atleta', lastname: ''};
    athleteName.textContent = `Dashboard de ${athleteInfo.firstname} ${athleteInfo.lastname}`;

    // --- ¡CAMBIO IMPORTANTE! ---
    // Ya NO llamamos a renderGeneralTab() aquí.
    // Solo renderizamos las tarjetas, que son seguras.
    renderSummaryCards();
    
    // Y nos aseguramos de que la pestaña "General" esté activa
    document.querySelector('[data-tab="general"]').click();
}


function main() {
    // Asignar eventos a los botones
    loginButton.addEventListener('click', redirectToStravaAuthorize);
    logoutButton.addEventListener('click', logout);
    
    // Configurar la lógica de las pestañas
    setupTabs();

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const accessToken = localStorage.getItem('strava_access_token');

    if (code) {
        // Si volvemos de Strava con un código, lo intercambiamos por un token
        handleOAuthCallback(code);
    } else if (accessToken) {
        // Si ya tenemos un token guardado, iniciamos la app directamente
        initializeApp(accessToken);
    } else {
        // Si no hay nada, mostramos la pantalla de login
        hideLoading();
    }
}

// ¡Ejecutar la aplicación!
main();