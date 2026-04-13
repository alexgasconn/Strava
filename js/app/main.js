// js/app/main.js
import '../shared/utils/speed-insights.js';
import { redirectToStrava, logout, handleAuth } from './auth.js';
import { setupDashboard, showLoading, hideLoading, handleError, } from './ui.js';
import {
    renderRunAnalysisTab,
    renderBikeAnalysisTab,
    renderSwimAnalysisTab,
    renderDashboardTab,
    renderAthleteTab,
    renderPlannerTab,
    renderGearTab,
    renderWeatherTab,
    renderActivitiesTab,
    renderCalendarTab,
    renderWrappedTab,
    renderMapTab,
    renderAIChatTab,
} from '../tabs/index.js';
import { fetchAllActivities, fetchAthleteData, fetchTrainingZones, fetchAllGears, setCachedGears } from '../services/index.js';
import { preprocessActivities } from '../shared/preprocessing/index.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;
    let athleteSportFilter = 'all';
    let athleteDataType = 'time';
    let runGearFilter = 'all';
    let bikeGearFilter = 'all';

    // --- Tab rendering config: maps tab id → { render function, uses date filters } ---
    const tabConfig = {
        'dashboard-tab': { render: () => renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'analysis-tab': { render: () => renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter), usesFilters: true },
        'bike-tab': { render: () => renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, bikeGearFilter), usesFilters: true },
        'swim-tab': { render: () => renderSwimAnalysisTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'athlete-tab': { render: () => renderAthleteTab(allActivities, dateFilterFrom, dateFilterTo, athleteSportFilter, athleteDataType), usesFilters: true },
        'planner-tab': { render: () => renderPlannerTab(allActivities) },
        'gear-tab': { render: () => renderGearTab(allActivities) },
        'activities-tab': { render: () => renderActivitiesTab(allActivities) },
        'calendar-tab': { render: () => renderCalendarTab(allActivities) },
        'weather-tab': { render: () => renderWeatherTab(allActivities) },
        'map-tab': { render: () => renderMapTab(allActivities, dateFilterFrom, dateFilterTo), usesFilters: true },
        'wrapped-tab': { render: () => renderWrappedTab(allActivities) },
        'ai-chat-tab': { render: () => renderAIChatTab(allActivities) },
    };
    const renderedTabs = new Set();

    // --- DOM REFERENCES ---
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');

    // Run Tab
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');
    const dateFromEl = document.getElementById('date-from');
    const dateToEl = document.getElementById('date-to');
    const runGearFilterEl = document.getElementById('run-gear-filter');

    // Bike Tab
    const bikeApplyFilterButton = document.getElementById('bike-apply-date-filter');
    const bikeResetFilterButton = document.getElementById('bike-reset-date-filter');
    const bikeDateFromEl = document.getElementById('bike-date-from');
    const bikeDateToEl = document.getElementById('bike-date-to');
    const bikeGearFilterEl = document.getElementById('bike-gear-filter');

    // Swim Tab
    const swimApplyFilterButton = document.getElementById('swim-apply-date-filter');
    const swimResetFilterButton = document.getElementById('swim-reset-date-filter');
    const swimDateFromEl = document.getElementById('swim-date-from');
    const swimDateToEl = document.getElementById('swim-date-to');

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

    const routeToTab = {
        '/': 'analysis-tab',
        '/run': 'analysis-tab',
        '/dashboard': 'dashboard-tab',
        '/bike': 'bike-tab',
        '/swim': 'swim-tab',
        '/athlete': 'athlete-tab',
        '/planner': 'planner-tab',
        '/gear': 'gear-tab',
        '/activities': 'activities-tab',
        '/calendar': 'calendar-tab',
        '/weather': 'weather-tab',
        '/map': 'map-tab',
        '/wrapped': 'wrapped-tab',
        '/ai-coach': 'ai-chat-tab'
    };

    const tabToRoute = {
        'analysis-tab': '/run',
        'dashboard-tab': '/dashboard',
        'bike-tab': '/bike',
        'swim-tab': '/swim',
        'athlete-tab': '/athlete',
        'planner-tab': '/planner',
        'gear-tab': '/gear',
        'activities-tab': '/activities',
        'calendar-tab': '/calendar',
        'weather-tab': '/weather',
        'map-tab': '/map',
        'wrapped-tab': '/wrapped',
        'ai-chat-tab': '/ai-coach'
    };

    function normalizePath(pathname) {
        if (!pathname) return '/';
        return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    }

    function getTabIdFromPath(pathname) {
        const normalized = normalizePath(pathname);
        return routeToTab[normalized] || 'analysis-tab';
    }

    function syncDateInputs() {
        // Sync all date inputs with current filter state
        if (dateFromEl) dateFromEl.value = dateFilterFrom || '';
        if (dateToEl) dateToEl.value = dateFilterTo || '';
        if (bikeDateFromEl) bikeDateFromEl.value = dateFilterFrom || '';
        if (bikeDateToEl) bikeDateToEl.value = dateFilterTo || '';
        if (swimDateFromEl) swimDateFromEl.value = dateFilterFrom || '';
        if (swimDateToEl) swimDateToEl.value = dateFilterTo || '';
        if (runGearFilterEl) runGearFilterEl.value = runGearFilter || 'all';
        if (bikeGearFilterEl) bikeGearFilterEl.value = bikeGearFilter || 'all';
    }

    function getGearNameMap() {
        const gears = JSON.parse(localStorage.getItem('strava_gears') || '[]');
        return new Map(gears.map(gear => {
            const label = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ') || gear.id;
            return [gear.id, label];
        }));
    }

    function populateGearFilters() {
        const gearNameMap = getGearNameMap();

        const buildOptions = (activities) => {
            const uniqueGearIds = [...new Set(
                activities
                    .map(activity => activity.gear_id)
                    .filter(Boolean)
            )];

            return [
                { value: 'all', label: 'All' },
                ...uniqueGearIds.map(gearId => ({ value: gearId, label: gearNameMap.get(gearId) || gearId }))
            ];
        };

        const runActivities = allActivities.filter(activity => activity.type && activity.type.includes('Run'));
        const bikeActivities = allActivities.filter(activity =>
            activity.type === 'Ride' ||
            activity.sport_type === 'Ride' ||
            activity.sport_type === 'MountainBikeRide'
        );

        const runOptions = buildOptions(runActivities);
        const bikeOptions = buildOptions(bikeActivities);

        const setOptions = (selectEl, options) => {
            if (!selectEl) return;
            selectEl.innerHTML = options
                .map(option => `<option value="${option.value}">${option.label}</option>`)
                .join('');
        };

        setOptions(runGearFilterEl, runOptions);
        setOptions(bikeGearFilterEl, bikeOptions);

        const runValues = new Set(runOptions.map(option => option.value));
        const bikeValues = new Set(bikeOptions.map(option => option.value));
        if (!runValues.has(runGearFilter)) runGearFilter = 'all';
        if (!bikeValues.has(bikeGearFilter)) bikeGearFilter = 'all';

        syncDateInputs();
    }

    function activateTab(tabId, { updateUrl = false, replaceUrl = false } = {}) {
        const link = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
        const content = document.getElementById(tabId);
        if (!link || !content) return;

        tabLinks.forEach(item => item.classList.remove('active'));
        tabContents.forEach(item => item.classList.remove('active'));

        link.classList.add('active');
        content.classList.add('active');

        // Sync date inputs when switching tabs
        syncDateInputs();

        // Lazy-render tabs on first visit
        if (!renderedTabs.has(tabId) && tabConfig[tabId]) {
            tabConfig[tabId].render();
            renderedTabs.add(tabId);
        }

        if (updateUrl) {
            const route = tabToRoute[tabId] || '/run';
            const method = replaceUrl ? 'replaceState' : 'pushState';
            window.history[method]({ tabId }, '', route);
        }
    }

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.getAttribute('data-tab');
            activateTab(tabId, { updateUrl: true });
        });
    });

    window.addEventListener('popstate', () => {
        activateTab(getTabIdFromPath(window.location.pathname));
    });

    // --- FILTER STATE PERSISTENCE ---
    function saveFilterState() {
        localStorage.setItem('dashboard_filters', JSON.stringify({
            dateFilterFrom,
            dateFilterTo,
            athleteSportFilter,
            athleteDataType,
            runGearFilter,
            bikeGearFilter
        }));
    }

    function loadFilterState() {
        const saved = localStorage.getItem('dashboard_filters');
        let filters = {};
        if (saved) {
            try {
                filters = JSON.parse(saved) || {};
            } catch {
                filters = {};
            }
        }

        // Always start with no date filter on app load.
        dateFilterFrom = null;
        dateFilterTo = null;
        athleteSportFilter = filters.athleteSportFilter || 'all';
        athleteDataType = filters.athleteDataType || 'time';
        runGearFilter = filters.runGearFilter || 'all';
        bikeGearFilter = filters.bikeGearFilter || 'all';

        syncDateInputs();

        // Persist the reset so a hard refresh also starts unfiltered.
        localStorage.setItem('dashboard_filters', JSON.stringify({
            dateFilterFrom,
            dateFilterTo,
            athleteSportFilter,
            athleteDataType,
            runGearFilter,
            bikeGearFilter
        }));
    }

    // --- YEAR FILTER BUTTONS ---
    function setupYearlySelector() {
        const yearsToShow = 5;

        // Setup for Run Tab
        const runContainer = document.getElementById('year-filter-buttons');
        const bikeContainer = document.getElementById('bike-year-filter-buttons');
        const swimContainer = document.getElementById('swim-year-filter-buttons');

        if ((runContainer || bikeContainer || swimContainer) && allActivities.length === 0) return;

        const years = [...new Set(allActivities.map(a => a.start_date_local.substring(0, 4)))]
            .sort((a, b) => b - a);

        const yearButtonsHTML = years.slice(0, yearsToShow).map(year =>
            `<button class="year-btn" data-year="${year}">${year}</button>`
        ).join('');

        // Populate all three containers
        if (runContainer) runContainer.innerHTML = yearButtonsHTML;
        if (bikeContainer) bikeContainer.innerHTML = yearButtonsHTML;
        if (swimContainer) swimContainer.innerHTML = yearButtonsHTML;

        // Setup event listeners for Run Tab
        if (runContainer) {
            runContainer.querySelectorAll('.year-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    runContainer.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const year = btn.dataset.year;
                    dateFilterFrom = `${year}-01-01`;
                    dateFilterTo = `${year}-12-31`;

                    if (dateFromEl) dateFromEl.value = dateFilterFrom;
                    if (dateToEl) dateToEl.value = dateFilterTo;
                    runGearFilter = runGearFilterEl?.value || runGearFilter || 'all';
                    saveFilterState();

                    renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter);
                });
            });
        }

        // Setup event listeners for Bike Tab
        if (bikeContainer) {
            bikeContainer.querySelectorAll('.year-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    bikeContainer.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const year = btn.dataset.year;
                    dateFilterFrom = `${year}-01-01`;
                    dateFilterTo = `${year}-12-31`;

                    if (bikeDateFromEl) bikeDateFromEl.value = dateFilterFrom;
                    if (bikeDateToEl) bikeDateToEl.value = dateFilterTo;
                    bikeGearFilter = bikeGearFilterEl?.value || bikeGearFilter || 'all';
                    saveFilterState();

                    renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, bikeGearFilter);
                });
            });
        }

        // Setup event listeners for Swim Tab
        if (swimContainer) {
            swimContainer.querySelectorAll('.year-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    swimContainer.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const year = btn.dataset.year;
                    dateFilterFrom = `${year}-01-01`;
                    dateFilterTo = `${year}-12-31`;

                    if (swimDateFromEl) swimDateFromEl.value = dateFilterFrom;
                    if (swimDateToEl) swimDateToEl.value = dateFilterTo;
                    saveFilterState();

                    renderSwimAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
                });
            });
        }
    }

    // --- INITIALIZATION ---
    async function initializeApp(tokenData) {
        const t0 = Date.now();
        const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s elapsed`;
        showLoading('Preparing dashboard...', 2, elapsed());
        let progress = 0;

        try {
            // Phase 1: Load activities (0% -> 40%)
            progress = 8;
            showLoading('Checking local cache...', progress, elapsed());

            const cachedActivities = localStorage.getItem('strava_activities');
            const cachedActivitiesTimestamp = localStorage.getItem('strava_activities_timestamp');
            const activitiesCacheAge = cachedActivitiesTimestamp ? Date.now() - parseInt(cachedActivitiesTimestamp) : Infinity;
            const activitiesCacheValid = cachedActivities && activitiesCacheAge < 60 * 60 * 1000; // 1 hour

            let activities;
            if (activitiesCacheValid) {
                activities = JSON.parse(cachedActivities);
                progress = 40;
                showLoading(`Activities loaded from cache (${activities.length})`, progress, elapsed());
            } else {
                showLoading('Downloading activities from Strava...', 18, elapsed());
                activities = await fetchAllActivities();
                progress = 40;
                showLoading(`Activities downloaded (${activities.length})`, progress, elapsed());
                localStorage.setItem('strava_activities', JSON.stringify(activities));
                localStorage.setItem('strava_activities_timestamp', Date.now().toString());
            }

            // Phase 2: Load athlete, zones, and gears (40% -> 90%)
            // These are optional - if they fail, continue without them
            let athlete = null;
            let zones = null;
            let gears = [];

            progress = 52;
            showLoading('Loading athlete profile and zones...', progress, elapsed());

            try {
                // Use Promise.allSettled with timeout to prevent hanging
                const timeout = 8000; // 8 second timeout per request
                const athletePromise = Promise.race([
                    fetchAthleteData(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Athlete fetch timeout')), timeout))
                ]);
                const zonesPromise = Promise.race([
                    fetchTrainingZones(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Zones fetch timeout')), timeout))
                ]);

                const results = await Promise.allSettled([athletePromise, zonesPromise]);

                if (results[0].status === 'fulfilled') {
                    athlete = results[0].value;
                } else {
                    console.warn('Failed to load athlete data:', results[0].reason);
                }

                if (results[1].status === 'fulfilled') {
                    zones = results[1].value;
                } else {
                    console.warn('Failed to load zones data:', results[1].reason);
                }

                if (athlete || zones) {
                    progress = 65;
                    showLoading('Athlete profile and zones ready', progress, elapsed());
                } else {
                    showLoading('Athlete/zones unavailable (timeout or error), continuing...', 65, elapsed());
                }
            } catch (error) {
                console.warn('Failed to load athlete/zones data, continuing without:', error);
                athlete = null;
                zones = null;
                showLoading('Athlete/zones unavailable, continuing...', 65, elapsed());
            }

            // Try to load gears - also optional
            try {
                if (athlete) {
                    showLoading('Loading gear usage...', 72, elapsed());
                    gears = await fetchAllGears(athlete);
                    // Persist gears to cache with 24h TTL
                    setCachedGears(gears);
                }
            } catch (error) {
                console.warn('Failed to load gears, continuing without:', error);
                gears = [];
                showLoading('Gear unavailable, continuing...', 76, elapsed());
            }

            progress = 90;
            showLoading('Processing and enriching activities...', progress, elapsed());

            // Phase 3: Preprocess activities (90% -> 100%)
            const preprocessed = await preprocessActivities(activities, athlete, zones, gears);
            allActivities = preprocessed;
            console.log('Preprocessed activities:', allActivities);

            progress = 100;
            showLoading('Finalizing UI...', progress, elapsed());

            setupDashboard(allActivities);
            loadFilterState();
            populateGearFilters();
            renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter);
            renderedTabs.add('analysis-tab');
            setupYearlySelector();

            const initialTabId = getTabIdFromPath(window.location.pathname);
            activateTab(initialTabId, { updateUrl: true, replaceUrl: true });
        } catch (error) {
            handleError('Could not initialize the app', error);
        } finally {
            hideLoading();
        }
    }

    async function refreshActivities() {
        const t0 = Date.now();
        const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s elapsed`;
        showLoading('Refreshing activities from Strava...', 20, elapsed());
        try {
            const activities = await fetchAllActivities();
            const athlete = await fetchAthleteData();
            const zones = await fetchTrainingZones();
            let gears = [];

            try {
                gears = athlete ? await fetchAllGears(athlete) : [];
                setCachedGears(gears);
            } catch (error) {
                console.warn('Failed to load gears during refresh, continuing without:', error);
                gears = [];
            }

            // Keep refresh aligned with initial load: reuse preprocessed fields (including activity.tss).
            allActivities = await preprocessActivities(activities, athlete, zones, gears);
            localStorage.setItem('strava_activities', JSON.stringify(allActivities));
            localStorage.setItem('strava_activities_timestamp', Date.now().toString());
            showLoading(`Rebuilding views (${allActivities.length} activities)...`, 80, elapsed());

            // Reset rendered state so tabs re-render with fresh data
            renderedTabs.clear();
            loadFilterState();
            populateGearFilters();
            renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter);
            renderedTabs.add('analysis-tab');
            setupYearlySelector();
            activateTab(getTabIdFromPath(window.location.pathname));
            showLoading('Refresh completed', 100, elapsed());
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

    // --- SERVICE WORKER REGISTRATION (PWA) ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registrado exitosamente:', registration);
                })
                .catch(error => {
                    console.log('Error registrando Service Worker:', error);
                });
        });
    }

    // --- ATHLETE FILTER LISTENERS (via custom event) ---
    document.addEventListener('athlete-filters-changed', (e) => {
        const { dateFilterFrom: newFrom, dateFilterTo: newTo, sportFilter, dataType, allActivities: activities } = e.detail;
        athleteSportFilter = sportFilter;
        athleteDataType = dataType;
        dateFilterFrom = newFrom;
        dateFilterTo = newTo;
        saveFilterState();
        renderAthleteTab(activities, dateFilterFrom, dateFilterTo, athleteSportFilter, athleteDataType);
    });

    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', () => {
            document.querySelectorAll('#year-filter-buttons .year-btn').forEach(b => b.classList.remove('active'));
            dateFilterFrom = dateFromEl?.value || null;
            dateFilterTo = dateToEl?.value || null;
            runGearFilter = runGearFilterEl?.value || 'all';
            saveFilterState();
            renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter);
        });
    }

    if (resetFilterButton) {
        resetFilterButton.addEventListener('click', () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            if (dateFromEl) dateFromEl.value = '';
            if (dateToEl) dateToEl.value = '';
            runGearFilter = 'all';
            if (runGearFilterEl) runGearFilterEl.value = 'all';
            document.querySelectorAll('#year-filter-buttons .year-btn').forEach(b => b.classList.remove('active'));
            saveFilterState();
            renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter);
        });
    }

    if (runGearFilterEl) {
        runGearFilterEl.addEventListener('change', () => {
            runGearFilter = runGearFilterEl.value || 'all';
            saveFilterState();
            renderRunAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, runGearFilter);
        });
    }

    // Bike Tab Filters
    if (bikeApplyFilterButton) {
        bikeApplyFilterButton.addEventListener('click', () => {
            document.querySelectorAll('#bike-year-filter-buttons .year-btn').forEach(b => b.classList.remove('active'));
            dateFilterFrom = bikeDateFromEl?.value || null;
            dateFilterTo = bikeDateToEl?.value || null;
            bikeGearFilter = bikeGearFilterEl?.value || 'all';
            saveFilterState();
            renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, bikeGearFilter);
        });
    }

    if (bikeResetFilterButton) {
        bikeResetFilterButton.addEventListener('click', () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            if (bikeDateFromEl) bikeDateFromEl.value = '';
            if (bikeDateToEl) bikeDateToEl.value = '';
            bikeGearFilter = 'all';
            if (bikeGearFilterEl) bikeGearFilterEl.value = 'all';
            document.querySelectorAll('#bike-year-filter-buttons .year-btn').forEach(b => b.classList.remove('active'));
            saveFilterState();
            renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, bikeGearFilter);
        });
    }

    if (bikeGearFilterEl) {
        bikeGearFilterEl.addEventListener('change', () => {
            bikeGearFilter = bikeGearFilterEl.value || 'all';
            saveFilterState();
            renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, bikeGearFilter);
        });
    }

    // Swim Tab Filters
    if (swimApplyFilterButton) {
        swimApplyFilterButton.addEventListener('click', () => {
            document.querySelectorAll('#swim-year-filter-buttons .year-btn').forEach(b => b.classList.remove('active'));
            dateFilterFrom = swimDateFromEl?.value || null;
            dateFilterTo = swimDateToEl?.value || null;
            saveFilterState();
            renderSwimAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
        });
    }

    if (swimResetFilterButton) {
        swimResetFilterButton.addEventListener('click', () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            if (swimDateFromEl) swimDateFromEl.value = '';
            if (swimDateToEl) swimDateToEl.value = '';
            document.querySelectorAll('#swim-year-filter-buttons .year-btn').forEach(b => b.classList.remove('active'));
            saveFilterState();
            renderSwimAnalysisTab(allActivities, dateFilterFrom, dateFilterTo);
        });
    }

    // --- APP ENTRY POINT ---
    handleAuth(initializeApp).catch(error => {
        console.error('App failed to start:', error);
        hideLoading();
    });
});