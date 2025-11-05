// js/main.js
import { redirectToStrava, logout, handleAuth } from './auth.js';
import { setupDashboard, showLoading, hideLoading, handleError,  } from './ui.js';
import { renderAnalysisTab } from './analysis.js';
import { renderDashboardTab } from './dashboard.js';
import { renderAthleteProfile, renderTrainingZones, renderAthleteTab } from './athlete.js';
import { renderPlannerTab } from './planner.js';
import { renderGearTab } from './gear.js';
import { renderWeatherTab } from './weather.js';
import { renderRunsTab } from './runs.js';
import { renderWrappedTab } from './wrapped.js';
import { fetchAllActivities, fetchAthleteData, fetchTrainingZones } from './api.js';

// Espera a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Strava Dashboard App...");

    // --- STATE ---
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;
    let plannerTabRendered = false;
    let athleteTabRendered = false;
    let dashboardTabRendered = false;
    let runsTabRendered = false;
    let weatherTabRendered = false;
    let wrappedTabRendered = false;

    // --- DOM REFERENCES ---
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');
    console.log("DOM references obtained.");


    // --- LÓGICA DE PESTAÑAS ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    console.log("Tab elements selected.");

    tabLinks.forEach(link => {
        console.log(`Setting up tab link for: ${link.getAttribute('data-tab')}`);
        link.addEventListener('click', () => {
            console.log(`Tab link clicked: ${link.getAttribute('data-tab')}`);
            const tabId = link.getAttribute('data-tab');

            console.groupCollapsed(`🟦 Tab Click: ${tabId}`);

        // Estado previo
        console.log("Current state:", {
            allActivitiesLoaded: allActivities.length > 0,
            tabAlreadyRendered: {
                dashboardTabRendered,
                plannerTabRendered,
                athleteTabRendered,
                analysisTabRendered,
                gearTabRendered,
                runsTabRendered,
                weatherTabRendered,
                wrappedTabRendered
            }
        });

            tabLinks.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'dashboard-tab' && !dashboardTabRendered) {
                if (allActivities.length > 0) {
                    renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo);
                    console.log("Dashboard tab rendered.");
                    dashboardTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render dashboard tab.");
                }
            }
            if (tabId === 'planner-tab' && !plannerTabRendered) {
                if (allActivities.length > 0) {
                    renderPlannerTab(allActivities);
                    console.log("Planner tab rendered.");
                    plannerTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render planner tab.");
                }
            }
            if (tabId === 'athlete-tab' && !athleteTabRendered) {
                if (allActivities.length > 0) {
                    renderAthleteTab(allActivities);
                    console.log("Athlete tab rendered.");
                    athleteTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render athlete tab.");
                }
            }
            if (tabId === 'analysis-tab' && !analysisTabRendered) {
                if (allActivities.length > 0) {
                    renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
                    console.log("Analysis tab rendered.");
                    analysisTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render analysis tab.");
                }
            }
            if (tabId === 'gear-tab' && !gearTabRendered) {
                if (allActivities.length > 0) {
                    renderGearTab(allActivities);
                    console.log("Gear tab rendered.");
                    gearTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render gear tab.");
                }
            }
            if (tabId === 'runs-races-tab' && !runsTabRendered) {
                if (allActivities.length > 0) {
                    renderRunsTab(allActivities);
                    console.log("Runs tab rendered.");
                    runsTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render runs tab.");
                }
            }
            if (tabId === 'weather-tab' && !weatherTabRendered) {
                if (allActivities.length > 0) {
                    renderWeatherTab(allActivities);
                    console.log("Weather tab rendered.");
                    weatherTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render weather tab.");
                }
            }
            if (tabId === 'wrapped-tab' && !wrappedTabRendered) {
                if (allActivities.length > 0) {
                    renderWrappedTab(allActivities);
                    console.log("Wrapped tab rendered.");
                    wrappedTabRendered = true;
                } else {
                    console.warn("Activities not loaded yet, can't render wrapped tab.");
                }
            }

        });
    });



    // --- FUNCIÓN PARA LOS BOTONES DE AÑO ---
    function setupYearlySelector() {
        const yearsToShow = 5; // Número de años a mostrar
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

                renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
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

            localStorage.setItem('strava_athlete_data', JSON.stringify(athlete));
            localStorage.setItem('strava_training_zones', JSON.stringify(zones));

            allActivities = activities;

            setupDashboard(allActivities);
            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
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
            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
            setupYearlySelector();

        } catch (error) {
            handleError('Error refreshing activities', error);
        } finally {
            hideLoading();
        }
    }

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
            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
        });
    }
    if (resetFilterButton) {
        resetFilterButton.addEventListener('click', () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
            document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));

            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
        });
    }

    // --- APP ENTRY POINT ---
    handleAuth(initializeApp).catch(error => {
        console.error("App failed to start:", error);
        hideLoading();
    });
});