// js/gear.js

import { formatDistance } from './utils.js';

let gearChartInstance = null; // Para la instancia de Chart.js

export function renderGearTab(allActivities) {
    console.log("Initializing Gear Tab...");

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));
    const gearTabContainer = document.getElementById('gear-tab');

    if (!gearTabContainer) {
        console.error("Gear tab container not found.");
        return;
    }

    if (runs.length === 0) {
        gearTabContainer.innerHTML = `
            <h3>Gear Overview</h3>
            <p>No running data available to show gear usage.</p>
        `;
        return;
    }

    // Procesar datos de zapatillas
    const gearData = processGearData(runs);
    
    // Renderizar la interfaz
    gearTabContainer.innerHTML = `
        <h3>Gear Overview</h3>
        <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1 1 320px; min-width: 280px;">
                <table class="df-table">
                    <thead>
                        <tr>
                            <th>Shoe Name</th>
                            <th>Total Km</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="gear-list-body">
                        ${Object.values(gearData).map(gear => {
                            const statusColor = gear.distance >= 500 ? '#dc3545' : gear.distance >= 300 ? '#ffc107' : '#28a745';
                            const statusText = gear.distance >= 500 ? 'Replace Soon!' : gear.distance >= 300 ? 'Monitor' : 'Good';
                            return `
                                <tr>
                                    <td>${gear.name || 'N/A'}</td>
                                    <td>${formatDistance(gear.distance * 1000)}</td>
                                    <td style="color: ${statusColor}; font-weight: bold;">${statusText}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div style="flex: 1 1 320px; min-width: 280px;">
                <div class="chart-wrapper" style="position: relative; height: 300px; width: 100%;">
                    <canvas id="gear-mileage-chart"></canvas>
                </div>
            </div>
        </div>
        <div class="disclaimer" style="font-size: 0.8em; color: #666; margin-top: 10px;">
            Mileage recommendations are general. Check your shoes for wear regardless of distance.
        </div>
    `;

    renderGearChart(gearData);
}

// Procesa todas las actividades para sumar kilometraje por zapatilla
function processGearData(runs) {
    const gearMap = {}; // { gearId: { name: 'Shoe A', distance: 100 (km), activities: [] } }

    runs.forEach(run => {
        if (run.gear_id) { // Asumiendo que las actividades tienen un 'gear_id' y 'gear_name'
            if (!gearMap[run.gear_id]) {
                gearMap[run.gear_id] = {
                    id: run.gear_id,
                    name: run.gear_name || `Gear ${run.gear_id}`, // Usa el nombre si existe, sino un genérico
                    distance: 0, // en KM
                    activities: []
                };
            }
            gearMap[run.gear_id].distance += run.distance / 1000; // Asumiendo distance en metros, convertir a KM
            gearMap[run.gear_id].activities.push(run);
        }
    });

    return gearMap;
}

// Renderiza el gráfico de uso de zapatillas
function renderGearChart(gearData) {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js not loaded, skipping gear chart rendering.");
        return;
    }
    const chartCanvas = document.getElementById('gear-mileage-chart');
    if (!chartCanvas) return;

    const ctx = chartCanvas.getContext('2d');
    if (gearChartInstance) {
        gearChartInstance.destroy(); // Destruye la instancia anterior si existe
    }

    const labels = Object.values(gearData).map(gear => gear.name);
    const data = Object.values(gearData).map(gear => parseFloat(gear.distance.toFixed(1))); // Distancia en KM
    const colors = generateRandomColors(labels.length); // Función helper para colores

    gearChartInstance = new Chart(ctx, {
        type: 'doughnut', // O 'bar' para mostrar barras
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Mileage (km)',
                data: data,
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Running Shoe Mileage'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += formatDistance(context.parsed * 1000); // Convertir KM a metros para formatDistance
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// Helper para generar colores aleatorios para el gráfico
function generateRandomColors(num) {
    const colors = [];
    for (let i = 0; i < num; i++) {
        const r = Math.floor(Math.random() * 255);
        const g = Math.floor(Math.random() * 255);
        const b = Math.floor(Math.random() * 255);
        colors.push(`rgba(${r}, ${g}, ${b}, 0.7)`);
    }
    return colors;
}