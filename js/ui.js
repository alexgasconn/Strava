// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';

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
    athleteName.textContent = `Running Dashboard`;

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
export function renderDashboard(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    renderSummaryCards(runs);
    renderAllCharts(runs);
    renderStreaks(runs);
}




// function renderSummaryCards(runs) {
//     const summaryContainer = document.getElementById('summary-cards');
//     if (summaryContainer) {
//         summaryContainer.innerHTML = `
//             <div class="card"><h3>Activities</h3><p>${runs.length}</p></div>
//             <div class="card"><h3>Total Distance</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
//             <div class="card"><h3>Total Time</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
//             <div class="card"><h3>Total Elevation</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
//         `;
//     }
// }

function renderAllCharts(runs) {
    charts.renderActivityTypeChart(runs);
    charts.renderMonthlyDistanceChart(runs);
    charts.renderPaceVsDistanceChart(runs);
    charts.renderDistanceHistogram(runs);
    charts.renderVo2maxChart(runs);
    charts.renderFitnessChart(runs);
    charts.renderGearGanttChart(runs);
    charts.renderAccumulatedDistanceChart(runs);
    charts.renderRollingMeanDistanceChart(runs);
    charts.renderDistanceVsElevationChart(runs);
    charts.renderElevationHistogram(runs);
    charts.renderRunsHeatmap(runs);
    charts.renderConsistencyChart(runs);
}


































// function renderStreaks(runs) {
//     const streaksInfo = document.getElementById('streaks-info');
//     if (!streaksInfo) return;

//     const yesterday = new Date();
//     yesterday.setDate(yesterday.getDate() - 1);

//     // --- UTILIDADES ---
//     function formatDate(dateStr) {
//         if (!dateStr) return '-';
//         const [y, m, d] = dateStr.split('-');
//         if (d) return `${d}/${m}/${y}`;
//         if (m) return `${m}/${y}`;
//         return dateStr;
//     }

//     function formatWeek(weekStr) {
//         if (!weekStr) return '-';
//         const [y, w] = weekStr.split('-W');
//         return `W${w}/${y}`;
//     }

//     function getISOWeek(d) {
//         const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
//         const dayNum = date.getUTCDay() || 7; // lunes = 1, domingo = 7
//         date.setUTCDate(date.getUTCDate() + 4 - dayNum);
//         const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
//         return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
//     }

//     function calcStreaks(items, type) {
//         // items = array de strings: YYYY-MM-DD, YYYY-W## o YYYY-MM
//         const sorted = Array.from(new Set(items)).sort();
//         let maxStreak = 0, currentStreak = 0, prev = null;
//         let maxStart = null, maxEnd = null;
//         let tempStart = null;

//         for (let i = 0; i < sorted.length; i++) {
//             const item = sorted[i];
//             if (!prev) {
//                 currentStreak = 1;
//                 tempStart = item;
//             } else {
//                 let diff = 0;
//                 if (type === 'day') {
//                     diff = (new Date(item) - new Date(prev)) / 86400000;
//                 } else if (type === 'week') {
//                     const [y1, w1] = prev.split('-W').map(Number);
//                     const [y2, w2] = item.split('-W').map(Number);
//                     diff = (y2 - y1) * 52 + (w2 - w1); // simplificación: años con 52 semanas
//                 } else if (type === 'month') {
//                     const [y1, m1] = prev.split('-').map(Number);
//                     const [y2, m2] = item.split('-').map(Number);
//                     diff = (y2 - y1) * 12 + (m2 - m1);
//                 }

//                 if (diff === 1) {
//                     currentStreak++;
//                 } else {
//                     currentStreak = 1;
//                     tempStart = item;
//                 }
//             }

//             if (currentStreak > maxStreak) {
//                 maxStreak = currentStreak;
//                 maxStart = tempStart;
//                 maxEnd = item;
//             }
//             prev = item;
//         }

//         return { sorted, maxStreak, maxStart, maxEnd };
//     }

//     function calcCurrentStreak(sorted, type) {
//         let value = 0, start = null, end = null;
//         let idx = sorted.length - 1;
//         let temp;
//         if (type === 'day') temp = yesterday.toISOString().slice(0, 10);
//         else if (type === 'week') temp = `${yesterday.getFullYear()}-W${String(getISOWeek(yesterday)).padStart(2, '0')}`;
//         else if (type === 'month') {
//             temp = yesterday.toISOString().slice(0, 7);
//         }

//         while (idx >= 0) {
//             let item = sorted[idx];
//             let match = false;
//             if (type === 'day' && item === temp) match = true;
//             else if (type === 'week' && item === temp) match = true;
//             else if (type === 'month' && item === temp) match = true;

//             if (match) {
//                 if (value === 0) end = temp;
//                 value++;
//                 start = temp;

//                 // retrocede
//                 if (type === 'day') {
//                     temp = new Date(new Date(temp).getTime() - 86400000).toISOString().slice(0, 10);
//                 } else if (type === 'week') {
//                     let [y, w] = temp.split('-W').map(Number);
//                     if (w === 1) {
//                         y -= 1;
//                         w = getISOWeek(new Date(y, 11, 28)); // última semana del año anterior
//                     } else w -= 1;
//                     temp = `${y}-W${String(w).padStart(2, '0')}`;
//                 } else if (type === 'month') {
//                     let [y, m] = temp.split('-').map(Number);
//                     if (m === 1) {
//                         y -= 1;
//                         m = 12;
//                     } else m -= 1;
//                     temp = `${y}-${String(m).padStart(2, '0')}`;
//                 }

//                 idx--;
//             } else break;
//         }

//         return { value, start, end };
//     }

//     // --- CALCULO DE RACHAS ---
//     // Días
//     const dayItems = runs.map(r => r.start_date_local.substring(0, 10));
//     const dayStreaks = calcStreaks(dayItems, 'day');
//     const currentDay = calcCurrentStreak(dayStreaks.sorted, 'day');

//     // Semanas (lunes)
//     const weekItems = runs.map(r => {
//         const d = new Date(r.start_date_local);
//         const year = d.getFullYear();
//         const week = getISOWeek(d);
//         return `${year}-W${String(week).padStart(2, '0')}`;
//     });
//     const weekStreaks = calcStreaks(weekItems, 'week');
//     const currentWeek = calcCurrentStreak(weekStreaks.sorted, 'week');

//     // Meses
//     const monthItems = runs.map(r => r.start_date_local.substring(0, 7));
//     const monthStreaks = calcStreaks(monthItems, 'month');
//     const currentMonth = calcCurrentStreak(monthStreaks.sorted, 'month');

//     // --- RENDER ---
//     streaksInfo.innerHTML = `
//       <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
//         <div>
//           <h4>🏆 Best Historical Streak</h4>
//           <div><b>Consecutive Days:</b> ${dayStreaks.maxStreak} <br>
//             <small>${formatDate(dayStreaks.maxStart)} - ${formatDate(dayStreaks.maxEnd)}</small>
//           </div>
//           <div><b>Consecutive Weeks:</b> ${weekStreaks.maxStreak} <br>
//             <small>${formatWeek(weekStreaks.maxStart)} - ${formatWeek(weekStreaks.maxEnd)}</small>
//           </div>
//           <div><b>Consecutive Months:</b> ${monthStreaks.maxStreak} <br>
//             <small>${formatDate(monthStreaks.maxStart)} - ${formatDate(monthStreaks.maxEnd)}</small>
//           </div>
//         </div>
//         <div>
//           <h4>🔥 Current Streak</h4>
//           <div><b>Consecutive Days:</b> ${currentDay.value} <br>
//             <small>${formatDate(currentDay.start)} - ${formatDate(currentDay.end)}</small>
//           </div>
//           <div><b>Consecutive Weeks:</b> ${currentWeek.value} <br>
//             <small>${formatWeek(currentWeek.start)} - ${formatWeek(currentWeek.end)}</small>
//           </div>
//           <div><b>Consecutive Months:</b> ${currentMonth.value} <br>
//             <small>${formatDate(currentMonth.start)} - ${formatDate(currentMonth.end)}</small>
//           </div>
//         </div>
//       </div>
//     `;
// }



async function renderGearSection(runs) {
    const container = document.getElementById('gear-info-section');
    if (!container) return;
    const gearListContainer = document.getElementById('gear-info-list');
    const gearUsage = new Map();
    runs.forEach(run => {
        if (run.gear_id) {
            if (!gearUsage.has(run.gear_id)) {
                gearUsage.set(run.gear_id, { numUses: 0, lastUse: run.start_date_local });
            }
            gearUsage.get(run.gear_id).numUses++;
        }
    });
    const gearIds = Array.from(gearUsage.keys());
    if (gearIds.length === 0) {
        gearListContainer.innerHTML = '<p>No gear used in this period.</p>';
        return;
    }
    gearListContainer.innerHTML = '<p>Loading detailed gear info...</p>';
    try {
        const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
        const gearIdToName = {};
        results.forEach(result => {
            const gear = result.gear;
            gearIdToName[gear.id] = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ');
        });
        renderGearCards(results, gearUsage, runs);
    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        gearListContainer.innerHTML = '<p>Error loading gear details. Check the console.</p>';
    }
}







function renderGearCards(apiResults, usageData, allRuns) {
    const gearListContainer = document.getElementById('gear-info-list');
    let isEditMode = localStorage.getItem('gearEditMode') === 'true';
    const cardsHtml = apiResults.map(result => {
        const gear = result.gear;
        const usage = usageData.get(gear.id) || { numUses: 0, lastUse: 'N/A' };
        const customData = JSON.parse(localStorage.getItem(`gear-custom-${gear.id}`) || '{}');
        const price = customData.price ?? 120;
        const durationKm = customData.durationKm ?? 700;
        const totalKm = gear.distance / 1000;
        const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
        const euroPerKm = price > 0 && totalKm > 0 ? (price / totalKm).toFixed(2) : '-';
        const needsReplacement = durabilityPercent >= 100;
        let durabilityColor = durabilityPercent > 90 ? '#dc3545' : durabilityPercent > 75 ? '#ffc107' : '#28a745';
        const editInputs = `
            <div class="gear-edit-fields">
                <div><label for="price-${gear.id}">Price (€):</label><input type="number" value="${price}" id="price-${gear.id}"></div>
                <div><label for="duration-${gear.id}">Lifespan (km):</label><input type="number" value="${durationKm}" id="duration-${gear.id}"></div>
                <button class="save-gear-btn" data-gearid="${gear.id}">💾 Save</button>
            </div>`;
        return `
          <div class="gear-card ${gear.retired ? 'retired' : ''} ${gear.primary ? 'primary' : ''}">
            ${gear.retired ? '<span class="badge retired-badge">RETIRED</span>' : ''}
            ${gear.primary ? '<span class="badge primary-badge">PRIMARY</span>' : ''}
            <h4>${gear.name || `${gear.brand_name} ${gear.model_name}`}</h4>
            <p class="gear-distance">${totalKm.toFixed(0)} km</p>
            <div class="durability-bar" title="${durabilityPercent.toFixed(0)}% of ${durationKm} km">
                <div class="durability-progress" style="width: ${durabilityPercent}%; background-color: ${durabilityColor};"></div>
            </div>
            <small>${durabilityPercent.toFixed(0)}% of ${durationKm} km</small>
            <div class="gear-stats">
                <span><strong>Uses:</strong> ${usage.numUses}</span>
                <span><strong>€/km:</strong> ${euroPerKm}</span>
                <span><strong>Last Use:</strong> ${new Date(usage.lastUse).toLocaleDateString()}</span>
            </div>
            ${needsReplacement && !gear.retired ? '<div class="alert-danger">Replacement Needed!</div>' : ''}
            ${isEditMode ? editInputs : ''}
          </div>`;
    }).join('');
    const editButtonHtml = `<div class="edit-mode-toggle"><button id="toggle-gear-edit">${isEditMode ? '✅ Done Editing' : '✏️ Edit Gear'}</button></div>`;
    gearListContainer.innerHTML = editButtonHtml + `<div id="gear-cards-container">${cardsHtml}</div>`;
    document.getElementById('toggle-gear-edit').addEventListener('click', () => {
        localStorage.setItem('gearEditMode', !isEditMode);
        renderGearCards(apiResults, usageData, allRuns);
    });
    if (isEditMode) {
        document.querySelectorAll('.save-gear-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gearId = btn.getAttribute('data-gearid');
                const price = parseFloat(document.getElementById(`price-${gearId}`).value);
                const durationKm = parseInt(document.getElementById(`duration-${gearId}`).value, 10);
                if (!isNaN(price) && !isNaN(durationKm)) {
                    localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify({ price, durationKm }));
                    btn.textContent = '✅';
                    setTimeout(() => renderGearCards(apiResults, usageData, allRuns), 500);
                } else {
                    alert('Please enter valid numbers for price and duration.');
                }
            });
        });
    }
}


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


export function renderAthleteProfile(athlete) {
    const container = document.getElementById('athlete-profile-card');
    if (!container) return;
    const contentDiv = container.querySelector('.profile-content');
    if (!contentDiv) return;

    contentDiv.innerHTML = `
        <img src="${athlete.profile_medium}" alt="Athlete profile picture">
        <div class="profile-details">
            <span class="name">${athlete.firstname} ${athlete.lastname}</span>
            <span class="location">${athlete.city || ''}, ${athlete.country || ''}</span>
            <span class="stats">Followers: ${athlete.follower_count} | Friends: ${athlete.friend_count}</span>
        </div>
    `;
}

export function renderTrainingZones(zones) {
    const container = document.getElementById('training-zones-card');
    if (!container) return;
    const contentDiv = container.querySelector('.zones-content');
    if (!contentDiv) return;

    let html = '';

    // Renderizar Zonas de Frecuencia Cardíaca (Versión Robusta)
    if (zones.heart_rate && zones.heart_rate.zones && zones.heart_rate.custom_zones) {
        const hrZones = zones.heart_rate.zones;

        // La API a veces devuelve la primera zona con min y max 0, la filtramos.
        // También nos aseguramos de que haya zonas válidas.
        const validZones = hrZones.filter(z => typeof z.min !== 'undefined' && typeof z.max !== 'undefined' && z.max > 0);

        if (validZones.length > 0) {
            // Calculamos el ancho total de las zonas para la proporcionalidad
            const totalRange = validZones[validZones.length - 1].max - validZones[0].min;

            // Generamos dinámicamente cada segmento de la barra
            const zonesHtml = validZones.map((zone, index) => {
                const zoneWidth = ((zone.max - zone.min) / totalRange) * 100;
                const zoneNumber = index + 1;
                // Si es la última zona, el texto es "min+"
                const zoneText = (index === validZones.length - 1) ? `${zone.min}+` : zone.max;

                return `<div class="zone-segment hr-z${zoneNumber}" style="flex-basis: ${zoneWidth}%;" title="Z${zoneNumber}: ${zone.min}-${zone.max}">${zoneText}</div>`;
            }).join('');

            html += `
                <div class="zone-group">
                    <h4>Heart Rate Zones (bpm)</h4>
                    <div class="zone-bar">
                        ${zonesHtml}
                    </div>
                </div>`;
        }
    }

    // Renderizar Zonas de Potencia (sin cambios, ya era robusto)
    if (zones.power && zones.power.zones && zones.power.zones.length > 0) {
        // Buscamos el FTP, que es el inicio de la Zona 4 (o la última zona si hay menos)
        const ftpZone = zones.power.zones.find(z => z.name === 'Z4') || zones.power.zones[zones.power.zones.length - 1];
        if (ftpZone) {
            html += `
                <div class="zone-group">
                    <h4>Functional Threshold Power (FTP)</h4>
                    <p style="font-size: 1.5rem; font-weight: bold; color: var(--text-dark); margin: 0;">${ftpZone.min} W</p>
                </div>`;
        }
    }

    contentDiv.innerHTML = html || '<p>No custom training zones configured in your Strava profile.</p>';
}