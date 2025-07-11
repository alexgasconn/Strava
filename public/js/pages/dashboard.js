// /public/js/pages/dashboard.js
import { redirectToStrava, logout, handleAuth } from '../modules/auth.js';
import { fetchAllActivities } from '../modules/api.js';
import { setupDashboard, renderGeneralDashboard, showLoading, hideLoading, handleError } from '../modules/ui.js';

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
            await renderGeneralDashboard(allActivities, dateFilterFrom, dateFilterTo); 
            // renderDashboard(allActivities, dateFilterFrom, dateFilterTo); // Renderiza por primera vez
        } catch (error) {
            handleError("Could not initialize the app", error);
        } finally {
            hideLoading();
        }
    }

    function refreshActivities() { /* Tu lógica está bien */ }

    // --- EVENT LISTENERS ---
    if (loginButton) loginButton.addEventListener('click', redirectToStrava);
    if (logoutButton) logoutButton.addEventListener('click', logout);
    if (refreshButton) refreshButton.addEventListener('click', refreshActivities);

    if (applyFilterButton) {
        // Añadimos 'async' aquí
        applyFilterButton.addEventListener('click', async () => { 
            dateFilterFrom = document.getElementById('date-from').value || null;
            dateFilterTo = document.getElementById('date-to').value || null;
            // Ahora 'await' es válido
            await renderGeneralDashboard(allActivities, dateFilterFrom, dateFilterTo); 
        });
    }
    if (resetFilterButton) {
        // Añadimos 'async' aquí también
        resetFilterButton.addEventListener('click', async () => { 
            dateFilterFrom = null;
            dateFilterTo = null;
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
            // Y aquí 'await' también es válido
            await renderGeneralDashboard(allActivities, dateFilterFrom, dateFilterTo); 
        });
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Dashboard failed to start:", error);
        hideLoading();
    });
}