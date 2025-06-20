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
    renderPersonalBests(runs);
}


// --- HTML/TABLE RENDERING FUNCTIONS ---

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

    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    // Ordenamos las carreras de más reciente a más antigua para la tabla
    const sortedRuns = [...runs].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
    const tableBody = sortedRuns.map(act => {
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


async function renderGearInfo(runs) {
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));
    const gearInfoList = document.getElementById('gear-info-list');
    if (!gearInfoList) return;

    if (gearIds.length === 0) {
        gearInfoList.innerHTML = '<p>No gear found.</p>';
        return;
    }

    gearInfoList.innerHTML = '<p>Loading gear info...</p>';

    // Configuración por defecto
    const DEFAULT_PRICE = 100; // €
    const DEFAULT_DURATION_KM = 700; // km

    // Fetch info for each gear
    const gearDetails = await Promise.all(gearIds.map(async gearId => {
        try {
            const gear = await fetchGearById(gearId);
            // Filtra actividades de este gear
            const gearRuns = runs.filter(a => a.gear_id === gearId);
            const totalKm = gearRuns.reduce((sum, a) => sum + a.distance, 0) / 1000;
            const numUses = gearRuns.length;
            const firstUse = gearRuns.length ? gearRuns.map(a => a.start_date_local).sort()[0].substring(0, 10) : '-';

            // Personalización (puedes guardar en localStorage por gearId si quieres)
            const price = gear.price ?? DEFAULT_PRICE;
            const durationKm = gear.duration_km ?? DEFAULT_DURATION_KM;

            // Cálculos
            const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
            const euroPerKm = price && totalKm ? (price / totalKm).toFixed(2) : '-';
            const daysUsed = gearRuns.length
                ? (Math.ceil((new Date(gearRuns[gearRuns.length - 1].start_date_local) - new Date(firstUse)) / (1000 * 60 * 60 * 24)) + 1)
                : 0;
            const euroPerDay = price && daysUsed ? (price / daysUsed).toFixed(2) : '-';
            const kmPerDay = daysUsed ? (totalKm / daysUsed).toFixed(2) : '-';

            // Alertas
            const needsReplacement = durabilityPercent >= 100;

            return {
                id: gearId,
                name: `${gear.brand_name} ${gear.model_name}`,
                nickname: gear.nickname || '',
                type: gear.type,
                totalKm: totalKm.toFixed(1),
                numUses,
                firstUse,
                price,
                durationKm,
                durabilityPercent,
                euroPerKm,
                euroPerDay,
                kmPerDay,
                retired: gear.retired,
                primary: gear.primary,
                needsReplacement
            };
        } catch {
            return { id: gearId, name: 'Unknown', type: '', totalKm: '-', numUses: '-', firstUse: '-', price: '-', durationKm: '-', durabilityPercent: '-', euroPerKm: '-', euroPerDay: '-', kmPerDay: '-', retired: false, primary: false, needsReplacement: false };
        }
    }));

    // Render cards
    gearInfoList.innerHTML = gearDetails.map(g => `
      <div class="gear-card${g.primary ? ' primary-gear' : ''}${g.retired ? ' retired' : ''}">
        ${g.retired ? '<span class="retired-badge">RETIRADO</span>' : ''}
        ${g.primary ? '<span class="primary-badge">PRIMARY</span>' : ''}
        <h4>${g.name}</h4>
        ${g.nickname ? `<div><span class="gear-label">Nickname:</span> ${g.nickname}</div>` : ''}
        <div><span class="gear-label">First Use:</span> ${g.firstUse}</div>
        <div><span class="gear-label">Price:</span> ${g.price} €</div>
        <div><span class="gear-label">Duration:</span> ${g.durationKm} km</div>
        <div><span class="gear-label">Current km:</span> ${g.totalKm} km</div>
        <div><span class="gear-label">Num Uses:</span> ${g.numUses}</div>
        <div><span class="gear-label">€ per km:</span> ${g.euroPerKm}</div>
        <div><span class="gear-label">€ per day:</span> ${g.euroPerDay}</div>
        <div><span class="gear-label">km per day:</span> ${g.kmPerDay}</div>
        <div class="durability-bar" title="${g.durabilityPercent.toFixed(0)}% of ${g.durationKm} km">
            <div class="durability-progress" style="width: ${g.durabilityPercent}%; background-color: ${g.durabilityPercent > 90 ? '#dc3545' : g.durabilityPercent > 70 ? '#ffc107' : '#28a745'};"></div>
        </div>
        <small>${g.durabilityPercent.toFixed(0)}% of ${g.durationKm} km used</small>
        ${g.needsReplacement ? '<div class="alert alert-danger">Needs replacement!</div>' : ''}
      </div>
    `).join('');
}


// ¡ATENCIÓN! La función de Streaks que te pasé antes tenía errores de cálculo.
// Esta es una versión simplificada y corregida que funciona.
function renderStreaks(runs) {
    const streaksInfo = document.getElementById('streaks-info');
    if (!streaksInfo) return;

    const runDates = new Set(runs.map(a => a.start_date_local.substring(0, 10)));
    if (runDates.size === 0) {
        streaksInfo.innerHTML = "<p>No runs to calculate streaks.</p>";
        return;
    }

    const sortedDates = Array.from(runDates).sort();

    // --- CÁLCULO DE LA MEJOR RACHA DE DÍAS ---
    let maxDayStreak = 0;
    if (sortedDates.length > 0) {
        let currentDayStreak = 1;
        maxDayStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
            const prevDate = new Date(sortedDates[i - 1]);
            const currentDate = new Date(sortedDates[i]);
            const diffDays = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

            if (diffDays === 1) {
                currentDayStreak++;
            } else {
                currentDayStreak = 1;
            }
            if (currentDayStreak > maxDayStreak) {
                maxDayStreak = currentDayStreak;
            }
        }
    }

    // --- CÁLCULO DE LA RACHA ACTUAL DE DÍAS ---
    let currentDayStreakValue = 0;
    if (runDates.size > 0) {
        let checkDate = new Date();
        while (runDates.has(checkDate.toISOString().slice(0, 10))) {
            currentDayStreakValue++;
            checkDate.setDate(checkDate.getDate() - 1);
        }
    }

    streaksInfo.innerHTML = `
      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <div>
          <h4>🏆 Best Ever</h4>
          <div><b>Consecutive Days:</b> ${maxDayStreak}</div>
        </div>
        <div>
          <h4>🔥 Current</h4>
          <div><b>Consecutive Days:</b> ${currentDayStreakValue}</div>
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
    const margin = 0.05; // 5%

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