// /public/js/pages/sports/running.js
import { handleAuth } from '../../modules/auth.js';
import { fetchAllActivities } from '../../modules/api.js';
import {
    showLoading,
    hideLoading,
    handleError,
    setupDashboard,
    renderRunningDashboard // ¡Importamos la nueva función específica!
} from '../../modules/ui.js';

export function init() {
    console.log("Initializing Running Dashboard...");
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;

    // Referencias a los botones de filtro (si los tienes en run.html)
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');

    async function initializeApp() {
        showLoading('Loading running activities...');
        try {
            allActivities = await fetchAllActivities();
            const runs = allActivities.filter(a => a.type && a.type.includes('Run'));
            
            // setupDashboard prepara la página (nombre de atleta, filtros, etc.)
            setupDashboard(allActivities); 
            
            // renderRunningDashboard renderiza todos los componentes de running
            await renderRunningDashboard(runs, null, null);

        } catch (error) {
            handleError("Could not initialize the running dashboard", error);
        } finally {
            hideLoading();
        }
    }

    // Lógica de filtrado
    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', async () => {
            dateFilterFrom = document.getElementById('date-from').value || null;
            dateFilterTo = document.getElementById('date-to').value || null;
            const allRuns = allActivities.filter(a => a.type && a.type.includes('Run'));
            await renderRunningDashboard(allRuns, dateFilterFrom, dateFilterTo);
        });
    }
     if (resetFilterButton) {
        resetFilterButton.addEventListener('click', async () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
            const allRuns = allActivities.filter(a => a.type && a.type.includes('Run'));
            await renderRunningDashboard(allRuns, null, null);
        });
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Running dashboard failed to start:", error);
        hideLoading();
    });
}