// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';
import { getISOWeek } from './utils.js';

// --- DOM REFERENCES (las que ya tenías) ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const athleteName = document.getElementById('athlete-name');
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');

// --- UI HELPERS ---

// ¡CORREGIDO! Faltaba el 'export'
export function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.style.display = 'flex';
        loadingOverlay.classList.remove('hidden');
    }
}

// ¡CORREGIDO! Faltaba el 'export'
export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
        loadingOverlay.classList.add('hidden');
    }
}

// ¡CORREGIDO! Faltaba el 'export'
export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Check console for details.`);
}

// ¡CORREGIDO! Faltaba el 'export'
export function setupDashboard(activities) {
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');

    const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Athlete' };
    athleteName.textContent = `Dashboard for ${athleteInfo.firstname}`;

    const dates = activities.map(a => a.start_date_local.substring(0, 10)).sort();
    if (dates.length > 0) {
        document.getElementById('date-from').min = dates[0];
        document.getElementById('date-from').max = dates[dates.length - 1];
        document.getElementById('date-to').min = dates[0];
        document.getElementById('date-to').max = dates[dates.length - 1];
    }
}

// --- RENDER FUNCTIONS ---

// LA FUNCIÓN PRINCIPAL DE RENDERIZADO
export function renderDashboard(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    // 1. Render Summary Cards
    const summaryContainer = document.getElementById('summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="card"><h3>Activities</h3><p>${runs.length}</p></div>
            <div class="card"><h3>Total Distance</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
            <div class="card"><h3>Total Time</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
            <div class="card"><h3>Total Elevation</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        `;
    }

    // 2. Render all charts by calling functions from the charts module
    charts.renderConsistencyChart(runs);
    charts.renderActivityTypeChart(runs);
    charts.renderMonthlyDistanceChart(runs);
    charts.renderPaceVsDistanceChart(runs);
    charts.renderDistanceHistogram(runs);
    charts.renderVo2maxChart(runs);
    charts.renderFitnessChart(runs);
    charts.renderStackedAreaGearChart(runs);
    charts.renderGearGanttChart(runs);
    charts.renderAccumulatedDistanceChart(runs);
    charts.renderRollingMeanDistanceChart(runs);
    charts.renderDistanceVsElevationChart(runs);
    charts.renderElevationHistogram(runs);
    charts.renderRunsHeatmap(runs);
    
    // 3. Render Tables and other info
    renderRaceList(runs);
    renderAllRunsTable(runs);
    renderGearInfo(runs);
    renderStreaks(runs);
}


// --- HTML/TABLE RENDERING FUNCTIONS ---

function renderRaceList(runs) {
    const raceListContainer = document.getElementById('race-list');
    if (!raceListContainer) return;

    const races = runs.filter(act => act.workout_type === 1);
    if (races.length === 0) {
        raceListContainer.innerHTML = "<tr><td colspan='6'>No races found in this period.</td></tr>";
        return;
    }

    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    const tableBody = races.map(act => {
        const distKm = (act.distance / 1000).toFixed(2);
        const timeStr = new Date(act.moving_time * 1000).toISOString().substr(11, 8);
        const paceMin = (act.moving_time / 60) / (act.distance / 1000);
        const paceStr = `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}`;
        return `<tr>
            <td>${act.start_date_local.substring(0, 10)}</td>
            <td>${act.name}</td>
            <td>${distKm} km</td>
            <td>${timeStr}</td>
            <td>${paceStr} /km</td>
            <td><a href="activity.html?id=${act.id}" target="_blank"><button>View</button></a></td>
        </tr>`;
    }).join('');
    raceListContainer.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

function renderAllRunsTable(runs) {
    const allRunsTable = document.getElementById('all-runs-table');
    if (!allRunsTable) return;

    if (runs.length === 0) {
        allRunsTable.innerHTML = "<tr><td colspan='6'>No runs found in this period.</td></tr>";
        return;
    }
    
    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    const tableBody = runs.map(act => {
        const distKm = (act.distance / 1000).toFixed(2);
        const timeStr = new Date(act.moving_time * 1000).toISOString().substr(11, 8);
        const paceMin = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
        const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';
        return `<tr>
            <td>${act.start_date_local.substring(0, 10)}</td>
            <td>${act.name}</td>
            <td>${distKm} km</td>
            <td>${timeStr}</td>
            <td>${paceStr} /km</td>
            <td><a href="activity.html?id=${act.id}" target="_blank"><button>View</button></a></td>
        </tr>`;
    }).join('');
    allRunsTable.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}


async function renderGearInfo(runs) {
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));
    const gearInfoList = document.getElementById('gear-info-list');
    if (!gearInfoList) return;

    if (gearIds.length === 0) {
        gearInfoList.innerHTML = '<p>No gear used in this period.</p>';
        return;
    }

    gearInfoList.innerHTML = '<p>Loading gear info...</p>';

    const gearDetails = await Promise.all(gearIds.map(async gearId => {
        try {
            const gearData = await fetchGearById(gearId);
            const totalKm = runs.filter(a => a.gear_id === gearId)
                .reduce((sum, a) => sum + a.distance, 0) / 1000;
            return {
                name: gearData.name || `${gearData.brand_name} ${gearData.model_name}`,
                distance: totalKm.toFixed(1),
                retired: gearData.retired ? 'Yes' : 'No'
            };
        } catch {
            return null;
        }
    }));

    gearInfoList.innerHTML = gearDetails.filter(Boolean).map(g => `
      <div class="gear-card">
        <h4>${g.name}</h4>
        <div><span class="gear-label">Total Distance:</span> ${g.distance} km</div>
        <div><span class="gear-label">Retired:</span> ${g.retired}</div>
      </div>
    `).join('');
}


// Muevo aquí la lógica de las rachas. Es una mezcla de UI y cálculo, así que por simplicidad la dejamos aquí.
function renderStreaks(runs) {
    // --- DÍAS CONSECUTIVOS ---
    const daysSet = new Set(runs.map(a => a.start_date_local.substring(0, 10)));
    const allDays = Array.from(daysSet).sort();
    let maxDayStreak = 0, currentDayStreak = 0, prevDay = null;
    if (allDays.length > 0) {
        for (let i = 0; i < allDays.length; i++) {
            const day = allDays[i];
            if (!prevDay || (new Date(day) - new Date(prevDay)) / 86400000 > 1) {
                currentDayStreak = 1;
            } else {
                currentDayStreak++;
            }
            if (currentDayStreak > maxDayStreak) maxDayStreak = currentDayStreak;
            prevDay = day;
        }
    }
    let currentDayStreakValue = 0;
    if (allDays.length > 0) {
        let today = new Date();
        if (allDays.includes(today.toISOString().slice(0, 10))) {
            let i = allDays.length - 1;
            while(i >= 0) {
                const day = new Date(allDays[i]);
                const diff = (today - day) / 86400000;
                if (Math.round(diff) === (allDays.length - 1 - i)) {
                    currentDayStreakValue++;
                } else {
                    break;
                }
                i--;
            }
        }
    }

    // --- SEMANAS CONSECUTIVAS ---
    const weekSet = new Set(runs.map(a => {
        const d = new Date(a.start_date_local);
        return `${d.getFullYear()}-W${getISOWeek(d).toString().padStart(2, '0')}`;
    }));
    const allWeeks = Array.from(weekSet).sort();
    let maxWeekStreak = 0, currentWeekStreak = 0;
    if (allWeeks.length > 0) {
        currentWeekStreak = 1;
        maxWeekStreak = 1;
        for (let i = 1; i < allWeeks.length; i++) {
            const [year1, week1] = allWeeks[i-1].split('-W').map(Number);
            const [year2, week2] = allWeeks[i].split('-W').map(Number);
            if ((year1 === year2 && week2 === week1 + 1) || (year2 === year1 + 1 && week1 === 52 && week2 === 1)) {
                currentWeekStreak++;
            } else {
                currentWeekStreak = 1;
            }
            if (currentWeekStreak > maxWeekStreak) maxWeekStreak = currentWeekStreak;
        }
    }
    // (Cálculo de la racha actual de semanas es complejo, lo simplificamos por ahora)
    let currentWeekStreakValue = 0; // Placeholder

    // --- MESES CONSECUTIVOS ---
    const monthSet = new Set(runs.map(a => a.start_date_local.substring(0, 7)));
    const allMonths = Array.from(monthSet).sort();
    let maxMonthStreak = 0, currentMonthStreak = 0;
    if (allMonths.length > 0) {
        currentMonthStreak = 1;
        maxMonthStreak = 1;
        for (let i = 1; i < allMonths.length; i++) {
            const [year1, month1] = allMonths[i-1].split('-').map(Number);
            const [year2, month2] = allMonths[i].split('-').map(Number);
            if ((year1 === year2 && month2 === month1 + 1) || (year2 === year1 + 1 && month1 === 12 && month2 === 1)) {
                currentMonthStreak++;
            } else {
                currentMonthStreak = 1;
            }
            if (currentMonthStreak > maxMonthStreak) maxMonthStreak = currentMonthStreak;
        }
    }
    let currentMonthStreakValue = 0; // Placeholder

    const streaksInfo = document.getElementById('streaks-info');
    if (streaksInfo) {
      streaksInfo.innerHTML = `
        <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
          <div>
            <h4>🏆 Best ever</h4>
            <div><b>Days:</b> ${maxDayStreak}</div>
            <div><b>Weeks:</b> ${maxWeekStreak}</div>
            <div><b>Months:</b> ${maxMonthStreak}</div>
          </div>
          <div>
            <h4>🔥 Current</h4>
            <div><b>Days:</b> ${currentDayStreakValue}</div>
            <div><b>Weeks:</b> ${currentWeekStreakValue}</div>
            <div><b>Months:</b> ${currentMonthStreakValue}</div>
          </div>
        </div>
      `;
    }
}