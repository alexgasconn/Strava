// js/gear.js

import { formatDistance } from './utils.js';
import { fetchGearById } from './api.js'; // Asume que tienes un archivo api.js para esto

let gearChartInstance = null; // Para la instancia de Chart.js

export function renderGearTab(allActivities) {
    console.log("Initializing Gear Tab...");

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));
    const gearTabContainer = document.getElementById('gear-tab');

    if (runs.length === 0) {
        gearTabContainer.innerHTML = `
            <h3>Gear Overview</h3>
            <p>No running data available to show gear usage.</p>
            <div id="gear-info-section">
                <h4>Detailed Gear Info</h4>
                <div id="gear-info-list"></div>
            </div>
            <div id="gear-chart-container">
                <h4>Gear Usage Over Time</h4>
                <canvas id="gearChart"></canvas>
            </div>
        `;
        return;
    }

    gearTabContainer.innerHTML = `
        <h3>Gear Overview</h3>
        <div id="gear-info-section">
            <h4>Detailed Gear Info</h4>
            <div id="gear-info-list"></div>
        </div>
        <div id="gear-chart-container">
            <h4>Gear Usage Over Time</h4>
            <canvas id="gearChart"></canvas>
        </div>
    `;

    renderGearSection(runs);
    renderGearChart(runs);
}

// Función para renderizar la sección de información detallada del equipo
async function renderGearSection(runs) {
    const container = document.getElementById('gear-info-section');
    if (!container) return; // Asegurarse de que el contenedor existe

    const gearListContainer = document.getElementById('gear-info-list');
    if (!gearListContainer) {
        console.error("gear-info-list container not found.");
        return;
    }

    const gearUsage = new Map();
    runs.forEach(run => {
        if (run.gear_id) {
            // Asegurarse de que el gear_id es válido
            if (typeof run.gear_id === 'string' && run.gear_id.trim() !== '') {
                if (!gearUsage.has(run.gear_id)) {
                    gearUsage.set(run.gear_id, { numUses: 0, lastUse: run.start_date_local, totalDistance: 0 });
                }
                const currentUsage = gearUsage.get(run.gear_id);
                currentUsage.numUses++;
                currentUsage.totalDistance += run.distance || 0; // Sumar la distancia de la carrera
                // Actualizar la última fecha de uso si la carrera actual es más reciente
                if (new Date(run.start_date_local) > new Date(currentUsage.lastUse)) {
                    currentUsage.lastUse = run.start_date_local;
                }
            } else {
                console.warn("Activity has an invalid gear_id:", run.gear_id, "for activity:", run.name);
            }
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
        const gearDetailsMap = new Map(); // Para almacenar los detalles completos del equipo
        results.forEach(result => {
            const gear = result.gear;
            if (gear) {
                gearIdToName[gear.id] = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ');
                gearDetailsMap.set(gear.id, gear); // Almacenar el objeto completo del equipo
            }
        });

        // Combinar la información de la API con los datos de uso calculados
        const combinedGearData = Array.from(gearDetailsMap.values()).map(gear => {
            const usage = gearUsage.get(gear.id) || { numUses: 0, lastUse: 'N/A', totalDistance: 0 };
            return {
                gear: {
                    ...gear,
                    distance: usage.totalDistance // Usar la distancia total calculada de las carreras
                },
                usage: usage
            };
        });

        renderGearCards(combinedGearData, runs); // Pasar `runs` para el listener de edición si es necesario
    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        gearListContainer.innerHTML = '<p>Error loading gear details. Check the console.</p>';
    }
}


// Función para renderizar las tarjetas de equipo
function renderGearCards(combinedGearData, allRuns) {
    const gearListContainer = document.getElementById('gear-info-list');
    let isEditMode = localStorage.getItem('gearEditMode') === 'true';

    // Ordenar los equipos: primero los que necesitan reemplazo, luego los principales, luego por distancia
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

        // Primero, los que necesitan reemplazo
        if (needsReplacementA && !needsReplacementB) return -1;
        if (!needsReplacementA && needsReplacementB) return 1;

        // Luego, los equipos principales
        if (a.gear.primary && !b.gear.primary) return -1;
        if (!a.gear.primary && b.gear.primary) return 1;

        // Finalmente, por distancia (mayor primero)
        return totalKmB - totalKmA;
    });

    const cardsHtml = combinedGearData.map(data => {
        const gear = data.gear;
        const usage = data.usage; // Ya viene con numUses, lastUse, totalDistance

        const customData = JSON.parse(localStorage.getItem(`gear-custom-${gear.id}`) || '{}');
        const price = customData.price ?? 120; // Precio por defecto
        const durationKm = customData.durationKm ?? 700; // Vida útil por defecto
        const totalKm = gear.distance / 1000; // Distancia en km

        const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
        const euroPerKm = price > 0 && totalKm > 0 ? (price / totalKm).toFixed(2) : '-';
        const needsReplacement = durabilityPercent >= 100;

        let durabilityColor = durabilityPercent > 90 ? '#dc3545' : durabilityPercent > 75 ? '#ffc107' : '#28a745'; // Colores de la barra

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
                <span><strong>Last Use:</strong> ${usage.lastUse !== 'N/A' ? new Date(usage.lastUse).toLocaleDateString() : 'N/A'}</span>
            </div>
            ${needsReplacement && !gear.retired ? '<div class="alert-danger">Replacement Needed!</div>' : ''}
            ${isEditMode ? editInputs : ''}
          </div>`;
    }).join('');

    const editButtonHtml = `<div class="edit-mode-toggle"><button id="toggle-gear-edit">${isEditMode ? '✅ Done Editing' : '✏️ Edit Gear'}</button></div>`;
    gearListContainer.innerHTML = editButtonHtml + `<div id="gear-cards-container">${cardsHtml}</div>`;

    document.getElementById('toggle-gear-edit').addEventListener('click', () => {
        isEditMode = !isEditMode; // Alternar el estado
        localStorage.setItem('gearEditMode', isEditMode);
        renderGearCards(combinedGearData, allRuns); // Volver a renderizar para aplicar el cambio de modo
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
                    setTimeout(() => renderGearCards(combinedGearData, allRuns), 500); // Actualizar después de guardar
                } else {
                    alert('Please enter valid numbers for price (>=0) and lifespan (>0).');
                }
            });
        });
    }
}


// Función para renderizar el gráfico de uso de equipo
async function renderGearChart(runs) {
    const ctx = document.getElementById('gearChart');
    if (!ctx) {
        console.error("Canvas element 'gearChart' not found.");
        return;
    }

    // Destruir la instancia anterior si existe
    if (gearChartInstance) {
        gearChartInstance.destroy();
    }

    const gearUsageByDate = new Map(); // Map<DateString, Map<GearId, Distance>>

    for (const run of runs) {
        if (run.gear_id && run.start_date_local) {
            const date = new Date(run.start_date_local);
            const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!gearUsageByDate.has(dateString)) {
                gearUsageByDate.set(dateString, new Map());
            }
            const dailyGear = gearUsageByDate.get(dateString);
            const currentDistance = dailyGear.get(run.gear_id) || 0;
            dailyGear.set(run.gear_id, currentDistance + (run.distance || 0));
        }
    }

    const allDates = Array.from(gearUsageByDate.keys()).sort();

    // Obtener nombres de equipo
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
            console.error("Error fetching gear names for chart:", error);
        }
    }


    const datasets = [];
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
    let colorIndex = 0;

    uniqueGearIds.forEach(gearId => {
        const data = allDates.map(dateString => {
            const dailyGear = gearUsageByDate.get(dateString);
            return dailyGear && dailyGear.has(gearId) ? dailyGear.get(gearId) / 1000 : 0; // en KM
        });

        datasets.push({
            label: gearIdToName.get(gearId) || `Gear ID: ${gearId}`,
            data: data,
            borderColor: colors[colorIndex % colors.length],
            backgroundColor: colors[colorIndex % colors.length] + '40', // 25% opacidad
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
                    stacked: true, // Para ver la contribución de cada equipo si se superponen
                    title: {
                        display: true,
                        text: 'Distance (km)'
                    }
                }
            }
        }
    });
}