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
    const container = document.getElementById('gear-info-list');
    if (!container) return;

    // 1. OBTENER IDs ÚNICOS
    // Sacamos todos los gear_id de las actividades filtradas y eliminamos duplicados.
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));
    
    if (gearIds.length === 0) {
        container.innerHTML = '<p>No gear used in this period.</p>';
        return;
    }

    container.innerHTML = '<p>Loading detailed gear info...</p>';

    try {
        // 2. LLAMAR A LA API PARA CADA ID
        // Creamos un array de promesas, donde cada una es una llamada a nuestra API de backend.
        const gearDetailsPromises = gearIds.map(id => fetchGearById(id));
        // `Promise.all` espera a que TODAS las llamadas terminen.
        const results = await Promise.all(gearDetailsPromises);
        console.log("Gear details fetched:", results);

        // 3. PROCESAR Y RENDERIZAR LOS DATOS
        // Iteramos sobre los resultados (que contienen el objeto `DetailedGear`).
        const gearHtml = results.map(result => {
            const gear = result.gear; // Este es el objeto `DetailedGear` que nos devolvió la API
            
            // --- Lógica de negocio para la durabilidad ---
            const DURABILITY_GOAL_KM = 700; // Objetivo de durabilidad
            const totalKm = gear.distance / 1000; // Convertimos metros a KM
            const durabilityPercent = Math.min((totalKm / DURABILITY_GOAL_KM) * 100, 100);

            // Asignamos un color a la barra según el desgaste
            let durabilityColor = '#28a745'; // verde
            if (durabilityPercent > 90) durabilityColor = '#dc3545'; // rojo
            else if (durabilityPercent > 70) durabilityColor = '#ffc107'; // naranja

            // Generamos el HTML para esta tarjeta de gear
            return `
              <div class="gear-card ${gear.retired ? 'retired' : ''}">
                ${gear.retired ? '<span class="retired-badge">RETIRADO</span>' : ''}
                <h4>${gear.name}</h4>
                <p class="gear-distance">${totalKm.toFixed(0)} km</p>
                <div class="durability-bar" title="${durabilityPercent.toFixed(0)}% de ${DURABILITY_GOAL_KM} km">
                    <div class="durability-progress" style="width: ${durabilityPercent}%; background-color: ${durabilityColor};"></div>
                </div>
                <small>${durabilityPercent.toFixed(0)}% de ${DURABILITY_GOAL_KM} km recorridos</small>
              </div>
            `;
        }).join('');

        container.innerHTML = gearHtml;

    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        container.innerHTML = '<p>Error loading gear details. Check the console.</p>';
    }
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