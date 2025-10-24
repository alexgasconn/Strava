// js/gear.js

import { formatDistance, formatPace, formatTime } from './utils.js'; // Asegúrate de que formatPace y formatTime estén en utils.js
import { fetchGearById } from './api.js';

let gearChartInstance = null; // Para la instancia de Chart.js (gráfico de líneas)
let gearGanttChartInstance = null; // Para la instancia del nuevo gráfico de Gantt (gráfico de barras)

export function renderGearTab(allActivities) {
    console.log("Initializing Gear Tab...");

    // Filtramos solo las actividades de tipo 'Run' y aquellas que tienen un 'gear_id' válido.
    const runs = allActivities.filter(a => a.type && a.type.includes('Run') && a.gear_id && a.gear_id.trim() !== '');
    const gearTabContainer = document.getElementById('gear-tab');

    const gearInfoSection = document.getElementById('gear-info-section');
    const gearInfoList = document.getElementById('gear-info-list');
    const gearChartContainer = document.getElementById('gear-chart-container');
    const gearChartCanvas = document.getElementById('gearChart');
    const gearGanttChartContainer = document.getElementById('gear-gantt-chart-container');
    const gearGanttChartCanvas = document.getElementById('gear-gantt-chart');

    // Verifica que todos los contenedores necesarios existan en el HTML
    if (!gearInfoSection || !gearInfoList || !gearChartContainer || !gearChartCanvas || !gearGanttChartContainer || !gearGanttChartCanvas) {
        console.error("Missing expected HTML elements for Gear Tab. Please check your HTML structure for IDs: gear-info-section, gear-info-list, gear-chart-container, gearChart, gear-gantt-chart-container, gear-gantt-chart.");
        if (gearTabContainer) {
            gearTabContainer.innerHTML = `<p class="error-message">Error loading gear data: Essential HTML containers are missing. Please check the console for details.</p>`;
        }
        return;
    }

    // Si no hay carreras o no hay carreras con gear_id válido, limpiar y mostrar mensaje
    if (runs.length === 0) {
        gearInfoList.innerHTML = '<p>No running data with associated gear available.</p>';
        // Destruir instancias de gráficos y ocultar sus contenedores
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (gearChartContainer) gearChartContainer.style.display = 'none';

        if (gearGanttChartInstance) { gearGanttChartInstance.destroy(); gearGanttChartInstance = null; }
        if (gearGanttChartContainer) gearGanttChartContainer.style.display = 'none';

        return;
    } else {
        // Asegurarse de que los contenedores de los gráficos estén visibles si hay datos
        if (gearChartContainer) gearChartContainer.style.display = '';
        if (gearGanttChartContainer) gearGanttChartContainer.style.display = '';
    }

    // Renderizar ambas secciones y ambos gráficos
    renderGearSection(runs);
    renderGearChart(runs); // Renderiza el gráfico de líneas
    renderGearGanttChart(runs); // Renderiza el gráfico de barras (Gantt)
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
        if (!gearId || gearId.trim() === '') return; // Ya filtrado, pero por seguridad

        if (!gearMetrics.has(gearId)) {
            gearMetrics.set(gearId, {
                numUses: 0,
                firstUse: new Date(run.start_date_local),
                lastUse: new Date(run.start_date_local),
                totalDistance: 0, // en metros
                totalMovingTime: 0, // en segundos
                totalElevationGain: 0, // en metros
                runs: [] // Para guardar todas las carreras asociadas a este equipo
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
        metrics.runs.push(run); // Añadimos la carrera completa para análisis futuro si es necesario
    });

    // Calcular promedios y otras métricas finales
    gearMetrics.forEach((metrics, gearId) => {
        metrics.avgDistancePerUse = metrics.numUses > 0 ? (metrics.totalDistance / metrics.numUses) : 0;
        metrics.avgPace = metrics.totalMovingTime > 0 && metrics.totalDistance > 0 ?
            metrics.totalMovingTime / (metrics.totalDistance / 1000) : 0; // segundos por km
        metrics.avgElevationGainPerUse = metrics.numUses > 0 ? (metrics.totalElevationGain / metrics.numUses) : 0;
        metrics.numRuns = metrics.runs.length; // Es lo mismo que numUses, pero para claridad
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
                gearDetailsMap.set(gear.id, gear);
            }
        });

        const combinedGearData = Array.from(gearDetailsMap.values()).map(gear => {
            const metrics = gearMetrics.get(gear.id) || {};
            return {
                gear: {
                    ...gear,
                    distance: metrics.totalDistance || 0 // Usamos la distancia total calculada
                },
                metrics: metrics // Pasamos todas las métricas calculadas
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

    combinedGearData.sort((a, b) => {
        const customDataA = JSON.parse(localStorage.getItem(`gear-custom-${a.gear.id}`) || '{}');
        const customDataB = JSON.parse(localStorage.getItem(`gear-custom-${b.gear.id}`) || '{}');
        const durationKmA = customDataA.durationKm ?? 700;
        const durationKmB = customDataB.durationKm ?? 700;
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

        return totalKmB - totalKmA; // Mayor distancia primero por defecto
    });

    const cardsHtml = combinedGearData.map(data => {
        const gear = data.gear;
        const metrics = data.metrics; // Obtenemos las métricas calculadas

        const customData = JSON.parse(localStorage.getItem(`gear-custom-${gear.id}`) || '{}');
        const price = customData.price ?? 120;
        const durationKm = customData.durationKm ?? 700;
        const totalKm = gear.distance / 1000; // gear.distance ya está en metros, convertimos a km

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
            <p class="gear-distance"><strong>Total:</strong> ${totalKm.toFixed(0)} km</p>
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
        renderGearCards(combinedGearData); // Recargamos las tarjetas con el nuevo modo
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
                    setTimeout(() => renderGearCards(combinedGearData), 500); // Recargar para ver los cambios y el botón
                } else {
                    alert('Please enter valid numbers for price (>=0) and lifespan (>0).');
                }
            });
        });
    }
}


// Función para renderizar el gráfico de uso de equipo (Gráfico de líneas)
async function renderGearChart(runs) {
    const ctx = document.getElementById('gearChart');
    if (!ctx) {
        console.error("Canvas element 'gearChart' not found for renderGearChart.");
        return;
    }

    if (gearChartInstance) {
        gearChartInstance.destroy();
    }

    const gearUsageByDate = new Map();

    for (const run of runs) {
        if (run.gear_id && run.start_date_local) {
            const date = new Date(run.start_date_local);
            const dateString = date.toISOString().split('T')[0];

            if (!gearUsageByDate.has(dateString)) {
                gearUsageByDate.set(dateString, new Map());
            }
            const dailyGear = gearUsageByDate.get(dateString);
            const currentDistance = dailyGear.get(run.gear_id) || 0;
            dailyGear.set(run.gear_id, currentDistance + (run.distance || 0));
        }
    }

    const allDates = Array.from(gearUsageByDate.keys()).sort();

    const uniqueGearIds = new Set();
    runs.forEach(run => {
        if (run.gear_id) uniqueGearIds.add(run.gear_id);
    });

    const gearIdToName = new Map();
    if (uniqueGearIds.size > 0) {
        try {
            const results = await Promise.all(Array.from(uniqueGearIds).map(id => fetchGearById(id)));
            results.forEach(result => {
                const gear = result.gear;
                if (gear) {
                    gearIdToName.set(gear.id, gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' '));
                }
            });
        } catch (error) {
            console.error("Error fetching gear names for GearChart:", error);
        }
    }


    const datasets = [];
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
    let colorIndex = 0;

    uniqueGearIds.forEach(gearId => {
        const data = allDates.map(dateString => {
            const dailyGear = gearUsageByDate.get(dateString);
            return dailyGear && dailyGear.has(gearId) ? dailyGear.get(gearId) / 1000 : 0;
        });

        datasets.push({
            label: gearIdToName.get(gearId) || `Gear ID: ${gearId}`,
            data: data,
            borderColor: colors[colorIndex % colors.length],
            backgroundColor: colors[colorIndex % colors.length] + '40',
            fill: true,
            tension: 0.3
        });
        colorIndex++;
    });

    gearChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Distance per Gear Over Time'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(2) + ' km';
                            }
                            return label;
                        }
                    }
                },
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'month',
                        tooltipFormat: 'MMM DD, YYYY',
                        displayFormats: {
                            month: 'MMM YYYY'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Distance (km)'
                    }
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
        // En lugar de innerHTML en canvas, podemos dejarlo vacío o poner un mensaje en el contenedor padre
        // console.log("No gear data for Gantt chart. Canvas will be empty.");
        // Si quieres un mensaje, el contenedor padre del canvas debería mostrarlo
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
                        label: function(context) {
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