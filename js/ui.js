// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';
import { getISOWeek } from './utils.js';
import { estimateAverageHR, estimateVO2max } from './utils.js'; // Ajusta la ruta según tu estructura


// --- DOM REFERENCES  ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const athleteName = document.getElementById('athlete-name');
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');

// --- UI HELPERS ---

export function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.style.display = 'flex';
        loadingOverlay.classList.remove('hidden');
    }
}

export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
        loadingOverlay.classList.add('hidden');
    }
}

export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Check console for details.`);
}

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
    setupExportButtons(activities);
}

// LA FUNCIÓN PRINCIPAL DE RENDERIZADO
export async function renderDashboard(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    // --- ¡NUEVO FLUJO! ---
    // 1. Obtenemos los datos de los gears PRIMERO
    const { gearDetails, gearIdToName } = await fetchAllGearDetails(runs);

    // 2. Renderizamos todos los componentes, pasando los datos necesarios
    renderSummaryCards(runs);
    renderAllCharts(runs, gearIdToName); // Pasamos el mapeo de nombres
    renderRaceList(runs);
    renderAllRunsTable(runs);
    renderGearSection(runs, gearDetails); // Pasamos los detalles completos
    renderStreaks(runs);
    renderPersonalBests(runs);
    renderRiegelPredictions(runs);
}

function renderSummaryCards(runs) {
    const summaryContainer = document.getElementById('summary-cards');
    if (!summaryContainer) return;

    // VO2max medio de las últimas 5 actividades con dato válido
    const last5 = [...runs]
        .filter(a => a.estimated_vo2max)
        .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))
        .slice(0, 5);
    const avgVO2 = last5.length
        ? (last5.reduce((sum, a) => sum + a.estimated_vo2max, 0) / last5.length).toFixed(1)
        : '-';

    summaryContainer.innerHTML = `
        <div class="card"><h3>Activities</h3><p>${runs.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
        <div class="card"><h3>Total Elevation</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        <div class="card"><h3>VO₂max (últimas 5)</h3><p>${avgVO2}</p></div>
    `;
}

function renderAllCharts(runs) {
    charts.renderConsistencyChart(runs);
    charts.renderActivityTypeChart(runs);
    charts.renderMonthlyDistanceChart(runs);
    charts.renderPaceVsDistanceChart(runs);
    charts.renderDistanceHistogram(runs);
    charts.renderVo2maxChart(runs);

    charts.renderFitnessChart(runs);
    charts.renderStackedAreaGearChart(runs, gearIdToName);
    charts.renderGearGanttChart(runs, gearIdToName);
    charts.renderGearMatrixGanttChart(runs, gearIdToName);
    charts.renderAccumulatedDistanceChart(runs);
    charts.renderRollingMeanDistanceChart(runs);
    charts.renderDistanceVsElevationChart(runs);
    charts.renderElevationHistogram(runs);
    charts.renderRunsHeatmap(runs);
}


// --- HTML/TABLE RENDERING FUNCTIONS ----

function renderRaceList(runs) {
    const container = document.getElementById('race-list');
    if (!container) return;

    const races = runs.filter(act => act.workout_type === 1);
    if (races.length === 0) {
        container.innerHTML = "<tbody><tr><td colspan='6'>No races found in this period.</td></tr></tbody>";
        return;
    }

    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    const tableBody = races.map(act => {
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
    container.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

function renderAllRunsTable(runs) {
    const container = document.getElementById('all-runs-table');
    if (!container) return;

    if (runs.length === 0) {
        container.innerHTML = "<tbody><tr><td colspan='6'>No runs found in this period.</td></tr></tbody>";
        return;
    }

    // Ordenamos las carreras de más reciente a más antigua para la tabla
    const sortedRuns = [...runs].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
    let showAll = container.getAttribute('data-show-all') === 'true';
    const runsToShow = showAll ? sortedRuns : sortedRuns.slice(0, 10);

    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    const tableBody = runsToShow.map(act => {
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

    let toggleBtn = '';
    if (sortedRuns.length > 10) {
        toggleBtn = `
            <div style="margin: 0.5em 0;">
                <button id="toggle-all-runs-btn">
                    ${showAll ? 'Show Only Last 10' : 'Show All Runs'}
                </button>
            </div>
        `;
    }

    container.innerHTML = toggleBtn + tableHeader + `<tbody>${tableBody}</tbody>`;

    if (sortedRuns.length > 10) {
        document.getElementById('toggle-all-runs-btn').onclick = () => {
            container.setAttribute('data-show-all', showAll ? 'false' : 'true');
            renderAllRunsTable(runs);
        };
    }
}


function renderStreaks(runs) {
    const streaksInfo = document.getElementById('streaks-info');
    if (!streaksInfo) return;

    // --- DÍAS CONSECUTIVOS ---
    const runDates = new Set(runs.map(a => a.start_date_local.substring(0, 10)));
    const allDays = Array.from(runDates).sort();

    // Mejor racha histórica de días
    let maxDayStreak = 0, currentDayStreak = 0, prevDay = null;
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
    // Racha actual de días (hasta hoy, hacia atrás)
    let today = new Date().toISOString().slice(0, 10);
    let idx = allDays.length - 1;
    let currentDayStreakValue = 0;
    while (idx >= 0) {
        if (allDays[idx] === today) {
            currentDayStreakValue++;
            today = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
            idx--;
        } else {
            break;
        }
    }

    // --- SEMANAS CONSECUTIVAS ---
    const weekSet = new Set(runs.map(a => {
        const d = new Date(a.start_date_local);
        const year = d.getFullYear();
        const week = utils.getISOWeek(d);
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
    // Racha actual de semanas (hasta esta semana, hacia atrás)
    let now = new Date();
    let thisWeekYear = now.getFullYear();
    let thisWeekNum = utils.getISOWeek(now);
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
            break;
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
    // Racha actual de meses (hasta este mes, hacia atrás)
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
            break;
        }
    }

    // Renderiza el resultado en dos columnas: Mejor racha histórica y racha actual
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

function renderPersonalBests(runs) {
    const distances = [
        { name: 'Mile', km: 1.609 },
        { name: '5K', km: 5 },
        { name: '10K', km: 10 },
        { name: 'Half Marathon', km: 21.097 },
        { name: 'Marathon', km: 42.195 }
    ];
    const margin = 0.1; // 10%

    // Helper to format pace
    function formatPace(secPerKm) {
        if (!isFinite(secPerKm) || secPerKm <= 0) return '-';
        const min = Math.floor(secPerKm / 60);
        const sec = Math.round(secPerKm % 60);
        return `${min}:${sec.toString().padStart(2, '0')} /km`;
    }

    // Find bests and top 3 for each distance
    const bests = distances.map(d => {
        const min = d.km * (1 - margin);
        const max = d.km * (1 + margin);
        const candidates = runs.filter(a => {
            const distKm = a.distance / 1000;
            return distKm >= min && distKm <= max && a.moving_time > 0;
        });
        if (candidates.length === 0) return { ...d, best: null, top3: [] };

        // Sort by best pace (lowest time/km)
        const sorted = [...candidates].sort((a, b) =>
            (a.moving_time / (a.distance / 1000)) - (b.moving_time / (b.distance / 1000))
        );
        const best = sorted[0];
        const top3 = sorted.slice(0, 3).map(act => {
            const paceSec = act.moving_time / (act.distance / 1000);
            return {
                id: act.id,
                date: act.start_date_local.substring(0, 10),
                pace: formatPace(paceSec),
                name: act.name || '',
                dist: (act.distance / 1000).toFixed(2),
                time: new Date(act.moving_time * 1000).toISOString().substr(11, 8)
            };
        });
        return {
            ...d,
            best: top3[0],
            top3
        };
    });

    // Render: one table per distance, with a button to show/hide top 3
    const container = document.getElementById('personal-bests');
    if (!container) return;
    container.innerHTML = bests.map((b, idx) => {
        if (!b.best) {
            return `
                <div class="personal-best-table">
                    <h4>${b.name}</h4>
                    <table class="df-table">
                        <thead>
                            <tr>
                                <th>Best Pace</th>
                                <th>Date</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="3">No result</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }
        const tableId = `top3-${b.name.replace(/\s/g, '').toLowerCase()}`;
        return `
            <div class="personal-best-table" style="margin-bottom:2em;">
                <h4>${b.name}</h4>
                <table class="df-table">
                    <thead>
                        <tr>
                            <th>Best Pace</th>
                            <th>Date</th>
                            <th>Details</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${b.best.pace}</td>
                            <td>${b.best.date}</td>
                            <td><a href="activity.html?id=${b.best.id}" target="_blank"><button>View</button></a></td>
                            <td>
                                <button onclick="document.getElementById('${tableId}').style.display = (document.getElementById('${tableId}').style.display === 'none' ? 'block' : 'none')">
                                    Show Top 3
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div id="${tableId}" style="display:none; margin-top:0.5em;">
                    <table class="df-table" style="background:#f9f9f9;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Date</th>
                                <th>Pace</th>
                                <th>Distance (km)</th>
                                <th>Time</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${b.top3.map((t, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${t.date}</td>
                                    <td>${t.pace}</td>
                                    <td>${t.dist}</td>
                                    <td>${t.time}</td>
                                    <td><a href="activity.html?id=${t.id}" target="_blank"><button>View</button></a></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}





// --- SECCIÓN DE GEARS (REFACTORIZADA) ---

// 1. Nueva función que SOLO obtiene los datos de los gears
async function fetchAllGearDetails(runs) {
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));
    if (gearIds.length === 0) {
        return { gearDetails: [], gearIdToName: {} };
    }
    const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
    const gearDetails = results.map(r => r.gear);
    const gearIdToName = gearDetails.reduce((map, gear) => {
        map[gear.id] = gear.name || `${gear.brand_name} ${gear.model_name}`;
        return map;
    }, {});
    
    return { gearDetails, gearIdToName };
}

// 2. Nueva función que SOLO renderiza las tarjetas, recibiendo los datos ya procesados
function renderGearCards(gearDetails, runs) {
    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) return;
    
    // ... (TODA la lógica de renderizado de tarjetas que ya tenías,
    // incluyendo el modo de edición, botones de guardar, etc. va aquí)
    // Pero ahora recibe `gearDetails` en lugar de `apiResults`.
}

// 3. Función principal que orquesta el renderizado de la sección de Gears
async function renderGearSection(runs, gearDetails) {
    const container = document.getElementById('gear-info-section');
    if (!container) return;
    
    // Aquí puedes renderizar las tarjetas y cualquier otra cosa relacionada con gears
    renderGearCards(gearDetails, runs);
}








// async function renderGearSection(runs) {
//     const container = document.getElementById('gear-info-section');
//     if (!container) return;
//     const gearListContainer = document.getElementById('gear-info-list');
//     const gearUsage = new Map();
//     runs.forEach(run => {
//         if (run.gear_id) {
//             if (!gearUsage.has(run.gear_id)) {
//                 gearUsage.set(run.gear_id, { numUses: 0, firstUse: run.start_date_local });
//             }
//             gearUsage.get(run.gear_id).numUses++;
//         }
//     });
//     const gearIds = Array.from(gearUsage.keys());
//     if (gearIds.length === 0) {
//         gearListContainer.innerHTML = '<p>No gear used in this period.</p>';
//         return;
//     }
//     gearListContainer.innerHTML = '<p>Loading detailed gear info...</p>';
//     try {
//         const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
//         // NUEVO CÓDIGO AQUI
//         const gearIdToName = {};
//         results.forEach(result => {
//             const gear = result.gear;
//             // Usa el nombre más bonito disponible
//             gearIdToName[gear.id] = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ');
//         });
//         charts.renderStackedAreaGearChart(runs, gearIdToName);
//         charts.renderGearGanttChart(runs, gearIdToName);
//         renderGearCards(results, gearUsage, runs);
//     } catch (error) {
//         console.error("Failed to fetch gear details:", error);
//         gearListContainer.innerHTML = '<p>Error loading gear details. Check the console.</p>';
//     }
// }

// function renderGearCards(apiResults, usageData, allRuns) {
//     const gearListContainer = document.getElementById('gear-info-list');
//     let isEditMode = localStorage.getItem('gearEditMode') === 'true';
//     const cardsHtml = apiResults.map(result => {
//         const gear = result.gear;
//         const usage = usageData.get(gear.id) || { numUses: 0, firstUse: 'N/A' };
//         const customData = JSON.parse(localStorage.getItem(`gear-custom-${gear.id}`) || '{}');
//         const price = customData.price ?? 120;
//         const durationKm = customData.durationKm ?? 700;
//         const totalKm = gear.distance / 1000;
//         const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
//         const euroPerKm = price > 0 && totalKm > 0 ? (price / totalKm).toFixed(2) : '-';
//         const needsReplacement = durabilityPercent >= 100;
//         let durabilityColor = durabilityPercent > 90 ? '#dc3545' : durabilityPercent > 75 ? '#ffc107' : '#28a745';
//         const editInputs = `
//             <div class="gear-edit-fields">
//                 <div><label for="price-${gear.id}">Price (€):</label><input type="number" value="${price}" id="price-${gear.id}"></div>
//                 <div><label for="duration-${gear.id}">Lifespan (km):</label><input type="number" value="${durationKm}" id="duration-${gear.id}"></div>
//                 <button class="save-gear-btn" data-gearid="${gear.id}">💾 Save</button>
//             </div>`;
//         return `
//           <div class="gear-card ${gear.retired ? 'retired' : ''} ${gear.primary ? 'primary' : ''}">
//             ${gear.retired ? '<span class="badge retired-badge">RETIRED</span>' : ''}
//             ${gear.primary ? '<span class="badge primary-badge">PRIMARY</span>' : ''}
//             <h4>${gear.name || `${gear.brand_name} ${gear.model_name}`}</h4>
//             <p class="gear-distance">${totalKm.toFixed(0)} km</p>
//             <div class="durability-bar" title="${durabilityPercent.toFixed(0)}% of ${durationKm} km">
//                 <div class="durability-progress" style="width: ${durabilityPercent}%; background-color: ${durabilityColor};"></div>
//             </div>
//             <small>${durabilityPercent.toFixed(0)}% of ${durationKm} km</small>
//             <div class="gear-stats">
//                 <span><strong>Uses:</strong> ${usage.numUses}</span>
//                 <span><strong>€/km:</strong> ${euroPerKm}</span>
//                 <span><strong>First Use:</strong> ${new Date(usage.firstUse).toLocaleDateString()}</span>
//             </div>
//             ${needsReplacement && !gear.retired ? '<div class="alert-danger">Replacement Needed!</div>' : ''}
//             ${isEditMode ? editInputs : ''}
//           </div>`;
//     }).join('');
//     const editButtonHtml = `<div class="edit-mode-toggle"><button id="toggle-gear-edit">${isEditMode ? '✅ Done Editing' : '✏️ Edit Gear'}</button></div>`;
//     gearListContainer.innerHTML = editButtonHtml + `<div id="gear-cards-container">${cardsHtml}</div>`;
//     document.getElementById('toggle-gear-edit').addEventListener('click', () => {
//         localStorage.setItem('gearEditMode', !isEditMode);
//         renderGearCards(apiResults, usageData, allRuns);
//     });
//     if (isEditMode) {
//         document.querySelectorAll('.save-gear-btn').forEach(btn => {
//             btn.addEventListener('click', () => {
//                 const gearId = btn.getAttribute('data-gearid');
//                 const price = parseFloat(document.getElementById(`price-${gearId}`).value);
//                 const durationKm = parseInt(document.getElementById(`duration-${gearId}`).value, 10);
//                 if (!isNaN(price) && !isNaN(durationKm)) {
//                     localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify({ price, durationKm }));
//                     btn.textContent = '✅';
//                     setTimeout(() => renderGearCards(apiResults, usageData, allRuns), 500);
//                 } else {
//                     alert('Please enter valid numbers for price and duration.');
//                 }
//             });
//         });
//     }
// }


// --- SECCIÓN DEL SELECTOR DE AÑO ---

export function setupYearlySelector(activities, onYearSelect) {
    const yearlyBtn = document.getElementById('yearly-btn');
    const yearList = document.getElementById('year-list');
    if (!yearlyBtn || !yearList) return;
    const years = Array.from(new Set(activities.map(a => new Date(a.start_date_local).getFullYear()))).sort((a, b) => b - a);
    yearList.innerHTML = years.map(year => `<button class="year-btn" data-year="${year}">${year}</button>`).join('');
    yearlyBtn.onclick = () => {
        yearList.style.display = yearList.style.display === 'none' ? 'flex' : 'none';
    };
    yearList.querySelectorAll('.year-btn').forEach(btn => {
        btn.onclick = () => {
            const year = btn.getAttribute('data-year');
            const from = `${year}-01-01`;
            const to = `${year}-12-31`;
            yearList.style.display = 'none';
            if (onYearSelect) {
                onYearSelect(from, to);
            }
        };
    });
}

// --- BOTONES DE EXPORTACIÓN ---
export function setupExportButtons(activities) {
    // CSV
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

    // PDF
    document.getElementById('download-pdf-btn').onclick = () => {
        window.print();
    };
}

export function renderRiegelPredictions(runs) {
    const container = document.getElementById('riegel-predictions');
    if (!container) return;

    // Distancias objetivo
    const targets = [
        { name: 'Mile', km: 1.609 },
        { name: '5K', km: 5 },
        { name: '10K', km: 10 },
        { name: 'Half Marathon', km: 21.097 },
        { name: 'Marathon', km: 42.195 }
    ];

    // Encuentra la mejor marca para cada distancia
    function getBestTime(km) {
        const margin = 0.1;
        const min = km * (1 - margin);
        const max = km * (1 + margin);
        const candidates = runs.filter(a => {
            const distKm = a.distance / 1000;
            return distKm >= min && distKm <= max && a.moving_time > 0;
        });
        if (candidates.length === 0) return null;
        const best = candidates.reduce((minAct, act) =>
            (act.moving_time / (act.distance / 1000)) < (minAct.moving_time / (minAct.distance / 1000)) ? act : minAct
        );
        return {
            seconds: best.moving_time,
            km: best.distance / 1000
        };
    }

    // Formatea segundos a hh:mm:ss
    function formatTime(sec) {
        sec = Math.round(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return (h > 0 ? h + ':' : '') + m.toString().padStart(h > 0 ? 2 : 1, '0') + ':' + s.toString().padStart(2, '0');
    }

    // Formatea ritmo en min/km
    function formatPace(sec, km) {
        if (!isFinite(sec) || !isFinite(km) || km <= 0) return '-';
        const pace = sec / 60 / km;
        const min = Math.floor(pace);
        const secRest = Math.round((pace - min) * 60);
        return `${min}:${secRest.toString().padStart(2, '0')} /km`;
    }

    // Saca las mejores marcas de todas las distancias
    const bests = targets.map(t => ({ ...t, best: getBestTime(t.km) }));

    // Para cada distancia objetivo, predice usando todas las mejores marcas (incluida la propia)
    const rows = targets.map(target => {
        // Para cada mejor marca disponible
        const predictions = bests
            .filter(b => b.best)
            .map(b => {
                // Si es la misma distancia, usa el tiempo real
                if (Math.abs(b.km - target.km) < 0.01) {
                    return { seconds: b.best.seconds };
                }
                // Riegel: T2 = T1 * (D2/D1)^1.06
                const predSec = b.best.seconds * (target.km / b.km) ** 1.06;
                return { seconds: predSec };
            })
            .filter(p => isFinite(p.seconds) && p.seconds > 0);

        if (predictions.length === 0) {
            return `<tr><td>${target.name}</td><td>No data</td><td>-</td></tr>`;
        }

        // Calcula rango
        const minPred = predictions.reduce((min, p) => p.seconds < min.seconds ? p : min, predictions[0]);
        const maxPred = predictions.reduce((max, p) => p.seconds > max.seconds ? p : max, predictions[0]);

        // Si todos los valores son iguales, muestra solo uno
        if (Math.abs(minPred.seconds - maxPred.seconds) < 1) {
            return `<tr>
                <td>${target.name}</td>
                <td>${formatTime(minPred.seconds)}</td>
                <td>${formatPace(minPred.seconds, target.km)}</td>
            </tr>`;
        }

        return `<tr>
            <td>${target.name}</td>
            <td>${formatTime(minPred.seconds)} - ${formatTime(maxPred.seconds)}</td>
            <td>${formatPace(minPred.seconds, target.km)} - ${formatPace(maxPred.seconds, target.km)}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="df-table">
            <thead>
                <tr><th>Distancia</th><th>Predicción (Riegel)</th><th>Ritmo</th></tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Quita 'active' de todos los botones
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Oculta todos los contenidos
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            // Muestra el seleccionado
            document.getElementById(btn.dataset.tab).style.display = 'block';

            // Si es Heatmap, inicializa el heatmap global si no está ya
            if (btn.dataset.tab === 'heatmap-tab') {
                renderGlobalHeatmap();
            }
        });
    });
});

function renderGlobalHeatmap() {
    const container = document.getElementById('global-heatmap');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;margin-top:2em;">Aquí irá el heatmap global de todas tus actividades (próximamente).</p>';
    // Aquí puedes poner el código de Leaflet o el heatmap que quieras en el futuro
}

function preprocessRuns(runs, userMaxHr = 195) {
    runs.forEach(act => {
        act.estimated_hr = estimateAverageHR(act, userMaxHr);
        act.estimated_vo2max = estimateVO2max(act, userMaxHr);
    });
}