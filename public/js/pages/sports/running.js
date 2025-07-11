// /public/js/pages/sports/running.js
import { handleAuth } from '../../modules/auth.js';
import { fetchAllActivities } from '../../modules/api.js';
import {
    showLoading,
    hideLoading,
    handleError,
    setupDashboard,
    renderRunningDashboard // Importamos la función específica
} from '../../modules/ui.js';

export function init() {
    let allRuns = []; // Guardaremos solo las carreras aquí
    let dateFilterFrom = null;
    let dateFilterTo = null;

    // Referencias a los botones de filtro
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');

    async function initializeApp(tokenData) {
        showLoading('Loading running activities...');
        try {
            const allActivities = await fetchAllActivities();
            allRuns = allActivities.filter(a => a.type && a.type.includes('Run'));
            
            // setupDashboard prepara la página (nombre, visibilidad de secciones, etc.)
            setupDashboard(allActivities); 
            
            // Renderiza el panel de running por primera vez
            await renderRunningDashboard(allRuns, null, null);

        } catch (error) {
            handleError("Could not initialize the running dashboard", error);
        } finally {
            hideLoading();
        }
    }

    // Listener para el botón de aplicar filtro
    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', async () => {
            dateFilterFrom = document.getElementById('date-from').value || null;
            dateFilterTo = document.getElementById('date-to').value || null;
            // Vuelve a renderizar el panel usando la lista de carreras ya guardada
            await renderRunningDashboard(allRuns, dateFilterFrom, dateFilterTo);
        });
    }

    // Listener para el botón de resetear filtro
     if (resetFilterButton) {
        resetFilterButton.addEventListener('click', async () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
            // Vuelve a renderizar con la lista completa de carreras
            await renderRunningDashboard(allRuns, null, null);
        });
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Running dashboard failed to start:", error);
        hideLoading();
    });
}