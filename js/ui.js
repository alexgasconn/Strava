// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';

// --- DOM REFERENCES (las que ya tenías) ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const athleteName = document.getElementById('athlete-name');
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');

// --- UI HELPERS (las que ya tenías) ---
export function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.style.display = 'flex'; // O 'block', dependiendo de tu CSS para el overlay
        loadingOverlay.classList.remove('hidden'); // Mantenemos la clase por si acaso
    }
}

export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none'; // ¡La clave es esta línea!
        loadingOverlay.classList.add('hidden'); // Mantenemos la clase por si acaso
    }
}

export function handleError(message, error) { /*...*/ }
export function setupDashboard(activities) { /*...*/ }

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
    let currentDayStreakValue = 0;
    for (let i = 0; i < allDays.length; i++) {
        const day = allDays[i];
        if (!prevDay) {
            currentDayStreak = 1;
        } else {
            const prev = new Date(prevDay);
            const curr = new Date(day);
            const diff = (curr - prev) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                currentDayStreak++;
            } else {
                currentDayStreak = 1;
            }
        }
        if (currentDayStreak > maxDayStreak) maxDayStreak = currentDayStreak;
        prevDay = day;
    }
    // Calcular racha actual de días (hasta hoy, hacia atrás)
    let today = new Date().toISOString().slice(0, 10);
    let idx = allDays.length - 1;
    currentDayStreakValue = 0;
    while (idx >= 0) {
        if (allDays[idx] === today) {
            currentDayStreakValue++;
            today = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
            idx--;
        } else {
            // Si la última actividad no es hoy, pero es consecutiva hacia atrás
            const diff = (new Date(today) - new Date(allDays[idx])) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                currentDayStreakValue++;
                today = allDays[idx];
                today = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
                idx--;
            } else {
                break;
            }
        }
    }

    // --- SEMANAS CONSECUTIVAS ---
    const weekSet = new Set(runs.map(a => {
        const d = new Date(a.start_date_local);
        const year = d.getFullYear();
        const week = getISOWeek(d);
        return `${year}-W${week}`;
    }));
    const allWeeks = Array.from(weekSet).sort();

    let maxWeekStreak = 0, currentWeekStreak = 0, prevWeek = null;
    for (let i = 0; i < allWeeks.length; i++) {
        const [year, weekStr] = allWeeks[i].split('-W');
        const week = parseInt(weekStr, 10);
        const prev = prevWeek ? prevWeek.split('-W').map(Number) : null;
        if (!prevWeek) {
            currentWeekStreak = 1;
        } else {
            if (
                (parseInt(year) === prev[0] && week === prev[1] + 1) ||
                (parseInt(year) === prev[0] + 1 && prev[1] === 52 && week === 1)
            ) {
                currentWeekStreak++;
            } else {
                currentWeekStreak = 1;
            }
        }
        if (currentWeekStreak > maxWeekStreak) maxWeekStreak = currentWeekStreak;
        prevWeek = allWeeks[i];
    }
    // Calcular racha actual de semanas (hasta esta semana, hacia atrás)
    let now = new Date();
    let thisWeekYear = now.getFullYear();
    let thisWeekNum = getISOWeek(now);
    let currentWeekStreakValue = 0;
    let weekIdx = allWeeks.length - 1;
    while (weekIdx >= 0) {
        const [wYear, wNum] = allWeeks[weekIdx].split('-W').map(Number);
        if (wYear === thisWeekYear && wNum === thisWeekNum) {
            currentWeekStreakValue++;
            // Retrocede una semana
            if (thisWeekNum === 1) {
                thisWeekYear -= 1;
                thisWeekNum = 52;
            } else {
                thisWeekNum -= 1;
            }
            weekIdx--;
        } else {
            // Si la última semana no es la actual, pero es consecutiva hacia atrás
            let expectedYear = thisWeekYear;
            let expectedNum = thisWeekNum;
            if (expectedNum === 1) {
                expectedYear -= 1;
                expectedNum = 52;
            } else {
                expectedNum -= 1;
            }
            if (wYear === expectedYear && wNum === expectedNum) {
                currentWeekStreakValue++;
                thisWeekYear = expectedYear;
                thisWeekNum = expectedNum;
                weekIdx--;
            } else {
                break;
            }
        }
    }

    // --- MESES CONSECUTIVOS ---
    const monthSet = new Set(runs.map(a => a.start_date_local.substring(0, 7)));
    const allMonths = Array.from(monthSet).sort();

    let maxMonthStreak = 0, currentMonthStreak = 0, prevMonth = null;
    for (let i = 0; i < allMonths.length; i++) {
        const [year, month] = allMonths[i].split('-').map(Number);
        const prev = prevMonth ? prevMonth.split('-').map(Number) : null;
        if (!prevMonth) {
            currentMonthStreak = 1;
        } else {
            if (
                (year === prev[0] && month === prev[1] + 1) ||
                (year === prev[0] + 1 && prev[1] === 12 && month === 1)
            ) {
                currentMonthStreak++;
            } else {
                currentMonthStreak = 1;
            }
        }
        if (currentMonthStreak > maxMonthStreak) maxMonthStreak = currentMonthStreak;
        prevMonth = allMonths[i];
    }
    // Calcular racha actual de meses (hasta este mes, hacia atrás)
    let thisMonthStr = new Date().toISOString().slice(0, 7);
    let [curYear, curMonth] = thisMonthStr.split('-').map(Number);
    let currentMonthStreakValue = 0;
    let monthIdx = allMonths.length - 1;
    while (monthIdx >= 0) {
        const [mYear, mMonth] = allMonths[monthIdx].split('-').map(Number);
        if (mYear === curYear && mMonth === curMonth) {
            currentMonthStreakValue++;
            // Retrocede un mes
            if (curMonth === 1) {
                curYear -= 1;
                curMonth = 12;
            } else {
                curMonth -= 1;
            }
            monthIdx--;
        } else {
            // Si la última actividad no es este mes, pero es consecutiva hacia atrás
            let expectedYear = curYear;
            let expectedMonth = curMonth;
            if (expectedMonth === 1) {
                expectedYear -= 1;
                expectedMonth = 12;
            } else {
                expectedMonth -= 1;
            }
            if (mYear === expectedYear && mMonth === expectedMonth) {
                currentMonthStreakValue++;
                curYear = expectedYear;
                curMonth = expectedMonth;
                monthIdx--;
            } else {
                break;
            }
        }
    }

    // Renderiza el resultado en dos columnas: Mejor racha histórica y racha actual
    const streaksInfo = document.getElementById('streaks-info');
    streaksInfo.innerHTML = `
      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <div>
          <h4>🏆 Mejor racha histórica</h4>
          <div><b>Días consecutivos:</b> ${maxDayStreak}</div>
          <div><b>Semanas consecutivas:</b> ${maxWeekStreak}</div>
          <div><b>Meses consecutivos:</b> ${maxMonthStreak}</div>
        </div>
        <div>
          <h4>🔥 Racha actual</h4>
          <div><b>Días consecutivos:</b> ${currentDayStreakValue}</div>
          <div><b>Semanas consecutivas:</b> ${currentWeekStreakValue}</div>
          <div><b>Meses consecutivos:</b> ${currentMonthStreakValue}</div>
        </div>
      </div>
    `;
}