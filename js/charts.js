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
    
    // 2. Agregación de datos: Sumamos la distancia total (en km) por día.
    const aggregatedData = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.distance ? act.distance / 1000 : 0);
        return acc;
    }, {});
    
    // 3. Configuración del calendario (CalHeatmap)
    const cal = new CalHeatmap();
    heatmapContainer.innerHTML = ''; // Limpiamos el contenedor antes de dibujar

    // 4. Determinamos el rango de fechas dinámicamente
    const lastDateStr = runs.reduce((max, act) => act.start_date_local > max ? act.start_date_local : max, runs[0].start_date_local);
    const lastDate = new Date(lastDateStr);

    // La fecha de inicio del calendario será 365 días ANTES de la última actividad
    const startDate = new Date(lastDate);
    startDate.setDate(startDate.getDate() - 365);

    // 5. Calculamos los umbrales de color en función de los datos (percentiles)
    const kmValues = Object.values(aggregatedData).filter(v => v > 0).sort((a, b) => a - b);
    // Si hay pocos datos, usamos valores fijos razonables
    const thresholds = kmValues.length >= 5
        ? [
            kmValues[Math.floor(0.2 * kmValues.length)],
            kmValues[Math.floor(0.4 * kmValues.length)],
            kmValues[Math.floor(0.6 * kmValues.length)],
            kmValues[Math.floor(0.8 * kmValues.length)]
        ]
        : [2, 5, 10, 15];

    // 6. Renderizado del heatmap
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
            gutter: 4,
            // Añadimos etiquetas de días de la semana en el eje Y
            label: (date, value, index) => {
                // Solo mostrar la etiqueta en la primera columna de cada semana
                if (date.getDay() === 1) { // Lunes (0=Domingo, 1=Lunes,...)
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return days[date.getDay()];
                }
                return '';
            },
            labelPosition: 'left',
            labelAlign: 'middle',
            labelOffset: 0
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
                domain: thresholds
            } 
        },
        date: { 
            start: startDate // Usamos la fecha de inicio calculada
        },
        itemSelector: "#cal-heatmap",
    });

    // Añadir etiquetas de días de la semana a la izquierda del heatmap
    // (Esto es un workaround visual, ya que CalHeatmap no lo hace automáticamente)
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let yLabels = document.getElementById('cal-heatmap-weekdays');
    if (!yLabels) {
        yLabels = document.createElement('div');
        yLabels.id = 'cal-heatmap-weekdays';
        yLabels.style.display = 'flex';
        yLabels.style.flexDirection = 'column';
        yLabels.style.position = 'absolute';
        yLabels.style.left = '0';
        yLabels.style.top = '40px';
        yLabels.style.zIndex = '10';
        yLabels.style.pointerEvents = 'none';
        yLabels.style.fontSize = '11px';
        yLabels.style.color = '#888';
        yLabels.style.lineHeight = '13px';
        weekDays.forEach(day => {
            const d = document.createElement('span');
            d.textContent = day;
            d.style.height = '13px';
            d.style.marginBottom = '2px';
            yLabels.appendChild(d);
        });
        heatmapContainer.parentElement.style.position = 'relative';
        heatmapContainer.parentElement.appendChild(yLabels);
    }
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
    if (!runs || runs.length === 0) return;

    // Aggregate data by month
    const monthlyData = runs.reduce((acc, act) => {
        const month = act.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = { distance: 0, count: 0 };
        acc[month].distance += act.distance / 1000;
        acc[month].count += 1;
        return acc;
    }, {});

    // Find the first and last month
    const monthsSortedByDate = runs
        .map(act => act.start_date_local.substring(0, 7))
        .sort();
    const firstMonth = monthsSortedByDate[0];
    const lastMonth = monthsSortedByDate[monthsSortedByDate.length - 1];

    // Generate all months between firstMonth and lastMonth
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

    // Fill missing months with zeros
    const monthlyDistances = allMonths.map(m => monthlyData[m]?.distance || 0);
    const monthlyCounts = allMonths.map(m => monthlyData[m]?.count || 0);

    createChart('monthly-distance-chart', {
        type: 'bar',
        data: {
            labels: allMonths,
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
    const ROLLING_WINDOW = 2; // Cambia este valor para ajustar la ventana del rolling mean
    const vo2maxData = runs
        .filter(act => act.estimated_vo2max)
        .map(act => ({
            yearMonth: act.start_date_local.substring(0, 7),
            vo2max: act.estimated_vo2max
        }));

    // Genera todos los meses entre el primero y el último, para evitar huecos
    const allMonths = (() => {
        if (vo2maxData.length === 0) return [];
        const monthsSorted = vo2maxData.map(d => d.yearMonth).sort();
        const first = monthsSorted[0];
        const last = monthsSorted[monthsSorted.length - 1];
        const result = [];
        let [sy, sm] = first.split('-').map(Number);
        let [ey, em] = last.split('-').map(Number);
        while (sy < ey || (sy === ey && sm <= em)) {
            result.push(`${sy.toString().padStart(4, '0')}-${sm.toString().padStart(2, '0')}`);
            sm++;
            if (sm > 12) {
                sm = 1;
                sy++;
            }
        }
        return result;
    })();

    // Agrupa los valores por mes
    const vo2maxByMonth = vo2maxData.reduce((acc, d) => {
        if (!acc[d.yearMonth]) acc[d.yearMonth] = [];
        acc[d.yearMonth].push(d.vo2max);
        return acc;
    }, {});

    // Calcula el promedio mensual, usando null para meses sin datos
    const vo2maxMonthlyAvg = allMonths.map(m => {
        const vals = vo2maxByMonth[m];
        return vals && vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });

    // Rolling mean configurable
    const vo2maxRolling = [];
    for (let i = 0; i < vo2maxMonthlyAvg.length; i++) {
        const window = vo2maxMonthlyAvg.slice(Math.max(0, i - (ROLLING_WINDOW - 1)), i + 1).filter(v => v !== null);
        vo2maxRolling.push(window.length === ROLLING_WINDOW ? window.reduce((a, b) => a + b, 0) / ROLLING_WINDOW : null);
    }

    createChart('vo2max-over-time', {
        type: 'line',
        data: {
            labels: allMonths,
            datasets: [{
                label: `Estimated VO₂max (${ROLLING_WINDOW}-month rolling mean)`,
                data: vo2maxRolling,
                borderColor: 'rgba(54, 162, 235, 1)',
                tension: 0.2,
                spanGaps: true // Permite saltar huecos
            }]
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
            // ATL (Fatigue) - Opacidad de línea al 70%
            { label: 'ATL (Fatigue)', data: atl, borderColor: 'rgba(252, 82, 0, 0.3)', fill: false, tension: 0.2, pointRadius: 0 },
            // CTL (Fitness) - Opacidad de línea al 90%, relleno al 15%
            { label: 'CTL (Fitness)', data: ctl, borderColor: 'rgba(0, 116, 217, 0.6)', fill: true, backgroundColor: 'rgba(0,116,217,0.15)', tension: 0.2, pointRadius: 0 },
            // TSB (Form) - Opacidad de línea al 100% (o muy alta)
            { label: 'TSB (Form)', data: tsb, borderColor: 'rgba(46, 204, 64, 1)', fill: false, tension: 0.2, pointRadius: 0 }
        ]
        },
        options: { scales: { y: { title: { display: true, text: 'Load' } } } }
    });
}

export function renderStackedAreaGearChart(runs, gearIdToName = {}) {
    // 1. Aggregate distance per gear per month
    const gearMonthKm = runs.reduce((acc, a) => {
        if (!a.gear_id) return acc;
        const gearName = a.gear?.name || a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearName] = (acc[month][gearName] || 0) + a.distance / 1000;
        return acc;
    }, {});

    // 2. Get all months between first and last activity
    const monthsSorted = runs.map(a => a.start_date_local.substring(0, 7)).sort();
    const firstMonth = monthsSorted[0];
    const lastMonth = monthsSorted[monthsSorted.length - 1];
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

    // 3. Get all gears
    const allGears = Array.from(new Set(runs.map(a => a.gear?.name || a.gear_id).filter(Boolean)));

    // 4. Build datasets, filling missing months with 0
    const datasets = allGears.map((gearId, idx) => {
        const label = gearIdToName[gearId] || gearId;
        return {
            label,
            data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
            backgroundColor: `hsl(${(idx * 60)}, 70%, 60%)`,
            fill: true,
            borderWidth: 1,
            tension: 0.2,
            pointRadius: 2, // <-- más pequeño el punto
            pointHoverRadius: 4 // opcional, para hover
        };
    });

    createChart('stacked-area-chart', {
        type: 'line',
        data: { labels: allMonths, datasets: datasets },
        options: {
            elements: {
                point: {
                    radius: 2 // <-- también aquí por si acaso
                }
            },
            scales: {
                x: { stacked: true, title: { display: true, text: 'Year-Month' } },
                y: { stacked: true, title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}

export function renderGearGanttChart(runs, gearIdToName = {}) {
    // 1. Aggregate distance per gear per month
    const gearMonthKm = runs.reduce((acc, a) => {
        if (!a.gear_id) return acc;
        const gearKey = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearKey] = (acc[month][gearKey] || 0) + a.distance / 1000;
        return acc;
    }, {});

    // 2. Get all months between first and last activity
    const monthsSorted = runs.map(a => a.start_date_local.substring(0, 7)).sort();
    const firstMonth = monthsSorted[0];
    const lastMonth = monthsSorted[monthsSorted.length - 1];
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

    // 3. Get all gears
    const allGears = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    // 4. Build datasets, filling missing months with 0
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
    if (!runs || runs.length === 0) return;

    // 1. Aggregate distance per day (YYYY-MM-DD)
    const distanceByDay = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.distance ? act.distance / 1000 : 0);
        return acc;
    }, {});

    // 2. Get all days from first to last activity
    const allDays = Object.keys(distanceByDay).sort();
    const startDate = new Date(allDays[0]);
    const endDate = new Date(allDays[allDays.length - 1]);
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
    }

    // 3. Build daily distances (0 for days without activity)
    const dailyDistances = days.map(date => distanceByDay[date] || 0);

    // 4. Compute accumulated distance
    const accumulated = [];
    dailyDistances.reduce((acc, d, i) => accumulated[i] = acc + d, 0);

    createChart('accumulated-distance-chart', {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Accumulated Distance (km)',
                data: accumulated,
                borderColor: 'rgba(54,162,235,1)',
                pointRadius: 0,
                tension: 0.1
            }]
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
    if (!window.L || !window.L.heatLayer) {
        console.error("Leaflet.js o leaflet.heat no están cargados.");
        return;
    }

    const heatmapDiv = document.getElementById('runs-heatmap');
    if (!heatmapDiv) return;

    // Asegura tamaño visible
    heatmapDiv.style.width = '100%';
    heatmapDiv.style.height = '400px';

    // Extrae todos los puntos de inicio válidos
    const points = runs
        .map(act => act.start_latlng)
        .filter(latlng => Array.isArray(latlng) && latlng.length === 2 && latlng[0] && latlng[1]);

    if (points.length === 0) {
        heatmapDiv.innerHTML = '<p>No map data available for this period.</p>';
        if (runsHeatmapMap) {
            runsHeatmapMap.remove();
            runsHeatmapMap = null;
            runsHeatmapLayer = null;
        }
        return;
    }

    // Si ya hay un mapa, elimínalo completamente
    if (runsHeatmapMap) {
        runsHeatmapMap.remove();
        runsHeatmapMap = null;
        runsHeatmapLayer = null;
    }

    // Crea el mapa centrado en el primer punto
    runsHeatmapMap = L.map('runs-heatmap').setView(points[0], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(runsHeatmapMap);

    // Añade la capa de calor
    runsHeatmapLayer = L.heatLayer(points, { radius: 20, blur: 25, maxZoom: 11 }).addTo(runsHeatmapMap);

    // Ajusta la vista para mostrar todos los puntos
    if (points.length > 1) {
        runsHeatmapMap.fitBounds(points);
    }
}

export function renderGearMatrixGanttChart(runs, gearIdToName = {}) {
    // 1. Aggregate distance per gear per month 
    const gearMonthKm = {};
    runs.forEach(a => {
        if (!a.gear_id) return;
        const gearKey = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!gearMonthKm[gearKey]) gearMonthKm[gearKey] = {};
        gearMonthKm[gearKey][month] = (gearMonthKm[gearKey][month] || 0) + a.distance / 1000;
    });

    // 2. Get all months and all gears
    const allMonths = Array.from(new Set(runs.map(a => a.start_date_local.substring(0, 7)))).sort();
    const allGears = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    // DEBUG: log data
    console.log('runs:', runs);
    console.log('gearIdToName:', gearIdToName);
    console.log('allMonths:', allMonths);
    console.log('allGears:', allGears);

    if (!allMonths.length || !allGears.length) {
        const canvas = document.getElementById('gear-matrix-gantt');
        if (canvas) canvas.parentElement.innerHTML = '<p style="text-align:center;color:#888;">No gear data for this period.</p>';
        return;
    }

    // 3. Prepare matrix data for Chart.js Matrix
    const data = [];
    allGears.forEach((gear, yIdx) => {
        let acc = 0;
        allMonths.forEach((month, xIdx) => {
            const val = gearMonthKm[gear]?.[month] || 0;
            acc += val;
            data.push({
                x: month,
                y: gearIdToName[gear] || gear,
                v: val,
                acc: acc
            });
        });
    });

    // DEBUG: log matrix data
    console.log('Gear Matrix Data:', data);

    // 4. Create the chart
    const canvasId = 'gear-matrix-gantt';
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(canvas, {
        type: 'matrix',
        data: {
            labels: { x: allMonths, y: allGears.map(g => gearIdToName[g] || g) },
            datasets: [{
                label: 'Gear Usage (km)',
                data: data,
                backgroundColor: ctx => {
                    const v = ctx.raw.v;
                    if (v === 0) return '#ebedf0';
                    if (v < 10) return '#fcbba1';
                    if (v < 50) return '#fc9272';
                    if (v < 100) return '#fb6a4a';
                    return '#de2d26';
                },
                width: ({chart}) => Math.max(10, (chart.chartArea || {}).width / allMonths.length - 2),
                height: ({chart}) => Math.max(10, (chart.chartArea || {}).height / allGears.length - 2),
            }]
        },
        options: {
            plugins: {
                title: { display: true, text: 'Gear Usage Gantt (Matrix)' },
                tooltip: {
                    callbacks: {
                        title: ctx => `Gear: ${ctx[0].raw.y}, Month: ${ctx[0].raw.x}`,
                        label: ctx => `Distance: ${ctx.raw.v.toFixed(1)} km\nAccumulated: ${ctx.raw.acc.toFixed(1)} km`
                    }
                }
            },
            scales: {
                x: { type: 'category', labels: allMonths, title: { display: true, text: 'Month' } },
                y: { type: 'category', labels: allGears.map(g => gearIdToName[g] || g), title: { display: true, text: 'Gear' } }
            }
        }
    });
}
