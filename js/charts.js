// js/charts.js
import { calculateFitness, rollingMean as calculateRollingMean } from './utils.js';

let charts = {}; // Almacén global para las instancias de Chart.js
let runsHeatmapMap = null; // Almacén para el mapa de Leaflet
let runsHeatmapLayer = null; // Almacén para la capa de calor

// --- UTILITY ---
function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found.`);
        return;
    }
    // Si ya existe un gráfico en ese canvas, lo destruimos primero
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    charts[canvasId] = new Chart(canvas, config);
}


// --- CHART RENDERING FUNCTIONS ---

export function renderConsistencyChart(runs) {
    const heatmapContainer = document.getElementById('cal-heatmap');
    if (!heatmapContainer) {
        console.error("Heatmap container 'cal-heatmap' not found.");
        return;
    }

    // 1. Manejo del caso sin datos: Si no hay carreras, muestra un mensaje y termina.
    if (!runs || runs.length === 0) {
        heatmapContainer.innerHTML = '<p style="text-align: center; color: #8c8c8c;">No activity data for this period.</p>';
        return;
    }
    
    // 2. Agregación de datos: Contamos las actividades por día.
    const aggregatedData = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {});
    
    // 3. Configuración del calendario (CalHeatmap)
    const cal = new CalHeatmap();
    heatmapContainer.innerHTML = ''; // Limpiamos el contenedor antes de dibujar

    // 4. Determinamos el rango de fechas dinámicamente
    // Buscamos la fecha de la última actividad en el array `runs`
    const lastDateStr = runs.reduce((max, act) => act.start_date_local > max ? act.start_date_local : max, runs[0].start_date_local);
    const lastDate = new Date(lastDateStr);

    // La fecha de inicio del calendario será 365 días ANTES de la última actividad
    const startDate = new Date(lastDate);
    startDate.setDate(startDate.getDate() - 365);
    
    // 5. Renderizado del heatmap
    cal.paint({
        itemSelector: heatmapContainer,
        domain: { 
            type: "month", 
            label: { text: "MMM", position: "bottom" },
            paddding: 5
        },
        subDomain: { 
            type: "ghDay", 
            radius: 2, 
            width: 11, 
            height: 11,
            gutter: 4
        },
        range: 12, // Muestra 12 meses
        data: { 
            source: Object.entries(aggregatedData).map(([date, value]) => ({ date, value })), 
            x: 'date', 
            y: 'value' 
        },
        scale: { 
            color: { 
                type: 'threshold', 
                range: ['#ebedf0', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26'], 
                domain: [1, 2, 3, 4] 
            } 
        },
        date: { 
            start: startDate // Usamos la fecha de inicio calculada
        },
        itemSelector: "#cal-heatmap",
    });
}

export function renderActivityTypeChart(runs) {
    const p90Distance = runs.length > 0 ? [...runs].map(a => a.distance).sort((a, b) => a - b)[Math.floor(0.9 * runs.length)] : 0;
    runs.forEach(a => {
        if (a.workout_type !== 1 && a.distance >= p90Distance) {
            a.workout_type_classified = 2; // Long run
        } else {
            a.workout_type_classified = a.workout_type || 0;
        }
    });

    const workoutTypeLabels = ['Workout', 'Race', 'Long Run'];
    const workoutTypeCounts = [0, 0, 0];
    runs.forEach(act => {
        const wt = act.workout_type_classified;
        if (workoutTypeCounts[wt] !== undefined) {
            workoutTypeCounts[wt]++;
        }
    });

    createChart('activity-type-barchart', {
        type: 'bar',
        data: {
            labels: workoutTypeLabels,
            datasets: [{
                label: '# Activities',
                data: workoutTypeCounts,
                backgroundColor: 'rgba(252, 82, 0, 0.7)'
            }]
        },
        options: { indexAxis: 'y', plugins: { legend: { display: false } } }
    });
}

export function renderMonthlyDistanceChart(runs) {
    const monthlyData = runs.reduce((acc, act) => {
        const month = act.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = { distance: 0, count: 0 };
        acc[month].distance += act.distance / 1000;
        acc[month].count += 1;
        return acc;
    }, {});

    const sortedMonths = Object.keys(monthlyData).sort();
    const monthlyDistances = sortedMonths.map(m => monthlyData[m].distance);
    const monthlyCounts = sortedMonths.map(m => monthlyData[m].count);

    createChart('monthly-distance-chart', {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [
                { type: 'line', label: 'Distance (km)', data: monthlyDistances, borderColor: '#FC5200', yAxisID: 'y' },
                { type: 'bar', label: '# Runs', data: monthlyCounts, backgroundColor: 'rgba(54,162,235,0.25)', yAxisID: 'y1' }
            ]
        },
        options: {
            scales: {
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Distance (km)' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: '# Runs' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

export function renderPaceVsDistanceChart(runs) {
    const data = runs.filter(r => r.distance > 0).map(r => ({
        x: r.distance / 1000,
        y: (r.moving_time / 60) / (r.distance / 1000) // Pace in min/km
    }));

    createChart('pace-vs-distance-chart', {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Runs',
                data: data,
                backgroundColor: 'rgba(252, 82, 0, 0.7)'
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Distance (km)' } },
                y: { title: { display: true, text: 'Pace (min/km)' } }
            }
        }
    });
}

export function renderDistanceHistogram(runs) {
    const HISTOGRAM_BIN_SIZE_KM = 1;
    const distances = runs.map(act => act.distance / 1000);
    const maxDistance = Math.max(...distances, 0);
    const binCount = Math.ceil(maxDistance / HISTOGRAM_BIN_SIZE_KM);
    const bins = Array(binCount).fill(0);
    distances.forEach(d => {
        const idx = Math.floor(d / HISTOGRAM_BIN_SIZE_KM);
        if (idx < binCount) bins[idx]++;
    });

    createChart('distance-histogram', {
        type: 'bar',
        data: {
            labels: bins.map((_, i) => `${(i * HISTOGRAM_BIN_SIZE_KM).toFixed(0)}-${((i + 1) * HISTOGRAM_BIN_SIZE_KM).toFixed(0)}`),
            datasets: [{ label: '# Activities', data: bins, backgroundColor: 'rgba(252, 82, 0, 0.5)' }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: `Distance (bins of ${HISTOGRAM_BIN_SIZE_KM} km)` } },
                y: { title: { display: true, text: 'Count' } }
            }
        }
    });
}

export function renderVo2maxChart(runs) {
    const USER_MAX_HR = 195;
    const vo2maxData = runs
        .filter(act => act.average_heartrate && act.moving_time > 0 && act.distance > 0)
        .map(act => {
            const vel_m_min = (act.distance / act.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const vo2max = vo2_at_pace / (act.average_heartrate / USER_MAX_HR);
            return { yearMonth: act.start_date_local.substring(0, 7), vo2max };
        });

    const vo2maxByMonth = vo2maxData.reduce((acc, d) => {
        if (!acc[d.yearMonth]) acc[d.yearMonth] = [];
        acc[d.yearMonth].push(d.vo2max);
        return acc;
    }, {});

    const months = Object.keys(vo2maxByMonth).sort();
    const vo2maxMonthlyAvg = months.map(m => vo2maxByMonth[m].reduce((a, b) => a + b, 0) / vo2maxByMonth[m].length);
    const vo2maxRolling = calculateRollingMean(vo2maxMonthlyAvg, 3); // Rolling window of 3 months

    createChart('vo2max-over-time', {
        type: 'line',
        data: {
            labels: months,
            datasets: [{ label: 'Estimated VO₂max (3-month rolling mean)', data: vo2maxRolling, borderColor: 'rgba(54, 162, 235, 1)', tension: 0.2 }]
        },
        options: { scales: { y: { title: { display: true, text: 'VO₂max' } } } }
    });
}

export function renderFitnessChart(runs) {
    const effortByDay = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.perceived_exertion ?? act.suffer_score ?? 0);
        return acc;
    }, {});

    const allEffortDays = Object.keys(effortByDay).sort();
    if (allEffortDays.length === 0) return;

    const startDate = new Date(allEffortDays[0]);
    const endDate = new Date(allEffortDays[allEffortDays.length - 1]);
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
    }

    const dailyEffort = days.map(date => effortByDay[date] || 0);
    const { atl, ctl, tsb } = calculateFitness(dailyEffort);

    createChart('ctl-atl-tsb', {
        type: 'line',
        data: {
            labels: days,
            datasets: [
                { label: 'ATL (Fatigue)', data: atl, borderColor: '#FC5200', fill: false, tension: 0.2, pointRadius: 0 },
                { label: 'CTL (Fitness)', data: ctl, borderColor: '#0074D9', fill: true, backgroundColor: 'rgba(0,116,217,0.1)', tension: 0.2, pointRadius: 0 },
                { label: 'TSB (Form)', data: tsb, borderColor: '#2ECC40', fill: false, tension: 0.2, pointRadius: 0 }
            ]
        },
        options: { scales: { y: { title: { display: true, text: 'Load' } } } }
    });
}

export function renderStackedAreaGearChart(runs, gearIdToName = {}) {
    const gearMonthKm = runs.reduce((acc, a) => {
        if (!a.gear_id) return acc;
        const gearName = a.gear?.name || a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearName] = (acc[month][gearName] || 0) + a.distance / 1000;
        return acc;
    }, {});

    const allMonths = Object.keys(gearMonthKm).sort();
    const allGears = Array.from(new Set(runs.map(a => a.gear?.name || a.gear_id).filter(Boolean)));

    const datasets = allGears.map((gearId, idx) => {
        const label = gearIdToName[gearId] || gearId;
        return {
            label,
            data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
            backgroundColor: `hsl(${(idx * 60)}, 70%, 60%)`, // Different colors
            fill: true,
            borderWidth: 1,
            tension: 0.2
        };
    });

    createChart('stacked-area-chart', {
        type: 'line',
        data: { labels: allMonths, datasets: datasets },
        options: {
            scales: {
                x: { stacked: true, title: { display: true, text: 'Year-Month' } },
                y: { stacked: true, title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}

export function renderGearGanttChart(runs, gearIdToName = {}) {
        const gearMonthKm = runs.reduce((acc, a) => {
        if (!a.gear_id) return acc;
        const gearKey = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearKey] = (acc[month][gearKey] || 0) + a.distance / 1000;
        return acc;
    }, {});

    const allMonths = Object.keys(gearMonthKm).sort();
    const allGears = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    const datasets = allGears.map((gearId, idx) => ({
        label: gearIdToName[gearId] || gearId,
        data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
        backgroundColor: `hsl(${(idx * 60)}, 70%, 60%)`
    }));

    createChart('gear-gantt-chart', {
        type: 'bar',
        data: { labels: allMonths, datasets },
        options: {
            indexAxis: 'y',
            scales: {
                x: { stacked: true, title: { display: true, text: 'Distance (km)' } },
                y: { stacked: true, title: { display: true, text: 'Year-Month' } }
            }
        }
    });
}

export function renderDistanceVsElevationChart(runs) {
    const data = runs.map(r => ({
        x: r.distance / 1000,
        y: r.total_elevation_gain || 0
    }));
    createChart('distance-vs-elevation-chart', {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Runs',
                data,
                backgroundColor: 'rgba(54,162,235,0.7)'
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Distance (km)' } },
                y: { title: { display: true, text: 'Elevation Gain (m)' } }
            }
        }
    });
}

export function renderElevationHistogram(runs) {
    const values = runs.map(r => r.total_elevation_gain || 0);
    const binSize = 10;
    const maxVal = Math.max(...values, 0);
    const binCount = Math.ceil(maxVal / binSize);
    const bins = Array(binCount).fill(0);
    values.forEach(v => {
        const idx = Math.floor(v / binSize);
        if (idx < binCount) bins[idx]++;
    });

    createChart('elevation-histogram', {
        type: 'bar',
        data: {
            labels: bins.map((_, i) => `${i * binSize}-${(i + 1) * binSize}`),
            datasets: [{
                label: '# Activities',
                data: bins,
                backgroundColor: 'rgba(252, 82, 0, 0.5)'
            }]
        },
        options: { scales: { x: { title: { display: true, text: 'Elevation Gain (m)' } } } }
    });
}

export function renderAccumulatedDistanceChart(runs) {
    const sorted = [...runs].sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));
    const labels = sorted.map(a => a.start_date_local.substring(0, 10));
    const distances = sorted.map(a => a.distance / 1000);
    const accumulated = [];
    distances.reduce((acc, d, i) => accumulated[i] = acc + d, 0);

    createChart('accumulated-distance-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'Accumulated Distance (km)', data: accumulated, borderColor: 'rgba(54,162,235,1)', pointRadius: 0, tension: 0.1 }]
        },
        options: { scales: { y: { title: { display: true, text: 'Distance (km)' } } } }
    });
}

export function renderRollingMeanDistanceChart(runs) {
    const sorted = [...runs].sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));
    const labels = sorted.map(a => a.start_date_local.substring(0, 10));
    const distances = sorted.map(a => a.distance / 1000);
    const rolling = calculateRollingMean(distances, 10); // Window of 10 runs

    createChart('rolling-mean-distance-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'Rolling Mean Distance (10 runs)', data: rolling, borderColor: 'rgba(255,99,132,1)', pointRadius: 0, tension: 0.1 }]
        },
        options: { scales: { y: { title: { display: true, text: 'Distance (km)' } } } }
    });
}

export function renderRunsHeatmap(runs) {
    if (!window.L) {
        console.error("Leaflet.js no está cargado. No se puede renderizar el mapa de calor.");
        return;
    }

    // 1. Filtramos las actividades que tienen datos de mapa.
    const points = runs
        .filter(act => act.start_latlng && Array.isArray(act.start_latlng) && act.start_latlng.length === 2)
        .map(act => [act.start_latlng[0], act.start_latlng[1]]); // <-- CREAMOS UN ARRAY [lat, lng]

    const heatmapDiv = document.getElementById('runs-heatmap');
    if (!heatmapDiv) return;

    // 2. Si no hay puntos, lo indicamos y salimos.
    if (points.length === 0) {
        heatmapDiv.innerHTML = '<p>No map data available for this period.</p>';
        // Si el mapa ya existía, limpiamos la capa anterior.
        if (runsHeatmapMap && runsHeatmapLayer) {
            runsHeatmapMap.removeLayer(runsHeatmapLayer);
            runsHeatmapLayer = null;
        }
        return;
    }

    // 3. Si el mapa no existe, lo creamos.
    if (!runsHeatmapMap) {
        runsHeatmapMap = L.map('runs-heatmap').setView([40, -3], 2); // Vista inicial
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(runsHeatmapMap);
    }

    // 4. Si ya existía una capa de calor, la eliminamos.
    if (runsHeatmapLayer) {
        runsHeatmapMap.removeLayer(runsHeatmapLayer);
    }

    // 5. Creamos la nueva capa de calor. L.heatLayer espera un array de arrays [lat, lng, intensity?].
    // Nuestro formato [lat, lng] es perfecto.
    runsHeatmapLayer = L.heatLayer(points, { radius: 20, blur: 25, maxZoom: 11 }).addTo(runsHeatmapMap);

    // 6. Ajustamos la vista del mapa para que se vean todos los puntos.
    try {
        runsHeatmapMap.fitBounds(points);
    } catch (e) {
        console.error("No se pudo ajustar el mapa a los límites.", e);
    }
}