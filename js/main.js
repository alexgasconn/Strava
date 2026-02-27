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
import { renderMapTab } from './maps.js';
import { fetchAllActivities, fetchAthleteData, fetchTrainingZones, fetchAllGears } from './api.js';
import { preprocessActivities } from './preprocessing.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;

    // --- Tab rendering config: maps tab id → { render function, uses date filters } ---
    const tabConfig = {
        'dashboard-tab': { render: () => renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'analysis-tab': { render: () => renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'athlete-tab': { render: () => renderAthleteTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'planner-tab': { render: () => renderPlannerTab(allActivities) },
        'gear-tab': { render: () => renderGearTab(allActivities) },
        'runs-races-tab': { render: () => renderRunsTab(allActivities) },
        'weather-tab': { render: () => renderWeatherTab(allActivities) },
        'map-tab': { render: () => renderMapTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'wrapped-tab': { render: () => renderWrappedTab(allActivities) },
    };
    const renderedTabs = new Set();

    // --- DOM REFERENCES ---
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');
    const settingsButton = document.getElementById('settings-button');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettings = document.getElementById('close-settings');

    const unitSelect = document.getElementById('units');
    const hrMaxInput = document.getElementById('hr-max');
    const ageInput = document.getElementById('age');

    // --- SETTINGS ---
    if (settingsButton && settingsPanel && closeSettings) {
        settingsButton.addEventListener('click', () => {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
        });
        closeSettings.addEventListener('click', () => {
            settingsPanel.style.display = 'none';
        });
    }

    function loadSettings() {
        const saved = JSON.parse(localStorage.getItem('dashboard_settings') || '{}');
        if (saved.units && unitSelect) unitSelect.value = saved.units;
        if (saved.hrMax && hrMaxInput) hrMaxInput.value = saved.hrMax;
        if (saved.age && ageInput) ageInput.value = saved.age;
    }

    function saveSettings() {
        const settings = {
            units: unitSelect?.value,
            hrMax: hrMaxInput?.value,
            age: ageInput?.value
        };
        localStorage.setItem('dashboard_settings', JSON.stringify(settings));
    }

    loadSettings();

    if (unitSelect) unitSelect.addEventListener('change', saveSettings);
    if (hrMaxInput) hrMaxInput.addEventListener('input', saveSettings);
    if (ageInput) ageInput.addEventListener('input', saveSettings);

    // --- TAB NAVIGATION ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.getAttribute('data-tab');

            tabLinks.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Lazy-render tabs on first visit
            if (!renderedTabs.has(tabId) && allActivities.length > 0 && tabConfig[tabId]) {
                tabConfig[tabId].render();
                renderedTabs.add(tabId);
            }
        });
    });

    // --- YEAR FILTER BUTTONS ---
    function setupYearlySelector() {
        const yearsToShow = 5;
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
                progress = 100;
                showLoading('Loading activities... 100%');
            } else {
                activities = await fetchAllActivities();
                localStorage.setItem('strava_activities', JSON.stringify(activities));
                localStorage.setItem('strava_activities_timestamp', Date.now().toString());
                progress = 100;
                showLoading('Loading activities... 100%');
            }

            clearInterval(progressInterval);

            showLoading('Loading athlete data...');
            const cachedAthlete = localStorage.getItem('strava_athlete_data');
            const cachedZones = localStorage.getItem('strava_training_zones');
            const cachedGears = localStorage.getItem('strava_gears');
            const cacheTimestamp = localStorage.getItem('strava_data_timestamp');
            const dataCacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp) : Infinity;
            const dataCacheValid = cachedAthlete && cachedZones && cachedGears && dataCacheAge < 60 * 60 * 1000;

            let athlete, zones, gears;
            if (dataCacheValid) {
                athlete = JSON.parse(cachedAthlete);
                zones = JSON.parse(cachedZones);
                gears = JSON.parse(cachedGears);
            } else {
                const [fetchedAthlete, fetchedZones] = await Promise.all([
                    fetchAthleteData(),
                    fetchTrainingZones()
                ]);
                athlete = fetchedAthlete;
                zones = fetchedZones;

                showLoading('Loading gear data...');
                try {
                    gears = await fetchAllGears(athlete);
                } catch (gearError) {
                    console.warn('Failed to fetch gears, continuing without:', gearError);
                    gears = [];
                }

                localStorage.setItem('strava_athlete_data', JSON.stringify(athlete));
                localStorage.setItem('strava_training_zones', JSON.stringify(zones));
                localStorage.setItem('strava_gears', JSON.stringify(gears));
                localStorage.setItem('strava_data_timestamp', Date.now().toString());
            }

            const preprocessed = await preprocessActivities(activities, athlete, zones, gears);
            allActivities = preprocessed;

            if (!cacheValid) {
                localStorage.setItem('strava_activities', JSON.stringify(allActivities));
                localStorage.setItem('strava_activities_timestamp', Date.now().toString());
            }

            setupDashboard(allActivities);
            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
            renderedTabs.add('analysis-tab');
            setupYearlySelector();
        } catch (error) {
            handleError('Could not initialize the app', error);
        } finally {
            hideLoading();
        }
    }

    async function refreshActivities() {
        showLoading('Refreshing activities...');
        try {
            allActivities = await fetchAllActivities();
            localStorage.setItem('strava_activities', JSON.stringify(allActivities));
            localStorage.setItem('strava_activities_timestamp', Date.now().toString());

            // Reset rendered state so tabs re-render with fresh data
            renderedTabs.clear();
            renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
            renderedTabs.add('analysis-tab');
            setupYearlySelector();
        } catch (error) {
            handleError('Error refreshing activities', error);
        } finally {
            hideLoading();
        }
    }

    // --- EVENT LISTENERS ---
    if (loginButton) loginButton.addEventListener('click', redirectToStrava);
    if (logoutButton) logoutButton.addEventListener('click', logout);
    if (refreshButton) refreshButton.addEventListener('click', refreshActivities);

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
        console.error('App failed to start:', error);
        hideLoading();
    });
});
