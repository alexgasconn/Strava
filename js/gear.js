// js/gear.js (COMPLETO Y FINALIZADO)

import { formatDistance } from './utils.js';
import { fetchGearById } from './api.js';
import {
    calculateEffectiveDistance,
    analyzeUsagePattern,
    forecastReplacement,
    calculateUrgency,
    calculateTotalEffectiveDistance,
    initializeShoeProfile,
    getShoeStatus,
    ESF_MULTIPLIERS, // Exporta estos si los necesitas para la UI o debug
    PIF_MULTIPLIERS,
    SIF_MULTIPLIERS
} from './shoeReplacement.js'; // Importa todas las funciones nuevas

let gearChartInstance = null;
let gearGanttChartInstance = null;

export function renderGearTab(allActivities) {
    console.log("Initializing Gear Tab...");

    // Filtramos solo las actividades de tipo 'Run' y que tengan gear_id
    // allActivities contiene actividades de todo tipo, runs serán filtradas por tipo 'Run'
    const runs = allActivities.filter(a => a.type && a.type.includes('Run') && a.gear_id);

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
        gearInfoList.innerHTML = '<p>No running data available to show gear usage.</p>';
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (gearChartContainer) gearChartContainer.style.display = 'none';
        if (gearGanttChartInstance) { gearGanttChartInstance.destroy(); gearGanttChartInstance = null; }
        if (gearGanttChartContainer) gearGanttChartContainer.style.display = 'none';
        return;
    } else {
        if (gearChartContainer) gearChartContainer.style.display = '';
        if (gearGanttChartContainer) gearGanttChartContainer.style.display = '';
    }

    // Pasamos allActivities al renderGearSection para que pueda filtrar las carreras por zapatilla
    // y usar el contexto completo para el forecast si es necesario
    renderGearSection(runs, allActivities);
    renderGearChart(runs, allActivities); // Pasa también allActivities
    renderGearGanttChart(runs);
}


async function renderGearSection(runs, allActivities) { // Ahora recibe allActivities
    const container = document.getElementById('gear-info-section');
    if (!container) return;

    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) {
        console.error("gear-info-list container not found for rendering section.");
        return;
    }

    const gearUsage = new Map();
    const gearRunSessions = new Map(); // Para almacenar las RunSession ya procesadas por zapatilla

    runs.forEach(run => {
        if (run.gear_id && typeof run.gear_id === 'string' && run.gear_id.trim() !== '') {
            if (!gearUsage.has(run.gear_id)) {
                gearUsage.set(run.gear_id, { numUses: 0, lastUse: run.start_date_local, totalDistance: 0 });
                gearRunSessions.set(run.gear_id, []);
            }
            const currentUsage = gearUsage.get(run.gear_id);
            currentUsage.numUses++;
            currentUsage.totalDistance += run.distance || 0; // Strava distance is in meters
            if (new Date(run.start_date_local) > new Date(currentUsage.lastUse)) {
                currentUsage.lastUse = run.start_date_local;
            }
            // Agrega la actividad bruta aquí, luego se procesará en initializeShoeProfile
            gearRunSessions.get(run.gear_id).push(run);
        } else {
            console.warn("Activity has an invalid gear_id:", run.gear_id, "for activity:", run.name);
        }
    });

    const gearIds = Array.from(gearUsage.keys());

    if (gearIds.length === 0) {
        gearListContainer.innerHTML = '<p>No gear used in this period.</p>';
        return;
    }

    gearListContainer.innerHTML = '<p>Loading detailed gear info and calculating forecasts...</p>';

    try {
        const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
        const gearDetailsMap = new Map();
        results.forEach(result => {
            const gear = result.gear;
            if (gear) {
                gearDetailsMap.set(gear.id, gear);
            }
        });

        // =========================================================
        // APLICA LA LÓGICA DE PRONÓSTICO A CADA ZAPATILLA AQUÍ
        // =========================================================
        const forecastCombinedGearData = Array.from(gearDetailsMap.values()).map(stravaGear => {
            // Filtrar las actividades de la zapatilla actual del array completo de actividades
            const initialRunsForShoe = allActivities.filter(a => a.type && a.type.includes('Run') && a.gear_id === stravaGear.id);

            // initializeShoeProfile retorna un objeto con { shoe, runsWithEffectiveDistance }
            const { shoe, runsWithEffectiveDistance } = initializeShoeProfile(stravaGear, initialRunsForShoe);

            // analyzeUsagePattern ahora recibe las runs ya procesadas con effectiveDistance
            const usagePattern = analyzeUsagePattern(shoe, runsWithEffectiveDistance);

            // forecastReplacement también recibe las runs ya procesadas
            const forecast = forecastReplacement(shoe, usagePattern, runsWithEffectiveDistance);
            shoe.forecastedReplacement = forecast?.forecastDate || null;
            shoe.replacementUrgency = calculateUrgency(shoe, forecast);
            shoe.status = getShoeStatus(shoe);
            shoe.costPerKm = shoe.purchasePrice > 0 && shoe.totalDistance > 0 ? (shoe.purchasePrice / shoe.totalDistance).toFixed(2) : '-';


            return {
                gear: shoe, // Esto ahora es nuestro objeto 'Shoe' extendido
                usage: usagePattern,
                forecast: forecast,
                runsWithEffectiveDistance: runsWithEffectiveDistance // Para gráficos y análisis detallados
            };
        });

        renderGearCards(forecastCombinedGearData, allActivities); // Pasa allActivities
    } catch (error) {
        console.error("Failed to fetch gear details or calculate forecast:", error);
        gearListContainer.innerHTML = '<p>Error loading gear details or calculating forecast. Check the console.</p>';
    }
}


function renderGearCards(combinedGearData, allActivities) { // allActivities sigue siendo necesaria para el refresh
    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) {
        console.error("gear-info-list container not found for rendering cards.");
        return;
    }

    let isEditMode = localStorage.getItem('gearEditMode') === 'true';

    combinedGearData.sort((a, b) => {
        // Prioridad: Crítico > Alto > Medio > Bajo
        const urgencyOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'healthy': 4, 'retired': 5 };
        const urgencyA = urgencyOrder[a.gear.replacementUrgency] !== undefined ? urgencyOrder[a.gear.replacementUrgency] : 99;
        const urgencyB = urgencyOrder[b.gear.replacementUrgency] !== undefined ? urgencyOrder[b.gear.replacementUrgency] : 99;

        if (a.gear.retired && !b.gear.retired) return 1; // Las retiradas van al final
        if (!a.gear.retired && b.gear.retired) return -1;

        if (urgencyA !== urgencyB) return urgencyA - urgencyB;

        // Luego por primary
        if (a.gear.primary && !b.gear.primary) return -1;
        if (!a.gear.primary && b.gear.primary) return 1;

        // Finalmente por % de vida útil si tienen la misma urgencia y no están retiradas
        const lifespanPercentA = (a.gear.effectiveKilometers / (a.gear.customLifespanKm || 1050)) * 100;
        const lifespanPercentB = (b.gear.effectiveKilometers / (b.gear.customLifespanKm || 1050)) * 100;
        return lifespanPercentB - lifespanPercentA;
    });

    const cardsHtml = combinedGearData.map(data => {
        const shoe = data.gear; // Ahora 'shoe' es nuestro objeto Shoe con los datos calculados
        const usage = data.usage; // usagePattern

        const price = shoe.purchasePrice; // Ya está en el objeto shoe
        const durationKm = shoe.customLifespanKm; // Ya está en el objeto shoe

        const totalKm = shoe.totalDistance / 1000; // Total KM desde Strava (metros a KM)
        const effectiveKm = shoe.effectiveKilometers; // KM efectivos calculados

        const durabilityPercent = Math.min((effectiveKm / durationKm) * 100, 100);
        const euroPerKm = price > 0 && totalKm > 0 ? (price / totalKm).toFixed(2) : '-';

        let durabilityColor;
        let urgencyClass;
        let statusText = '';
        switch (shoe.status) {
            case 'critical': durabilityColor = '#dc3545'; urgencyClass = 'alert-critical'; statusText = 'Critical (Replace Soon!)'; break;
            case 'warning': durabilityColor = '#ffc107'; urgencyClass = 'alert-high'; statusText = 'Warning (Nearing End)'; break;
            case 'healthy': durabilityColor = '#28a745'; urgencyClass = 'alert-low'; statusText = 'Healthy'; break;
            case 'retired': durabilityColor = '#6c757d'; urgencyClass = ''; statusText = 'Retired'; break; // Gris para retiradas
            default: durabilityColor = '#6c757d'; urgencyClass = ''; statusText = 'Unknown'; break;
        }

        const editInputs = `
            <div class="gear-edit-fields">
                <div><label for="price-${shoe.id}">Price (€):</label><input type="number" value="${price}" id="price-${shoe.id}" min="0" step="0.01"></div>
                <div><label for="duration-${shoe.id}">Lifespan (km):</label><input type="number" value="${durationKm}" id="duration-${shoe.id}" min="1"></div>
                <button class="save-gear-btn" data-gearid="${shoe.id}">💾 Save</button>
            </div>`;

        return `
          <div class="gear-card ${shoe.retired ? 'retired' : ''} ${shoe.primary ? 'primary' : ''} status-${shoe.status}">
            ${shoe.retired ? '<span class="badge retired-badge">RETIRED</span>' : ''}
            ${shoe.primary ? '<span class="badge primary-badge">PRIMARY</span>' : ''}
            <h4>${shoe.name}</h4>
            <p class="gear-distance">Actual: ${totalKm.toFixed(0)} km / Effective: ${effectiveKm.toFixed(0)} km</p>
            <div class="durability-bar" title="${durabilityPercent.toFixed(0)}% of ${durationKm} effective km">
                <div class="durability-progress" style="width: ${durabilityPercent}%; background-color: ${durabilityColor};"></div>
            </div>
            <small>${durabilityPercent.toFixed(0)}% of ${durationKm} effective km</small>
            <div class="gear-stats">
                <span><strong>Status:</strong> ${statusText}</span>
                <span><strong>Uses:</strong> ${usage.totalUses}</span>
                <span><strong>€/km:</strong> ${euroPerKm}</span>
                <span><strong>Last Use:</strong> ${usage.lastUseDate ? usage.lastUseDate.toLocaleDateString() : 'N/A'}</span>
            </div>
            ${!shoe.retired ? `<div class="${urgencyClass}">
                Replacement: ${shoe.forecastedReplacement ? shoe.forecastedReplacement.toLocaleDateString() : 'N/A'} (Urgency: ${shoe.replacementUrgency.toUpperCase()})
            </div>` : ''}
            ${isEditMode ? editInputs : ''}
          </div>`;
    }).join('');

    const editButtonHtml = `<div class="edit-mode-toggle"><button id="toggle-gear-edit">${isEditMode ? '✅ Done Editing' : '✏️ Edit Gear'}</button></div>`;
    gearListContainer.innerHTML = editButtonHtml + `<div id="gear-cards-container">${cardsHtml}</div>`;

    document.getElementById('toggle-gear-edit').addEventListener('click', () => {
        isEditMode = !isEditMode;
        localStorage.setItem('gearEditMode', isEditMode);
        // Volver a renderizar para que los inputs de edición aparezcan/desaparezcan y los datos se refresquen
        renderGearCards(combinedGearData, allActivities); // Pasa allActivities de nuevo
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
                    // Re-renderizar las tarjetas para actualizar la vista con los nuevos valores y cálculos
                    // Retraso para que el usuario vea el checkmark
                    setTimeout(() => renderGearSection(allActivities.filter(a => a.type === 'Run' && a.gear_id), allActivities), 500);
                } else {
                    alert('Please enter valid numbers for price (>=0) and lifespan (>0).');
                }
            });
        });
    }
}


// Función para renderizar el gráfico de uso de equipo (Gráfico de líneas)
async function renderGearChart(runs, allActivities) { // Recibe allActivities
    const ctx = document.getElementById('gearChart');
    if (!ctx) {
        console.error("Canvas element 'gearChart' not found for renderGearChart.");
        return;
    }

    if (gearChartInstance) {
        gearChartInstance.destroy();
    }

    const gearUsageByDate = new Map();
    const gearEffectiveLife = new Map(); // Para almacenar la vida útil efectiva proyectada por zapatilla

    const uniqueGearIds = new Set(runs.map(a => a.gear_id).filter(Boolean));

    const gearIdToName = new Map();
    const gearDetailsMap = new Map(); // Para guardar los detalles completos de la zapatilla
    if (uniqueGearIds.size > 0) {
        try {
            const results = await Promise.all(Array.from(uniqueGearIds).map(id => fetchGearById(id)));
            results.forEach(result => {
                const gear = result.gear;
                if (gear) {
                    gearIdToName.set(gear.id, gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' '));
                    gearDetailsMap.set(gear.id, gear);
                }
            });
        } catch (error) {
            console.error("Error fetching gear names for GearChart:", error);
        }
    }

    // Preparar los datos de las zapatillas y sus carreras efectivas para el gráfico
    const processedShoesData = new Map();
    for (const gearId of uniqueGearIds) {
        const stravaGear = gearDetailsMap.get(gearId);
        if (stravaGear) {
            const initialRunsForShoe = allActivities.filter(a => a.type && a.type.includes('Run') && a.gear_id === stravaGear.id);
            const { shoe, runsWithEffectiveDistance } = initializeShoeProfile(stravaGear, initialRunsForShoe);
            processedShoesData.set(gearId, { shoe, runsWithEffectiveDistance });
            gearEffectiveLife.set(gearId, shoe.customLifespanKm || 1050); // Almacenar la vida útil base
        }
    }


    // Calcular la distancia efectiva acumulada por día para cada zapatilla
    const allDates = new Set();
    const cumulativeEffectiveDistance = new Map(); // { gearId: { dateString: cumulativeEffectiveKm } }

    for (const gearId of uniqueGearIds) {
        cumulativeEffectiveDistance.set(gearId, {});
        const shoeData = processedShoesData.get(gearId);
        if (!shoeData) continue;

        const runs = shoeData.runsWithEffectiveDistance.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let currentCumulative = 0;
        runs.forEach(run => {
            const dateString = run.date.toISOString().split('T')[0];
            allDates.add(dateString);
            currentCumulative += run.effectiveDistance;
            cumulativeEffectiveDistance.get(gearId)[dateString] = currentCumulative;
        });
    }

    const sortedDates = Array.from(allDates).sort();

    const datasets = [];
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
    let colorIndex = 0;

    uniqueGearIds.forEach(gearId => {
        const shoeName = gearIdToName.get(gearId) || `Gear ID: ${gearId}`;
        const color = colors[colorIndex % colors.length];
        const lifespanKm = gearEffectiveLife.get(gearId);
        const shoeObject = processedShoesData.get(gearId)?.shoe; // Get the full shoe object

        const data = sortedDates.map(dateString => {
            // Encuentra la última distancia acumulada hasta o en esta fecha
            let effectiveKmToday = 0;
            const dailyData = cumulativeEffectiveDistance.get(gearId);
            for (let i = sortedDates.indexOf(dateString); i >= 0; i--) {
                const d = sortedDates[i];
                if (dailyData[d] !== undefined) {
                    effectiveKmToday = dailyData[d];
                    break;
                }
            }
            return effectiveKmToday;
        });

        // Dataset para la distancia efectiva acumulada
        datasets.push({
            label: `${shoeName} (Effective Km)`,
            data: data,
            borderColor: color,
            backgroundColor: color + '40', // Semi-transparente para el área
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0, // No mostrar puntos
            segment: {
                // Cambiar color de la línea si supera la vida útil
                borderColor: ctx => {
                    const value = ctx.p0DataIndex > 0 ? ctx.dataset.data[ctx.p0DataIndex] : 0;
                    if (lifespanKm && value >= lifespanKm) {
                        return 'rgba(255, 0, 0, 0.7)'; // Rojo si excede la vida útil
                    }
                    return color;
                },
                backgroundColor: ctx => {
                    const value = ctx.p0DataIndex > 0 ? ctx.dataset.data[ctx.p0DataIndex] : 0;
                    if (lifespanKm && value >= lifespanKm) {
                        return 'rgba(255, 0, 0, 0.1)';
                    }
                    return color + '40';
                }
            }
        });

        // Dataset para la línea de vida útil efectiva (constante)
        if (lifespanKm && shoeObject && !shoeObject.retired) { // No mostrar la línea de vida útil para zapatillas retiradas
            datasets.push({
                label: `${shoeName} Lifespan (${lifespanKm} km)`,
                data: sortedDates.map(() => lifespanKm),
                borderColor: color,
                borderDash: [5, 5], // Línea discontinua
                backgroundColor: 'transparent',
                pointRadius: 0,
                borderWidth: 1,
            });

            // Dataset para la fecha de reemplazo pronosticada
            if (shoeObject.forecastedReplacement) {
                const forecastDateString = shoeObject.forecastedReplacement.toISOString().split('T')[0];
                const lastDateIndex = sortedDates.indexOf(forecastDateString);
                if (lastDateIndex !== -1) {
                    // Solo mostrar el punto en la fecha de pronóstico
                    const forecastData = sortedDates.map((d, idx) => (idx === lastDateIndex) ? lifespanKm : NaN);
                    datasets.push({
                        label: `Forecast: ${shoeObject.forecastedReplacement.toLocaleDateString()}`,
                        data: forecastData,
                        borderColor: color,
                        backgroundColor: color,
                        pointBackgroundColor: color,
                        pointBorderColor: 'white',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        type: 'scatter', // Usa tipo scatter para un único punto
                        showLine: false,
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if (context.raw === lifespanKm) {
                                        return `${shoeName} Forecast: ${shoeObject.forecastedReplacement.toLocaleDateString()}`;
                                    }
                                    return ''; // No mostrar tooltip para otros puntos NaN
                                }
                            }
                        }
                    });
                } else if (shoeObject.forecastedReplacement > new Date()) {
                    // Si la fecha de pronóstico está más allá de las fechas de actividad, agregarla como una anotación
                    // o como un punto final en un nuevo eje X expandido (más complejo para Chart.js sin custom plugins)
                    // Por ahora, solo se mostrará si está dentro del rango de fechas de actividad.
                }
            }
        }
        colorIndex++;
    });

    gearChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Cumulative Effective Distance per Gear Over Time'
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
                            if (context.parsed.y !== null && !isNaN(context.parsed.y)) { // Asegurarse de que no es NaN
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
                    stacked: false, // No apilado para ver la progresión individual y la línea de vida útil
                    title: {
                        display: true,
                        text: 'Effective Distance (km)'
                    },
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

    let gearIdToName = new Map();
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
        const month = a.start_date_local.substring(0, 7); // YYYY-MM
        if (!acc[month]) acc[month] = {};
        acc[month][gearKey] = (acc[month][gearKey] || 0) + a.distance / 1000; // Meters to KM
        return acc;
    }, {});

    const monthsWithData = Object.keys(gearMonthKm);
    if (monthsWithData.length === 0) {
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

    const allGears = Array.from(gearIdToName.keys());

    const datasets = allGears.map((gearId, idx) => ({
        label: gearIdToName.get(gearId) || `Gear ID: ${gearId}`,
        data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
        backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 60%)`,
        stack: 'stack1' // Para barras apiladas
    }));

    gearGanttChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: allMonths, datasets },
        options: {
            indexAxis: 'y', // Hace que las barras sean horizontales
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Distance per Gear per Month (Actual KM)'
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