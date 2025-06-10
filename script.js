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

function renderGeneralTab() {
    // --- 1. Renderizar Tarjetas de Resumen (esto es seguro y rápido) ---
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

    // --- 2. Renderizar o Actualizar el Gráfico de Tarta ---
    const activityCounts = allActivities.reduce((acc, act) => {
        acc[act.type] = (acc[act.type] || 0) + 1;
        return acc;
    }, {});
    
    const labels = Object.keys(activityCounts);
    const data = Object.values(activityCounts);

    // Comprobamos si la INSTANCIA del gráfico ya existe en nuestra variable global
    if (activityPieChart) {
        // Si existe, solo actualizamos sus datos. No creamos uno nuevo.
        console.log("Actualizando datos del gráfico de tarta existente.");
        activityPieChart.data.labels = labels;
        activityPieChart.data.datasets[0].data = data;
        activityPieChart.update();
    } else {
        // Si no existe, lo creamos por primera vez.
        console.log("Creando nuevo gráfico de tarta.");
        const ctx = document.getElementById('activity-pie-chart').getContext('2d');
        activityPieChart = new Chart(ctx, {
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
            }
        });
    }
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

function setupTabs() {
    // Un objeto para rastrear qué pestañas ya han sido renderizadas
    const renderedTabs = {
        general: true, // La pestaña general se renderiza al inicio
        running: false,
        cycling: false,
        swimming: false,
    };

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.tab-link')) {
            const tabId = e.target.getAttribute('data-tab');

            // Ocultar todas las pestañas y botones
            document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Activar la pestaña y el botón seleccionados
            e.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Renderizar el contenido de la pestaña SI Y SOLO SI no ha sido renderizada antes
            if (!renderedTabs[tabId]) {
                switch (tabId) {
                    case 'running':
                        // renderRunningTab(); // <-- Llamaremos a esta función cuando la creemos
                        console.log('Renderizando pestaña de Running por primera vez');
                        break;
                    case 'cycling':
                        // renderCyclingTab(); // <-- Llamaremos a esta función cuando la creemos
                        console.log('Renderizando pestaña de Ciclismo por primera vez');
                        break;
                    case 'swimming':
                        // renderSwimmingTab(); // <-- Llamaremos a esta función cuando la creemos
                        console.log('Renderizando pestaña de Natación por primera vez');
                        break;
                }
                // Marcar la pestaña como renderizada para no volver a hacerlo
                renderedTabs[tabId] = true;
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

async function initializeApp(accessToken) {
    
    // --- NUEVA LÓGICA DE CACHÉ ---
    const cachedActivities = localStorage.getItem('strava_all_activities');

    if (cachedActivities) {
        console.log('Cargando actividades desde la caché local...');
        allActivities = JSON.parse(cachedActivities);
        // El pre-procesamiento sigue siendo necesario porque los objetos Date no se guardan en JSON
        allActivities = preprocessData(allActivities); 
    } else {
        console.log('No hay caché. Obteniendo actividades desde la API de Strava...');
        // 1. Obtener todos los datos si no están en caché
        const rawActivities = await fetchAllActivities(accessToken);
        if (!rawActivities) return; 

        // Guardamos los datos crudos en la caché ANTES de procesarlos
        localStorage.setItem('strava_all_activities', JSON.stringify(rawActivities));
        
        allActivities = preprocessData(rawActivities);
    }
    
    // --- El resto de la función es igual ---

    // 2. Actualizar la UI
    hideLoading();
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    
    if (allActivities.length > 0) {
      // Necesitamos encontrar el nombre del atleta. Puede que no esté en todas las actividades.
      const athleteInfo = allActivities.find(a => a.athlete)?.athlete || {firstname: 'Atleta', lastname: ''};
      athleteName.textContent = `Dashboard de ${athleteInfo.firstname} ${athleteInfo.lastname}`;
    }

    // 3. Renderizar el contenido de la primera pestaña
    renderGeneralTab();
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