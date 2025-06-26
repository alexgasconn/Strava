// /public/js/pages/dashboard.js
import { redirectToStrava, logout, handleAuth } from '../modules/auth.js';
import { fetchAllActivities } from '../modules/api.js';
import { setupDashboard, renderDashboard, showLoading, hideLoading, handleError } from '../modules/ui.js';

export function init() {
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;

    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');

    async function initializeApp(tokenData) {
        showLoading('Loading activities...');
        try {
            allActivities = await fetchAllActivities();
            setupDashboard(allActivities); // Configura el dashboard y los listeners
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo); // Renderiza por primera vez
        } catch (error) {
            handleError("Could not initialize the app", error);
        } finally {
            hideLoading();
        }
    }

    function refreshActivities() { /* Tu lógica está bien */ }

    if (loginButton) loginButton.addEventListener('click', redirectToStrava);
    if (logoutButton) logoutButton.addEventListener('click', logout);
    if (refreshButton) refreshButton.addEventListener('click', refreshActivities);
    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', () => {
            dateFilterFrom = document.getElementById('date-from').value || null;
            dateFilterTo = document.getElementById('date-to').value || null;
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        });
    }
    if (resetFilterButton) {
        resetFilterButton.addEventListener('click', () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        });
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Dashboard failed to start:", error);
        hideLoading();
    });
}