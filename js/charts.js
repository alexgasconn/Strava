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

// export function renderConsistencyChart(runs) {
//     const heatmapContainer = document.getElementById('cal-heatmap');
//     if (!heatmapContainer) {
//         console.error("Heatmap container 'cal-heatmap' not found.");
//         return;
//     }

//     // 1. Manejo del caso sin datos: Si no hay carreras, muestra un mensaje y termina.
//     if (!runs || runs.length === 0) {
//         heatmapContainer.innerHTML = '<p style="text-align: center; color: #8c8c8c;">No activity data for this period.</p>';
//         return;
//     }

//     // 2. Agregación de datos: Sumamos la distancia total (en km) por día.
//     const aggregatedData = runs.reduce((acc, act) => {
//         const date = act.start_date_local.substring(0, 10);
//         acc[date] = (acc[date] || 0) + (act.distance ? act.distance / 1000 : 0);
//         return acc;
//     }, {});

//     // 3. Configuración del calendario (CalHeatmap)
//     const cal = new CalHeatmap();
//     heatmapContainer.innerHTML = ''; // Limpiamos el contenedor antes de dibujar

//     // 4. Determinamos el rango de fechas dinámicamente
//     const lastDateStr = runs.reduce((max, act) => act.start_date_local > max ? act.start_date_local : max, runs[0].start_date_local);
//     const lastDate = new Date(lastDateStr);

//     // La fecha de inicio del calendario será 365 días ANTES de la última actividad
//     const startDate = new Date(lastDate);
//     startDate.setDate(startDate.getDate() - 365);

//     // 5. Calculamos los umbrales de color en función de los datos (percentiles)
//     const kmValues = Object.values(aggregatedData).filter(v => v > 0).sort((a, b) => a - b);
//     // Si hay pocos datos, usamos valores fijos razonables
//     const thresholds = kmValues.length >= 5
//         ? [
//             kmValues[Math.floor(0.2 * kmValues.length)],
//             kmValues[Math.floor(0.4 * kmValues.length)],
//             kmValues[Math.floor(0.6 * kmValues.length)],
//             kmValues[Math.floor(0.8 * kmValues.length)]
//         ]
//         : [2, 5, 10, 15];

//     // 6. Renderizado del heatmap
//     cal.paint({
//         itemSelector: heatmapContainer,
//         domain: {
//             type: "month",
//             label: { text: "MMM", position: "bottom" },
//             paddding: 5
//         },
//         subDomain: {
//             type: "ghDay",
//             radius: 2,
//             width: 11,
//             height: 11,
//             gutter: 4
//         },
//         range: 12, // Muestra 12 meses
//         data: {
//             source: Object.entries(aggregatedData).map(([date, value]) => ({ date, value })),
//             x: 'date',
//             y: 'value'
//         },
//         scale: {
//             color: {
//                 type: 'threshold',
//                 range: ['#ebedf0', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26'],
//                 domain: thresholds
//             }
//         },
//         date: {
//             start: startDate // Usamos la fecha de inicio calculada
//         },
//         itemSelector: "#cal-heatmap",
//     });
// }

// export function renderActivityTypeChart(runs) {
//     if (!runs || runs.length === 0) return;

//     // Percentil 80 de distancia para considerar Long Run
//     const p80Distance = [...runs].map(a => a.distance)
//         .sort((a, b) => a - b)[Math.floor(0.8 * runs.length)];

//     // Clasificación de cada actividad
//     runs.forEach(a => {
//         if (a.sport_type === 'TrailRun') {
//             a.workout_type_classified = 'Trail Run';
//         } else if (a.average_heartrate && a.average_heartrate < 145) {
//             a.workout_type_classified = 'Easy Run';
//         } else if (a.workout_type !== 1 && a.distance >= p80Distance) {
//             a.workout_type_classified = 'Long Run';
//         } else if (a.workout_type === 1) {
//             a.workout_type_classified = 'Race';
//         } else {
//             a.workout_type_classified = 'Standard training';
//         }
//     });

//     // Contar por categoría
//     const workoutTypeCounts = {};
//     runs.forEach(a => {
//         const key = a.workout_type_classified;
//         workoutTypeCounts[key] = (workoutTypeCounts[key] || 0) + 1;
//     });

//     const workoutTypeLabels = Object.keys(workoutTypeCounts);
//     const workoutTypeData = workoutTypeLabels.map(label => workoutTypeCounts[label]);

//     createChart('activity-type-barchart', {
//         type: 'bar',
//         data: {
//             labels: workoutTypeLabels,
//             datasets: [{
//                 label: '# Activities',
//                 data: workoutTypeData,
//                 backgroundColor: 'rgba(252, 82, 0, 0.7)'
//             }]
//         },
//         options: {
//             indexAxis: 'y',
//             plugins: { legend: { display: false } }
//         }
//     });
// }


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

    // Calculate VO2max for each run
    const vo2maxData = runs
        .filter(act => act.average_heartrate && act.moving_time > 0 && act.distance > 0)
        .map(act => {
            const vel_m_min = (act.distance / act.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const vo2max = vo2_at_pace / (act.average_heartrate / USER_MAX_HR);
            return { date: act.start_date_local.substring(0, 10), vo2max };
        });

    // Group by week (ISO week)
    const weekMap = {};
    vo2maxData.forEach(({ date, vo2max }) => {
        const d = new Date(date);
        // ISO week calculation
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        const weekKey = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
        if (!weekMap[weekKey]) weekMap[weekKey] = [];
        weekMap[weekKey].push(vo2max);
    });

    // Find all weeks between first and last run
    const dates = vo2maxData.map(d => d.date).sort();
    if (dates.length === 0) return;
    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    const weeks = [];
    let d = new Date(firstDate);
    while (d <= lastDate) {
        // ISO week calculation
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        const weekKey = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
        if (!weeks.includes(weekKey)) weeks.push(weekKey);
        d.setUTCDate(d.getUTCDate() + 3); // Move to next week
        d.setUTCDate(d.getUTCDate() + 7);
    }

    // Build weekly averages, null if no data
    const weeklyAvg = weeks.map(week => {
        const arr = weekMap[week];
        return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    });

    // Tendencia: rolling mean muy general (window = 8 semanas)
    function rollingMean(arr, window) {
        const out = [];
        for (let i = 0; i < arr.length; i++) {
            let sum = 0, count = 0;
            for (let j = Math.max(0, i - window + 1); j <= i; j++) {
                if (arr[j] != null) {
                    sum += arr[j];
                    count++;
                }
            }
            out.push(count > 0 ? sum / count : null);
        }
        return out;
    }
    const trend = rollingMean(weeklyAvg, 8);

    createChart('vo2max-over-time', {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [
                {
                    label: 'Estimated VO₂max (weekly avg)',
                    data: weeklyAvg,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.3)',
                    tension: 0.2,
                    spanGaps: true,
                    fill: 'origin',
                },
                {
                    label: 'Tendencia (rolling mean)',
                    data: trend,
                    borderColor: 'rgba(252,82,0,0.2)',
                    backgroundColor: 'rgba(252,82,0,0.05)',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.3,
                    spanGaps: true,
                    hidden: false,
                    order: 0
                }
            ]
        },
        options: {
            scales: {
                y: { title: { display: true, text: 'VO₂max' } }
            }
        }
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
                { label: 'TSB (Form)', data: tsb, borderColor: '#2ECC40', fill: false, tension: 0.2, pointRadius: 0, hidden: true }
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
    if (!window.L) {
        console.error("Leaflet.js no está cargado.");
        return;
    }

    const heatmapDiv = document.getElementById('runs-heatmap');
    if (!heatmapDiv) return;

    heatmapDiv.style.width = '100%';
    heatmapDiv.style.height = '400px';

    const points = [];

    runs.forEach(run => {
        if (run.start_latlng && Array.isArray(run.start_latlng) &&
            run.start_latlng.length === 2 && run.start_latlng[0] && run.start_latlng[1]) {
            points.push([run.start_latlng[0], run.start_latlng[1], 1.0]);
        }

        if (run.end_latlng && Array.isArray(run.end_latlng) &&
            run.end_latlng.length === 2 && run.end_latlng[0] && run.end_latlng[1]) {
            points.push([run.end_latlng[0], run.end_latlng[1], 0.8]);
        }

        if (run.map && run.map.polyline) {
            try {
                const decodedPath = decodePolyline(run.map.polyline);
                decodedPath.forEach(point => {
                    points.push([point[0], point[1], 0.3]);
                });
            } catch (error) {
                // Silenciar error
            }
        }

        if (run.coordinates && Array.isArray(run.coordinates)) {
            run.coordinates.forEach(coord => {
                if (Array.isArray(coord) && coord.length >= 2) {
                    points.push([coord[0], coord[1], 0.5]);
                }
            });
        }
    });

    if (points.length === 0) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = `No valid coordinates found. Total runs: ${runs.length}`;
        heatmapDiv.appendChild(noDataMsg);

        if (window.runsHeatmapMap) {
            window.runsHeatmapMap.remove();
            window.runsHeatmapMap = null;
        }
        return;
    }

    if (window.runsHeatmapMap) {
        window.runsHeatmapMap.remove();
        window.runsHeatmapMap = null;
    }

    heatmapDiv.innerHTML = '';

    const firstPoint = points[0];
    window.runsHeatmapMap = L.map('runs-heatmap').setView([firstPoint[0], firstPoint[1]], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(window.runsHeatmapMap);

    const heatmapData = {
        max: 1.0,
        data: points.map(p => ({ lat: p[0], lng: p[1], count: p[2] }))
    };

    const cfg = {
        radius: 50,           // Aumentado para más "heat" visible
        blur: 20,             // Ajustado para difusión
        maxOpacity: 0.9,      // Opacidad máxima alta
        minOpacity: 0.2,      // Opacidad mínima baja para gradiente
        scaleRadius: true,    // Escala con zoom para mejor heatmap
        useLocalExtrema: true,// Extremos locales para mejor visibilidad en áreas dispersas
        latField: 'lat',
        lngField: 'lng',
        valueField: 'count',
        gradient: {
            0.1: 'blue',
            0.3: 'cyan',
            0.5: 'lime',
            0.7: 'yellow',
            0.9: 'orange',
            1.0: 'red'
        }
    };

    try {
        const heatmapLayer = new HeatmapOverlay(cfg);
        heatmapLayer.addTo(window.runsHeatmapMap);
        heatmapLayer.setData(heatmapData);

        setTimeout(() => {
            if (points.length > 0) {
                window.runsHeatmapMap.setView([points[0][0], points[0][1]], 13);
            }
        }, 500);

    } catch (error) {
        console.error("Error creando heatmap:", error);

        // Fallback mejorado: círculos más grandes para simular heat
        points.forEach(point => {
            L.circle([point[0], point[1]], {
                radius: 500,  // Radio en metros para más visibilidad
                color: 'red',
                fillColor: 'red',
                fillOpacity: 0.3,
                weight: 1
            }).addTo(window.runsHeatmapMap);
        });
    }

    if (points.length > 1) {
        const bounds = L.latLngBounds(points.map(p => [p[0], p[1]]));
        window.runsHeatmapMap.fitBounds(bounds, { padding: [50, 50] });
    }
}

export function decodePolyline(str, precision = 5) {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates = [];
    const factor = Math.pow(10, precision);

    while (index < str.length) {
        let byte = null;
        let shift = 0;
        let result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const deltaLat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lat += deltaLat;

        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const deltaLng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lng += deltaLng;

        coordinates.push([lat / factor, lng / factor]);
    }

    return coordinates;
}