// js/gear.js

import { formatDistance, formatPace, formatTime } from './utils.js';
import { fetchGearById } from './api.js';

let gearChartInstance = null;
let gearGanttChartInstance = null;

export function renderGearTab(allActivities) {
    console.log("Initializing Gear Tab...");

    // const runs = allActivities.filter(a => a.type && a.type.includes('Run') && a.gear_id && a.gear_id.trim() !== '');
    const runs = allActivities.filter(a => a.type && a.gear_id && a.gear_id.trim() !== '');
    const gearTabContainer = document.getElementById('gear-tab');

    const gearInfoSection = document.getElementById('gear-info-section');
    const gearInfoList = document.getElementById('gear-info-list');
    const gearChartContainer = document.getElementById('gear-chart-container');
    const gearChartCanvas = document.getElementById('gearChart');
    const gearGanttChartContainer = document.getElementById('gear-gantt-chart-container');
    const gearGanttChartCanvas = document.getElementById('gear-gantt-chart');

    if (!gearInfoSection || !gearInfoList || !gearChartContainer || !gearChartCanvas || !gearGanttChartContainer || !gearGanttChartCanvas) {
        console.error("Missing expected HTML elements for Gear Tab. Please check your HTML structure for IDs: gear-info-section, gear-info-list, gear-chart-container, gearChart, gear-gantt-chart-container, gear-gantt-chart.");
        if (gearTabContainer) {
            gearTabContainer.innerHTML = `<p class="error-message">Error loading gear data: Essential HTML containers are missing. Please check the console for details.</p>`;
        }
        return;
    }

    if (runs.length === 0) {
        gearInfoList.innerHTML = '<p>No running data with associated gear available.</p>';
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (gearChartContainer) gearChartContainer.style.display = 'none';

        if (gearGanttChartInstance) { gearGanttChartInstance.destroy(); gearGanttChartInstance = null; }
        if (gearGanttChartContainer) gearGanttChartContainer.style.display = 'none';

        return;
    } else {
        if (gearChartContainer) gearChartContainer.style.display = '';
        if (gearGanttChartContainer) gearGanttChartContainer.style.display = '';
    }

    renderGearSection(runs);
    renderGearChart(runs);
    renderGearGanttChart(runs);
}

/**
 * Calcula métricas detalladas para cada equipo (zapatilla) a partir de las carreras.
 * @param {Array<Object>} runs - Array de objetos de actividad filtrados por tipo 'Run'.
 * @returns {Map<string, Object>} Un mapa donde la clave es el gear_id y el valor es un objeto con las métricas.
 */
function calculateGearMetrics(runs) {
    const gearMetrics = new Map();

    runs.forEach(run => {
        const gearId = run.gear_id;
        if (!gearId || gearId.trim() === '') return;

        if (!gearMetrics.has(gearId)) {
            gearMetrics.set(gearId, {
                numUses: 0,
                firstUse: new Date(run.start_date_local),
                lastUse: new Date(run.start_date_local),
                totalDistance: 0,
                totalMovingTime: 0,
                totalElevationGain: 0,
                runs: []
            });
        }

        const metrics = gearMetrics.get(gearId);
        metrics.numUses++;
        metrics.totalDistance += run.distance || 0;
        metrics.totalMovingTime += run.moving_time || 0;
        metrics.totalElevationGain += run.total_elevation_gain || 0;

        const runDate = new Date(run.start_date_local);
        if (runDate < metrics.firstUse) {
            metrics.firstUse = runDate;
        }
        if (runDate > metrics.lastUse) {
            metrics.lastUse = runDate;
        }
        metrics.runs.push(run);
    });

    // Calcular promedios y otras métricas finales
    gearMetrics.forEach((metrics, gearId) => {
        metrics.avgDistancePerUse = metrics.numUses > 0 ? (metrics.totalDistance / metrics.numUses) : 0;
        metrics.avgPace = metrics.totalMovingTime > 0 && metrics.totalDistance > 0 ?
            metrics.totalMovingTime / (metrics.totalDistance / 1000) : 0;
        metrics.avgElevationGainPerUse = metrics.numUses > 0 ? (metrics.totalElevationGain / metrics.numUses) : 0;
        metrics.numRuns = metrics.runs.length;
    });

    return gearMetrics;
}


// Función para renderizar la sección de información detallada del equipo
async function renderGearSection(runs) {
    const container = document.getElementById('gear-info-section');
    if (!container) return;

    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) {
        console.error("gear-info-list container not found for rendering section.");
        return;
    }

    const gearMetrics = calculateGearMetrics(runs);
    const gearIds = Array.from(gearMetrics.keys());

    if (gearIds.length === 0) {
        gearListContainer.innerHTML = '<p>No gear used in this period.</p>';
        return;
    }

    gearListContainer.innerHTML = '<p>Loading detailed gear info...</p>';

    try {
        const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
        const gearDetailsMap = new Map();

        results.forEach(result => {
            const gear = result.gear;
            if (gear) {
                if ('frame_type' in gear || 'weight' in gear) {
                    gear.type = 'bike';
                } else {
                    gear.type = 'shoe';
                }

                gearDetailsMap.set(gear.id, gear);
            }
        });

        console.log("Fetched gear details:", gearDetailsMap);


        const combinedGearData = Array.from(gearDetailsMap.values()).map(gear => {
            const metrics = gearMetrics.get(gear.id) || {};
            return {
                gear: {
                    ...gear,
                    distance: metrics.totalDistance || 0
                },
                metrics: metrics
            };
        });

        renderGearCards(combinedGearData, runs); // Se pasa 'runs' si fuera necesario para otras funciones internas
    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        gearListContainer.innerHTML = '<p>Error loading gear details. Check the console.</p>';
    }
}


// Función para renderizar las tarjetas de equipo
function renderGearCards(combinedGearData) {
    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) {
        console.error("gear-info-list container not found for rendering cards.");
        return;
    }

    let isEditMode = localStorage.getItem('gearEditMode') === 'true';

    // Valores predeterminados por tipo
    const defaultValues = {
        bike: { price: 1000, durationKm: 15000 },   // inventado
        shoe: { price: 120, durationKm: 700 },      // existente
        unknown: { price: 100, durationKm: 1000 }
    };

    combinedGearData.sort((a, b) => {
        const customDataA = JSON.parse(localStorage.getItem(`gear-custom-${a.gear.id}`) || '{}');
        const customDataB = JSON.parse(localStorage.getItem(`gear-custom-${b.gear.id}`) || '{}');

        const typeA = a.gear.type || 'unknown';
        const typeB = b.gear.type || 'unknown';

        const durationKmA = customDataA.durationKm ?? defaultValues[typeA].durationKm;
        const durationKmB = customDataB.durationKm ?? defaultValues[typeB].durationKm;

        const totalKmA = a.gear.distance / 1000;
        const totalKmB = b.gear.distance / 1000;

        const durabilityPercentA = (totalKmA / durationKmA) * 100;
        const durabilityPercentB = (totalKmB / durationKmB) * 100;

        const needsReplacementA = durabilityPercentA >= 100;
        const needsReplacementB = durabilityPercentB >= 100;

        if (needsReplacementA && !needsReplacementB) return -1;
        if (!needsReplacementA && needsReplacementB) return 1;
        if (a.gear.primary && !b.gear.primary) return -1;
        if (!a.gear.primary && b.gear.primary) return 1;

        return totalKmB - totalKmA;
    });

    const cardsHtml = combinedGearData.map(data => {
        const gear = data.gear;
        const metrics = data.metrics;

        const type = gear.type || 'unknown';
        const customData = JSON.parse(localStorage.getItem(`gear-custom-${gear.id}`) || '{}');

        const price = customData.price ?? defaultValues[type].price;
        const durationKm = customData.durationKm ?? defaultValues[type].durationKm;

        const totalKm = gear.distance / 1000;
        const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
        const euroPerKm = price > 0 && totalKm > 0 ? (price / totalKm).toFixed(2) : '-';
        const needsReplacement = durabilityPercent >= 100;

        const durabilityColor = durabilityPercent > 90 ? '#dc3545' : durabilityPercent > 75 ? '#ffc107' : '#28a745';

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
                <span><strong>Uses:</strong> ${metrics.numUses || 0}</span>
                <span><strong>€/km:</strong> ${euroPerKm}</span>
                <span><strong>Avg. Km/Use:</strong> ${formatDistance(metrics.avgDistancePerUse || 0, 1)}</span>
                <span><strong>Avg. Pace:</strong> ${metrics.avgPace > 0 ? formatPace(metrics.avgPace) : '-'}</span>
                <span><strong>Avg. Elev:</strong> ${metrics.avgElevationGainPerUse ? metrics.avgElevationGainPerUse.toFixed(0) + 'm' : '-'}</span>
                <span><strong>First Use:</strong> ${metrics.firstUse ? metrics.firstUse.toLocaleDateString() : 'N/A'}</span>
                <span><strong>Last Use:</strong> ${metrics.lastUse ? metrics.lastUse.toLocaleDateString() : 'N/A'}</span>
                <span><strong>Type:</strong> ${type}</span>
            </div>
            ${needsReplacement && !gear.retired ? '<div class="alert-danger">Replacement Needed!</div>' : ''}
            ${isEditMode ? editInputs : ''}
          </div>`;
    }).join('');

    const editButtonHtml = `<div class="edit-mode-toggle"><button id="toggle-gear-edit">${isEditMode ? '✅ Done Editing' : '✏️ Edit Gear'}</button></div>`;
    gearListContainer.innerHTML = editButtonHtml + `<div id="gear-cards-container">${cardsHtml}</div>`;

    document.getElementById('toggle-gear-edit').addEventListener('click', () => {
        isEditMode = !isEditMode;
        localStorage.setItem('gearEditMode', isEditMode);
        renderGearCards(combinedGearData);
    });

    if (isEditMode) {
        document.querySelectorAll('.save-gear-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gearId = btn.getAttribute('data-gearid');
                const price = parseFloat(document.getElementById(`price-${gearId}`).value);
                const durationKm = parseInt(document.getElementById(`duration-${gearId}`).value, 10);

                if (!isNaN(price) && !isNaN(durationKm) && price >= 0 && durationKm > 0) {
                    localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify({ price, durationKm }));
                    btn.textContent = '✅';
                    setTimeout(() => renderGearCards(combinedGearData), 500);
                } else {
                    alert('Please enter valid numbers for price (>=0) and lifespan (>0).');
                }
            });
        });
    }
}



// Función mejorada para renderizar el gráfico de uso de equipo (Gráfico de líneas)
async function renderGearChart(runs) {
    const canvas = document.getElementById('gearChart');
    const container = document.getElementById('gear-chart-container');
    if (!canvas) {
        console.error("Canvas element 'gearChart' not found for renderGearChart.");
        if (container) container.style.display = 'none';
        return;
    }

    // Si no hay runs, esconder y destruir gráfico previo
    if (!runs || runs.length === 0) {
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (container) container.style.display = 'none';
        return;
    } else if (container) {
        container.style.display = ''; // mostrar
    }

    // destruye gráfico previo
    if (gearChartInstance) {
        gearChartInstance.destroy();
        gearChartInstance = null;
    }

    // Helper: hex -> rgba
    const hexToRgba = (hex, alpha = 1) => {
        const h = hex.replace('#', '');
        const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Agrupar por fecha (YYYY-MM-DD) y gear
    const gearUsageByDate = new Map();
    for (const run of runs) {
        if (!run || !run.start_date_local || !run.gear_id) continue;
        const date = new Date(run.start_date_local);
        if (isNaN(date.getTime())) continue;
        const dateString = date.toISOString().split('T')[0];
        if (!gearUsageByDate.has(dateString)) gearUsageByDate.set(dateString, new Map());
        const daily = gearUsageByDate.get(dateString);
        const current = daily.get(run.gear_id) || 0;
        daily.set(run.gear_id, current + (run.distance || 0)); // meters
    }

    const allDates = Array.from(gearUsageByDate.keys()).sort();
    if (allDates.length === 0) {
        console.warn('No valid dated runs to render in gear chart.');
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (container) container.style.display = 'none';
        return;
    }

    // Gear ids únicos
    const uniqueGearIds = Array.from(new Set(runs.map(r => r.gear_id).filter(Boolean)));
    // Fetch names (silencioso en error)
    const gearIdToName = new Map();
    if (uniqueGearIds.length > 0) {
        try {
            const results = await Promise.all(uniqueGearIds.map(id => fetchGearById(id)));
            results.forEach(res => {
                const g = res?.gear;
                if (g) gearIdToName.set(g.id, g.name || [g.brand_name, g.model_name].filter(Boolean).join(' '));
            });
        } catch (err) {
            console.error('Error fetching gear names for GearChart:', err);
        }
    }

    // Construir datasets (km por fecha)
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
    const datasets = [];
    uniqueGearIds.forEach((gearId, idx) => {
        const color = colors[idx % colors.length];
        const data = allDates.map(dateStr => {
            const daily = gearUsageByDate.get(dateStr);
            const meters = daily && daily.has(gearId) ? daily.get(gearId) : 0;
            return +(meters / 1000).toFixed(3); // km, número
        });

        // Evita series completamente nulas (opcionales: las puedes mostrar igualmente)
        const hasNonZero = data.some(v => v > 0);
        if (!hasNonZero) {
            // Si quieres mostrar igualmente series vacías, deja pasar; ahora las salto para claridad
            return;
        }

        datasets.push({
            label: gearIdToName.get(gearId) || `Gear ID: ${gearId}`,
            data,
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.18),
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0
        });
    });

    if (datasets.length === 0) {
        console.warn('No datasets to render in gear chart (all series empty).');
        if (container) container.style.display = 'none';
        return;
    }

    // Usamos category en X para evitar necesidad de adapters de fechas
    gearChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: allDates, // 'YYYY-MM-DD'
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Distance per Gear Over Time' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (ctx) => {
                            const label = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
                            const y = ctx.parsed.y;
                            return y !== null && y !== undefined ? `${label}${Number(y).toFixed(2)} km` : label;
                        }
                    }
                }
            },
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                x: {
                    type: 'category',
                    title: { display: true, text: 'Date' },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true
                }
            }
        }
    });
}




export async function renderGearGanttChart(runs) {
    const ctx = document.getElementById('gear-gantt-chart');
    if (!ctx) {
        console.error("Canvas element 'gear-gantt-chart' not found for renderGearGanttChart.");
        return;
    }

    if (gearGanttChartInstance) {
        gearGanttChartInstance.destroy();
    }

    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    if (gearIds.length === 0) {
        return;
    }

    let gearIdToName = new Map(); // Usar Map en lugar de objeto para mayor flexibilidad con IDs
    try {
        const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
        results.forEach(result => {
            const gear = result.gear;
            if (gear) {
                gearIdToName.set(gear.id, gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' '));
            }
        });
    } catch (error) {
        console.error("Failed to fetch gear details for Gantt chart:", error);
        return;
    }

    const gearMonthKm = runs.reduce((acc, a) => {
        if (!a.gear_id || !a.start_date_local) return acc;
        const gearKey = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearKey] = (acc[month][gearKey] || 0) + a.distance / 1000;
        return acc;
    }, {});

    const monthsWithData = Object.keys(gearMonthKm);
    if (monthsWithData.length === 0) {
        // console.log("No monthly gear usage data available for Gantt chart.");
        return;
    }
    const firstMonth = monthsWithData.reduce((min, m) => m < min ? m : min);
    const lastMonth = monthsWithData.reduce((max, m) => m > max ? m : max);

    function getMonthRange(start, end) {
        const result = [];
        let [sy, sm] = start.split('-').map(Number);
        let [ey, em] = end.split('-').map(Number);
        while (sy < ey || (sy === ey && sm <= em)) {
            result.push(`${sy.toString().padStart(4, '0')}-${sm.toString().padStart(2, '0')}`);
            sm++;
            if (sm > 12) {
                sm = 1;
                sy++;
            }
        }
        return result;
    }
    const allMonths = getMonthRange(firstMonth, lastMonth);

    const allGears = Array.from(gearIdToName.keys()); // Usar las keys del Map para los gears existentes

    const datasets = allGears.map((gearId, idx) => ({
        label: gearIdToName.get(gearId) || `Gear ID: ${gearId}`,
        data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
        backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 60%)`,
        stack: 'stack1'
    }));

    gearGanttChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: allMonths, datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Distance per Gear per Month'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.x !== null) {
                                label += context.parsed.x.toFixed(2) + ' km';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Year-Month' },
                    grid: {
                        offset: true
                    }
                }
            }
        }
    });
}