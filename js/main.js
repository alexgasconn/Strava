// js/main.js
import { redirectToStrava, logout, handleAuth } from './auth.js';
import { fetchAllActivities } from './api.js';
import { setupDashboard, renderDashboard, showLoading, hideLoading, handleError } from './ui.js';

// --- STATE ---
let allActivities = [];
let dateFilterFrom = null;
let dateFilterTo = null;

// --- DOM REFERENCES ---
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const refreshButton = document.getElementById('refresh-button');
const applyFilterButton = document.getElementById('apply-date-filter');
const resetFilterButton = document.getElementById('reset-date-filter');

// --- INITIALIZATION ---
export async function initializeApp(tokenData) {
    showLoading('Loading activities...');
    try {
        allActivities = await fetchAllActivities();
        setupDashboard(allActivities);
        renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
    } catch (error) {
        handleError("Could not initialize the app", error);
        // Podrías intentar un logout aquí si el token es inválido
    } finally {
        hideLoading();
    }
}

async function refreshActivities() {
    showLoading('Refreshing activities...');
    try {
        allActivities = await fetchAllActivities(); // La API se encarga de los tokens
        renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
    } catch (error) {
        handleError('Error refreshing activities', error);
    } finally {
        hideLoading();
    }
}

// --- EVENT LISTENERS ---
loginButton.addEventListener('click', redirectToStrava);
logoutButton.addEventListener('click', logout);
refreshButton.addEventListener('click', refreshActivities);

applyFilterButton.addEventListener('click', () => {
    dateFilterFrom = document.getElementById('date-from').value || null;
    dateFilterTo = document.getElementById('date-to').value || null;
    renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
});

resetFilterButton.addEventListener('click', () => {
    dateFilterFrom = null;
    dateFilterTo = null;
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
});

// --- APP ENTRY POINT ---
// Inicia el proceso de autenticación al cargar la página
handleAuth().catch(error => {
    console.error("App failed to start:", error);
    hideLoading();
});