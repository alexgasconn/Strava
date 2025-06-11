// js/tabs/running.js

let runningCharts = {};

export function renderRunningTab(activities) {
    console.log("Renderizando pestaña de Running...");
    const runs = activities.filter(a => a.type === 'Run');
    const runningContainer = document.getElementById('running');

    if (runs.length === 0) {
        if(runningContainer) runningContainer.innerHTML = "<h2>Análisis de Running</h2><p>No se encontraron actividades de carrera.</p>";
        return;
    }

    // Pre-procesamiento específico
    runs.forEach(run => run.pace_seconds_per_km = run.distance_km > 0 ? run.moving_time / run.distance_km : 0);

    renderRunningSummary(runs);
    renderPaceVsDistanceChart(runs);
    renderTopRunsTables(runs);
}

function renderRunningSummary(runs) {
    const totalRunDistance = runs.reduce((sum, r) => sum + r.distance_km, 0);
    const totalRunTime = runs.reduce((sum, r) => sum + r.moving_time_hours, 0);
    const totalRunElevation = runs.reduce((sum, r) => sum + r.elevation_gain_m, 0);

    const container = document.getElementById('running-summary-cards');
    if (container) {
        container.innerHTML = `
            <div class="card"><h3>Carreras Totales</h3><p>${runs.length}</p></div>
            <div class="card"><h3>Distancia Total</h3><p>${totalRunDistance.toFixed(0)} km</p></div>
            <div class="card"><h3>Horas Corriendo</h3><p>${totalRunTime.toFixed(1)} h</p></div>
            <div class="card"><h3>Desnivel Total</h3><p>${totalRunElevation.toFixed(0)} m</p></div>
        `;
    }
}

function renderPaceVsDistanceChart(runs) {
    const canvasId = 'pace-vs-distance-chart';
    const canvas = document.getElementById(canvasId);
    if (!canvas || runningCharts[canvasId]) return;

    runningCharts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Carreras',
                data: runs.map(r => ({ x: r.distance_km, y: r.pace_seconds_per_km })).filter(d => d.y > 0),
                backgroundColor: 'rgba(252, 82, 0, 0.7)'
            }]
        },
        options: {
            scales: {
                x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Distancia (km)' } },
                y: {
                    title: { display: true, text: 'Ritmo (min/km)' },
                    ticks: {
                        callback: (value) => `${Math.floor(value / 60)}:${Math.round(value % 60).toString().padStart(2, '0')}`
                    }
                }
            }
        }
    });
}

function renderTopRunsTables(runs) {
    const formatPace = (s) => s > 0 ? `${Math.floor(s / 60)}'${Math.round(s % 60).toString().padStart(2, '0')}"` : "N/A";
    
    const topDistanceRuns = [...runs].sort((a, b) => b.distance_km - a.distance_km).slice(0, 5);
    const topPaceRuns = runs.filter(r => r.distance_km >= 1).sort((a, b) => a.pace_seconds_per_km - b.pace_seconds_per_km).slice(0, 5);

    const distanceTable = document.querySelector('#top-distance-runs');
    if (distanceTable) {
        distanceTable.innerHTML = `<thead><tr><th>Fecha</th><th>Distancia</th><th>Ritmo</th></tr></thead><tbody>${topDistanceRuns.map(r => `<tr><td>${r.start_date_local_obj.toLocaleDateString()}</td><td>${r.distance_km.toFixed(2)} km</td><td>${formatPace(r.pace_seconds_per_km)}/km</td></tr>`).join('')}</tbody>`;
    }
    
    const paceTable = document.querySelector('#top-pace-runs');
    if (paceTable) {
        paceTable.innerHTML = `<thead><tr><th>Fecha</th><th>Ritmo</th><th>Distancia</th></tr></thead><tbody>${topPaceRuns.map(r => `<tr><td>${r.start_date_local_obj.toLocaleDateString()}</td><td>${formatPace(r.pace_seconds_per_km)}/km</td><td>${r.distance_km.toFixed(2)} km</td></tr>`).join('')}</tbody>`;
    }
}