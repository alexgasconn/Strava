// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';

// --- REFERENCIAS AL DOM ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const athleteName = document.getElementById('athlete-name');
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');

// --- FUNCIONES DE AYUDA DE UI (EXPORTADAS) ---

export function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Check console for details.`);
}

export function setupDashboard(activities) {
    if (loginSection) loginSection.classList.add('hidden');
    if (appSection) appSection.classList.remove('hidden');

    const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Athlete' };
    if (athleteName) athleteName.textContent = `Dashboard for ${athleteInfo.firstname}`;

    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    if (dateFrom && dateTo) {
        const dates = activities.map(a => a.start_date_local.substring(0, 10)).sort();
        if (dates.length > 0) {
            dateFrom.min = dates[0];
            dateFrom.max = dates[dates.length - 1];
            dateTo.min = dates[0];
            dateTo.max = dates[dates.length - 1];
        }
    }

    // Solo configura botones de exportación si existen en la página
    if (document.getElementById('download-csv-btn')) {
        setupExportButtons(activities);
    }
}


// --- FUNCIONES PRINCIPALES DE RENDERIZADO (EXPORTADAS) ---

export async function renderGeneralDashboard(allActivities, from, to) {
    const filtered = utils.filterActivitiesByDate(allActivities, from, to);
    renderGeneralSummaryCards(filtered);
    charts.renderConsistencyChart(filtered);
    charts.renderRunsHeatmap(filtered); // Muestra heatmap de TODAS las actividades
}

export async function renderRunningDashboard(allRuns, from, to) {
    const runs = utils.filterActivitiesByDate(allRuns, from, to);
    const { gearDetails, gearIdToName } = await fetchAllGearDetails(runs);

    renderRunSummaryCards(runs);
    renderRunCharts(runs, gearIdToName);
    renderRaceList(runs);
    renderAllRunsTable(runs);
    renderStreaks(runs);
    renderPersonalBests(runs);
    renderRiegelPredictions(runs);
    renderGearSection(runs, gearDetails);
}


// --- FUNCIONES DE AYUDA INTERNAS (NO NECESITAN EXPORTACIÓN) ---

function renderGeneralSummaryCards(activities) {
    const summaryContainer = document.getElementById('summary-cards');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = `
        <div class="card"><h3>Total Activities</h3><p>${activities.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${(activities.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${(activities.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
        <div class="card"><h3>Total Elevation</h3><p>${activities.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
    `;
}

function renderRunSummaryCards(runs) {
    const summaryContainer = document.getElementById('summary-cards');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = `
        <div class="card"><h3>Runs</h3><p>${runs.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
    `;
}

function renderRunCharts(runs, gearIdToName) {
    charts.renderConsistencyChart(runs);
    charts.renderActivityTypeChart(runs);
    charts.renderMonthlyDistanceChart(runs);
    charts.renderPaceVsDistanceChart(runs);
    charts.renderDistanceHistogram(runs);
    charts.renderVo2maxChart(runs);
    charts.renderFitnessChart(runs);
    charts.renderDistanceVsElevationChart(runs);
    charts.renderElevationHistogram(runs);
    charts.renderAccumulatedDistanceChart(runs);
    charts.renderRollingMeanDistanceChart(runs);
    charts.renderStackedAreaGearChart(runs, gearIdToName);
    charts.renderGearMatrixGantt(runs, gearIdToName);
}

// Aquí van TODAS las demás funciones de ayuda que tenías:
// renderRaceList, renderAllRunsTable, renderStreaks, renderPersonalBests,
// renderRiegelPredictions, renderGearSection, renderGearCards, y setupExportButtons.
// Asegúrate de que estén aquí, definidas una sola vez.

// Ejemplo:
function renderRaceList(runs) {
    const container = document.getElementById('race-list');
    if (!container) return;
    // ... (el resto del código de la función)
}

function renderAllRunsTable(runs) {
    const container = document.getElementById('all-runs-table');
    if (!container) return;
    // ... (el resto del código de la función)
}

function renderStreaks(runs) {
    const streaksInfo = document.getElementById('streaks-info');
    if (!streaksInfo) return;
    // ... (el resto del código de la función)
}

function renderPersonalBests(runs) {
    const container = document.getElementById('personal-bests');
    if (!container) return;
    // ... (el resto del código de la función)
}

function renderRiegelPredictions(runs) {
    const container = document.getElementById('riegel-predictions');
    if (!container) return;
    // ... (el resto del código de la función)
}

async function fetchAllGearDetails(runs) {
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));
    if (gearIds.length === 0) {
        return { gearDetails: [], gearIdToName: {} };
    }
    const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
    const gearDetails = results.map(r => r.gear);
    const gearIdToName = gearDetails.reduce((map, gear) => {
        if (gear) {
            map[gear.id] = gear.name || `${gear.brand_name || ''} ${gear.model_name || ''}`.trim();
        }
        return map;
    }, {});
    return { gearDetails, gearIdToName };
}

async function renderGearSection(runs, gearDetails) {
    const container = document.getElementById('gear-info-section');
    if (!container) return;

    const usageData = new Map();
    runs.forEach(run => {
        if (run.gear_id) {
            if (!usageData.has(run.gear_id)) {
                usageData.set(run.gear_id, { numUses: 0, firstUse: run.start_date_local });
            }
            usageData.get(run.gear_id).numUses++;
        }
    });

    renderGearCards(gearDetails, usageData, runs);
}

function renderGearCards(gearDetails, usageData, allRuns) {
    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) return;
    // ... (el resto del código de la función)
}

function setupExportButtons(activities) {
    document.getElementById('download-csv-btn').onclick = () => {
        if (!activities || activities.length === 0) return alert('No data to export.');
        const headers = Object.keys(activities[0]);
        const csvRows = [
            headers.join(','),
            ...activities.map(act => headers.map(h => `"${(act[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'strava_activities.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    document.getElementById('download-pdf-btn').onclick = () => {
        window.print();
    };
}