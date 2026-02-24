// js/main.js
import { redirectToStrava, logout, handleAuth } from './auth.js';
import { setupDashboard, showLoading, hideLoading, handleError, } from './ui.js';
import { renderAnalysisTab } from './analysis.js';
import { renderDashboardTab } from './dashboard.js';
import { renderAthleteTab } from './athlete.js';
import { renderPlannerTab } from './planner.js';
import { renderGearTab } from './gear.js';
import { renderWeatherTab } from './weather.js';
import { renderRunsTab } from './runs.js';
import { renderWrappedTab } from './wrapped.js';
import { fetchAllActivities, fetchAthleteData, fetchTrainingZones, fetchAllGears } from './api.js';
import { preprocessActivities } from './preprocessing.js';


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
    let analysisTabRendered = false;
    let gearTabRendered = false;
    console.log("Initial state set.");

    // --- DOM REFERENCES ---
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');
    const settingsButton = document.getElementById("settings-button");
    const settingsPanel = document.getElementById("settings-panel");
    const closeSettings = document.getElementById("close-settings");

    const unitSelect = document.getElementById("unit-select");
    const hrMaxInput = document.getElementById("hr-max-input");
    const ageInput = document.getElementById("age-input");

    if (settingsButton && settingsPanel && closeSettings) {
        settingsButton.addEventListener("click", () => {
            settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
        });

        closeSettings.addEventListener("click", () => {
            settingsPanel.style.display = "none";
        });
    }
    function loadSettings() {
        const saved = JSON.parse(localStorage.getItem("dashboard_settings") || "{}");
        if (saved.units) unitSelect.value = saved.units;
        if (saved.hrMax) hrMaxInput.value = saved.hrMax;
        if (saved.age) ageInput.value = saved.age;
    }

    loadSettings();

    function saveSettings() {
        const settings = {
            units: unitSelect.value,
            hrMax: hrMaxInput.value,
            age: ageInput.value
        };
        localStorage.setItem("dashboard_settings", JSON.stringify(settings));
    }

    // unitSelect.addEventListener("change", saveSettings);
    // hrMaxInput.addEventListener("input", saveSettings);
    // ageInput.addEventListener("input", saveSettings);



    console.log("DOM references obtained.");


    // --- LÓGICA DE PESTAÑAS ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    console.log("Tab elements selected.");

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            console.log(`Tab link clicked: ${link.getAttribute('data-tab')}`);
            const tabId = link.getAttribute('data-tab');

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
                    renderAthleteTab(allActivities, dateFilterFrom, dateFilterTo);
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
    async function initializeApp(tokenData) {
        console.log("🚀 initializeApp: Starting app initialization");
        showLoading('Loading activities... 0%');
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress > 90) progress = 90;
            showLoading(`Loading activities... ${Math.round(progress)}%`);
        }, 500);

        try {
            // Check cache for activities
            const cachedActivities = localStorage.getItem('strava_activities');
            const cachedTimestamp = localStorage.getItem('strava_activities_timestamp');
            const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp) : Infinity;
            const cacheValid = cachedActivities && cacheAge < 60 * 60 * 1000; // 1 hour

            let activities;
            if (cacheValid) {
                activities = JSON.parse(cachedActivities);
                console.log(`✅ initializeApp: Loaded ${activities.length} activities from cache.`);
                progress = 100;
                showLoading('Loading activities... 100%');
            } else {
                console.log("📡 initializeApp: Fetching activities from API...");
                activities = await fetchAllActivities();
                localStorage.setItem('strava_activities', JSON.stringify(activities));
                localStorage.setItem('strava_activities_timestamp', Date.now().toString());
                console.log(`✅ initializeApp: Fetched and cached ${activities.length} activities.`);
                progress = 100;
                showLoading('Loading activities... 100%');
            }

            clearInterval(progressInterval);

            console.log("📡 initializeApp: Fetching athlete, zones");
            showLoading('Loading athlete data...');
            const cachedAthlete = localStorage.getItem('strava_athlete_data');
            const cachedZones = localStorage.getItem('strava_training_zones');
            const cachedGears = localStorage.getItem('strava_gears');
            const cacheTimestamp = localStorage.getItem('strava_data_timestamp');
            const dataCacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp) : Infinity;
            const dataCacheValid = cachedAthlete && cachedZones && cachedGears && dataCacheAge < 60 * 60 * 1000; // 1 hour

            let athlete, zones, gears;
            if (dataCacheValid) {
                athlete = JSON.parse(cachedAthlete);
                zones = JSON.parse(cachedZones);
                gears = JSON.parse(cachedGears);
                console.log('✅ initializeApp: Loaded athlete, zones, gears from cache.');
            } else {
                const [fetchedAthlete, fetchedZones] = await Promise.all([
                    fetchAthleteData(),
                    fetchTrainingZones()
                ]);
                athlete = fetchedAthlete;
                zones = fetchedZones;
                console.log('✅ initializeApp: Fetched athlete data:', athlete);
                console.log('✅ initializeApp: Fetched training zones:', zones);

                console.log("🔧 initializeApp: Fetching gears...");
                showLoading('Loading gear data...');
                try {
                    gears = await fetchAllGears(athlete);
                    console.log(`✅ initializeApp: Fetched ${gears.length} gears.`);
                } catch (gearError) {
                    console.warn("⚠️ initializeApp: Failed to fetch gears, continuing without:", gearError);
                    gears = [];
                }

                localStorage.setItem('strava_athlete_data', JSON.stringify(athlete));
                localStorage.setItem('strava_training_zones', JSON.stringify(zones));
                localStorage.setItem('strava_gears', JSON.stringify(gears));
                localStorage.setItem('strava_data_timestamp', Date.now().toString());
                console.log("💾 initializeApp: Athlete, zones, gears saved to localStorage");
            }

            console.log("🌤️ initializeApp: Gathering weather data...");
            // TODO: Add weather API gathering here
            console.log("✅ initializeApp: Weather data gathered (placeholder)");

            console.log('⚙️ initializeApp: Preprocessing activities...');
            const preprocessed = await preprocessActivities(activities, athlete);
            allActivities = preprocessed;
            console.log(`✅ initializeApp: Preprocessed ${allActivities.length} activities.`);
            console.log("📋 initializeApp: Sample preprocessed activities:", allActivities.slice(0, 3));

            // Save activities if not from cache
            if (!cacheValid) {
                localStorage.setItem('strava_activities', JSON.stringify(allActivities));
                localStorage.setItem('strava_activities_timestamp', Date.now().toString());
                console.log("💾 initializeApp: Activities saved to localStorage");
            }

            console.log("🎛️ initializeApp: Setting up dashboard");
            setupDashboard(allActivities);
            console.log("📊 initializeApp: Rendering analysis tab");
            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
            console.log("📅 initializeApp: Setting up yearly selector");
            setupYearlySelector();
            console.log("🎉 initializeApp: Initialization completed successfully");
        } catch (error) {
            console.error("❌ initializeApp: Error during initialization", error);
            handleError("Could not initialize the app", error);
        } finally {
            hideLoading();
        }
    }


    async function refreshActivities() {
        showLoading('Refreshing activities...');
        try {
            allActivities = await fetchAllActivities(); // La API se encarga de los tokens
            localStorage.setItem('strava_activities', JSON.stringify(allActivities));
            localStorage.setItem('strava_activities_timestamp', Date.now().toString());
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