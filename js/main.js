// js/main.js
import { redirectToStrava, logout, handleAuth } from './auth.js';
import { setupDashboard, renderDashboard, showLoading, hideLoading, handleError, renderAthleteProfile, renderTrainingZones } from './ui.js';
import { renderPlannerTab } from './planner.js';
import { fetchAllActivities, fetchAthleteData, fetchTrainingZones } from './api.js'; // <-- Añade los nuevos imports

// Espera a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;
    let plannerTabRendered = false; // <-- ¡AÑADE ESTA LÍNEA! La variable debe ser declarada aquí.

    // --- DOM REFERENCES ---
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');


    // --- LÓGICA DE PESTAÑAS ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.getAttribute('data-tab');

            tabLinks.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Renderiza el contenido del planner LA PRIMERA VEZ que se hace clic
            if (tabId === 'planner-tab' && !plannerTabRendered) {
                if (allActivities.length > 0) {
                    renderPlannerTab(allActivities);
                    plannerTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render planner tab.");
                }
            }
        });
    });

    // =========================================================
    //          ORGANIZACIÓN MEJORADA: FUNCIONES PRIMERO
    // =========================================================

    // --- FUNCIÓN PARA LOS BOTONES DE AÑO ---
    function setupYearlySelector() {
        const yearsToShow = 4; // Número de años a mostrar
        const container = document.getElementById('year-filter-buttons');
        if (!container || allActivities.length === 0) return;

        const years = [...new Set(allActivities.map(a => a.start_date_local.substring(0, 4)))]
            .sort((a, b) => b - a);

        container.innerHTML = years.slice(0, yearsToShow).map(year =>
            `<button class="year-btn" data-year="${year}">${year}</button>`
        ).join('');

        container.querySelectorAll('.year-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const year = btn.dataset.year;
                dateFilterFrom = `${year}-01-01`;
                dateFilterTo = `${year}-12-31`;

                document.getElementById('date-from').value = dateFilterFrom;
                document.getElementById('date-to').value = dateFilterTo;

                renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
            });
        });
    }



    // --- INITIALIZATION ---
    // Movemos la función initializeApp DENTRO del listener también
    async function initializeApp(tokenData) {
        showLoading('Loading activities...');
        try {
            const [activities, athlete, zones] = await Promise.all([
                fetchAllActivities(),
                fetchAthleteData(),
                fetchTrainingZones()
            ]);

            localStorage.setItem('strava_training_zones', JSON.stringify(zones));
            
            allActivities = activities;
            renderAthleteProfile(athlete);
            renderTrainingZones(zones);
            
            setupDashboard(allActivities);
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
            setupYearlySelector();
        } catch (error) {
            handleError("Could not initialize the app", error);
        } finally {
            hideLoading();
        }
    }


    async function refreshActivities() {
        showLoading('Refreshing activities...');
        try {
            allActivities = await fetchAllActivities(); // La API se encarga de los tokens
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
            setupYearlySelector();

        } catch (error) {
            handleError('Error refreshing activities', error);
        } finally {
            hideLoading();
        }
    }

    // --- EVENT LISTENERS ---
    // Ahora estamos 100% seguros de que loginButton no es null
    if (loginButton) {
        loginButton.addEventListener('click', redirectToStrava);
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    if (refreshButton) {
        refreshButton.addEventListener('click', refreshActivities);
    }
    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', () => {
            document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
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
            document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));

            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        });
    }

    // --- APP ENTRY POINT ---
    handleAuth(initializeApp).catch(error => {
        console.error("App failed to start:", error);
        hideLoading();
    });
});