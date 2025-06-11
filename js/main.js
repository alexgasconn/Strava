// // js/main.js

// // Importamos las funciones de los otros módulos con las rutas y extensiones correctas
// import { showLoading, hideLoading, handleError } from './ui.js';
// import { renderOverviewTab } from './tabs/overview.js';
// import { renderRunningTab } from './tabs/running.js';

// // --- CONFIGURACIÓN Y ESTADO GLOBAL ---
// const STRAVA_CLIENT_ID = '143540';
// const REDIRECT_URI = window.location.origin + window.location.pathname;
// const CACHE_KEY = 'strava_processed_activities_v2'; // Clave para la caché
// let allActivities = [];

// // --- REFERENCIAS AL DOM ---
// const loginSection = document.getElementById('login-section');
// const appSection = document.getElementById('app-section');
// const loginButton = document.getElementById('login-button');
// const logoutButton = document.getElementById('logout-button');
// const athleteName = document.getElementById('athlete-name');
// const tabsContainer = document.getElementById('tabs');

// // --- LÓGICA DE AUTENTICACIÓN Y DATOS ---
// function redirectToStravaAuthorize() {
//     const scope = 'read,activity:read_all';
//     const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
//     window.location.href = authUrl;
// }

// async function handleOAuthCallback(code) {
//     showLoading('Autenticando...');
//     try {
//         const response = await fetch('/api/strava-auth', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ code }),
//         });
//         const data = await response.json();
//         if (!response.ok) throw new Error(data.error);
//         localStorage.setItem('strava_access_token', data.access_token);
//         window.history.replaceState({}, document.title, window.location.pathname);
//         await initializeApp(data.access_token);
//     } catch (error) {
//         handleError('Fallo en la autenticación', error);
//     }
// }

// async function fetchAllActivities(accessToken) {
//     showLoading('Obteniendo historial de actividades... Esto puede tardar unos momentos.');
//     try {
//         const response = await fetch('/api/strava-activities', {
//             headers: { 'Authorization': `Bearer ${accessToken}` }
//         });
//         if (!response.ok) {
//             const data = await response.json();
//             if (response.status === 401) logout();
//             throw new Error(data.error || 'No se pudieron obtener las actividades.');
//         }
//         return await response.json();
//     } catch (error) {
//         handleError('No se pudieron cargar las actividades', error);
//     }
// }

// function preprocessData(activities) {
//     return activities.map(act => ({
//         ...act,
//         distance_km: act.distance / 1000,
//         moving_time_hours: act.moving_time / 3600,
//         elevation_gain_m: act.total_elevation_gain,
//         start_date_local_obj: new Date(act.start_date_local),
//     }));
// }

// // --- LÓGICA DE LA UI ---
// function setupTabs() {
//     const renderedTabs = {};
//     tabsContainer.addEventListener('click', (e) => {
//         if (!e.target.matches('.tab-link')) return;
        
//         const tabId = e.target.getAttribute('data-tab');
//         document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
//         document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
//         e.target.classList.add('active');
//         document.getElementById(tabId).classList.add('active');

//         if (!renderedTabs[tabId]) {
//             switch (tabId) {
//                 case 'overview': renderOverviewTab(allActivities); break;
//                 case 'running': renderRunningTab(allActivities); break;
//             }
//             renderedTabs[tabId] = true;
//         }
//     });
// }

// function logout() {
//     localStorage.clear();
//     window.location.reload();
// }

// // --- FUNCIÓN PRINCIPAL DE INICIALIZACIÓN ---
// async function initializeApp(accessToken) {
//     try {
//         const CACHE_KEY = 'strava_processed_activities_v2';
//         const cachedActivities = localStorage.getItem(CACHE_KEY);

//         if (cachedActivities) {
//             console.log('Cargando actividades PRE-PROCESADAS desde la caché local...');
//             allActivities = JSON.parse(cachedActivities);
//             allActivities.forEach(act => {
//                 act.start_date_local_obj = new Date(act.start_date_local_obj);
//             });
//         } else {
//             console.log('No hay caché. Obteniendo y procesando actividades...');
//             const rawActivities = await fetchAllActivities(accessToken);
//             if (!rawActivities) throw new Error("Fallo al obtener actividades de la API.");
            
//             allActivities = preprocessData(rawActivities);
//             localStorage.setItem(CACHE_KEY, JSON.stringify(allActivities));
//         }

//         console.log(`Datos listos. ${allActivities.length} actividades cargadas.`);

//         // Mostramos la aplicación y los datos básicos
//         loginSection.classList.add('hidden');
//         appSection.classList.remove('hidden');
        
//         const athleteInfo = allActivities.find(a => a.athlete)?.athlete || { firstname: 'Atleta', lastname: '' };
//         athleteName.textContent = `Dashboard de ${athleteInfo.firstname} ${athleteInfo.lastname}`;

//     } catch (error) {
//         handleError("Error durante la inicialización de la aplicación", error);
//     } finally {
//         // ¡GARANTIZADO! Ocultamos el spinner aquí, ANTES de renderizar los gráficos.
//         hideLoading();
        
//         // ¡LA MAGIA! Retrasamos el renderizado para después de que la UI se haya actualizado.
//         // Esto pone el click() en la siguiente "vuelta" del bucle de eventos del navegador.
//         setTimeout(() => {
//             document.querySelector('[data-tab="overview"]').click();
//         }, 0);
//     }
// }

// // --- PUNTO DE ENTRADA DE LA APP ---
// function main() {
//     loginButton.addEventListener('click', redirectToStravaAuthorize);
//     logoutButton.addEventListener('click', logout);
//     setupTabs();

//     const params = new URLSearchParams(window.location.search);
//     const code = params.get('code');
//     const accessToken = localStorage.getItem('strava_access_token');
    
//     if (code) {
//         handleOAuthCallback(code);
//     } else if (accessToken) {
//         initializeApp(accessToken);
//     } else {
//         hideLoading();
//     }
// }

// main();

import { showLoading, hideLoading, handleError } from './ui.js';

// Dejamos las referencias al DOM
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');

function logout() {
    localStorage.clear();
    window.location.reload();
}

// Una versión súper simplificada de initializeApp
function initializeApp() {
    console.log("initializeApp se ha llamado. Ocultando spinner AHORA.");
    hideLoading();
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    console.log("UI principal debería ser visible.");
}

function main() {
    loginButton.addEventListener('click', () => alert("Login desactivado para la prueba. Refresca y borra la caché para simular un login exitoso."));
    logoutButton.addEventListener('click', logout);
    
    // Simulación de un login exitoso. Borra la caché para probar el login real.
    const accessToken = localStorage.getItem('strava_access_token');
    if (accessToken) {
        initializeApp();
    } else {
        hideLoading();
    }
}

main();