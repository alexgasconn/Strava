// js/main.js

// Importamos las funciones de los otros módulos
import { showLoading, hideLoading, handleError } from './ui.js';
import { renderOverviewTab } from './tabs/overview.js';
import { renderRunningTab } from './tabs/running.js';

// --- CONFIGURACIÓN Y ESTADO GLOBAL ---
const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;
let allActivities = [];

// --- REFERENCIAS AL DOM ---
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');
const tabsContainer = document.getElementById('tabs');

// --- LÓGICA DE AUTENTICACIÓN Y DATOS ---
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
            if (response.status === 401) logout();
            throw new Error(data.error || 'No se pudieron obtener las actividades.');
        }
        return await response.json();
    } catch (error) {
        handleError('No se pudieron cargar las actividades', error);
    }
}

function preprocessData(activities) {
    return activities.map(act => ({
        ...act,
        distance_km: act.distance / 1000,
        moving_time_hours: act.moving_time / 3600,
        elevation_gain_m: act.total_elevation_gain,
        start_date_local_obj: new Date(act.start_date_local),
    }));
}

// --- LÓGICA DE LA UI ---
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
                case 'overview': renderOverviewTab(allActivities); break;
                case 'running': renderRunningTab(allActivities); break;
            }
            renderedTabs[tabId] = true;
        }
    });
}

function logout() {
    localStorage.clear();
    window.location.reload(); // La forma más simple de resetear el estado
}

// --- FUNCIÓN PRINCIPAL DE INICIALIZACIÓN ---
async function initializeApp(accessToken) {
    const cachedActivities = localStorage.getItem('strava_all_activities');
    if (cachedActivities) {
        allActivities = JSON.parse(cachedActivities);
    } else {
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

// --- PUNTO DE ENTRADA DE LA APP ---
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

main();