// js/charts.js
import { calculateFitness, rollingMean as calculateRollingMean } from './utils.js';
import { fetchGearById } from './api.js'; // o donde esté definida

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

    if (!runs || runs.length === 0) {
        heatmapContainer.innerHTML = '<p style="text-align: center; color: #8c8c8c;">No activity data for this period.</p>';
        return;
    }

    // Aggregate distance per day (km)
    const aggregatedData = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.distance ? act.distance / 1000 : 0);
        return acc;
    }, {});

    // Find last activity date
    const lastDateStr = runs.reduce((max, act) => act.start_date_local > max ? act.start_date_local : max, runs[0].start_date_local);
    const lastDate = new Date(lastDateStr);
    const startDate = new Date(lastDate);
    startDate.setDate(startDate.getDate() - 365);

    // Color thresholds
    const kmValues = Object.values(aggregatedData).filter(v => v > 0).sort((a, b) => a - b);
    const thresholds = kmValues.length >= 5
        ? [
            kmValues[Math.floor(0.2 * kmValues.length)],
            kmValues[Math.floor(0.4 * kmValues.length)],
            kmValues[Math.floor(0.6 * kmValues.length)],
            kmValues[Math.floor(0.8 * kmValues.length)]
        ]
        : [2, 5, 10, 15];

    // Render heatmap WITHOUT weekday or year labels inside the cells
    const cal = new CalHeatmap();
    heatmapContainer.innerHTML = '';

    cal.paint({
        itemSelector: heatmapContainer,
        domain: {
            type: "month",
            label: null, // No label inside domain (no year/month in grid)
            gutter: 8
        },
        subDomain: {
            type: "ghDay",
            radius: 2,
            width: 11,
            height: 11,
            gutter: 4,
            label: null // No weekday label inside cells
        },
        range: 12,
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
            start: startDate
        }
    });

    // Add weekday axis (left) and year axis (top) outside the grid
    // Weekday axis
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let weekdayAxis = document.createElement('div');
    weekdayAxis.style.display = 'flex';
    weekdayAxis.style.flexDirection = 'column';
    weekdayAxis.style.justifyContent = 'center';
    weekdayAxis.style.alignItems = 'flex-end';
    weekdayAxis.style.position = 'absolute';
    weekdayAxis.style.left = '0';
    weekdayAxis.style.top = '32px';
    weekdayAxis.style.height = 'calc(7 * 15px)';
    weekdayAxis.style.zIndex = '2';
    weekdayAxis.style.pointerEvents = 'none';
    weekdayAxis.style.fontSize = '11px';
    weekdayAxis.style.lineHeight = '15px';
    weekdayAxis.style.fontFamily = 'sans-serif';
    weekdayAxis.style.userSelect = 'none';
    weekdays.forEach(wd => {
        let label = document.createElement('div');
        label.textContent = wd;
        label.style.height = '15px';
        label.style.textAlign = 'right';
        label.style.color = '#888';
        weekdayAxis.appendChild(label);
    });

    // Year axis (top)
    const months = [];
    let d = new Date(startDate);
    for (let i = 0; i < 12; i++) {
        months.push(new Date(d.getFullYear(), d.getMonth(), 1));
        d.setMonth(d.getMonth() + 1);
    }
    let yearAxis = document.createElement('div');
    yearAxis.style.display = 'flex';
    yearAxis.style.flexDirection = 'row';
    yearAxis.style.justifyContent = 'center';
    yearAxis.style.alignItems = 'flex-end';
    yearAxis.style.position = 'absolute';
    yearAxis.style.left = '40px';
    yearAxis.style.top = '0';
    yearAxis.style.zIndex = '2';
    yearAxis.style.pointerEvents = 'none';
    yearAxis.style.fontSize = '12px';
    yearAxis.style.fontFamily = 'sans-serif';
    yearAxis.style.userSelect = 'none';

    months.forEach((date, idx) => {
        let label = document.createElement('div');
        label.style.width = '40px';
        label.style.textAlign = 'center';
        label.style.color = '#444';
        if (date.getMonth() === 0) {
            label.textContent = date.getFullYear();
            label.style.fontWeight = 'bold';
        } else {
            label.textContent = date.toLocaleString('en', { month: 'short' });
        }
        yearAxis.appendChild(label);
    });

    // Wrap heatmap in a relative container to position axes
    if (!heatmapContainer.parentElement.classList.contains('cal-heatmap-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'cal-heatmap-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.paddingLeft = '32px';
        wrapper.style.paddingTop = '22px';
        heatmapContainer.parentElement.insertBefore(wrapper, heatmapContainer);
        wrapper.appendChild(heatmapContainer);
    }
    const wrapper = heatmapContainer.parentElement;

    // Remove previous axes if any
    Array.from(wrapper.querySelectorAll('.cal-heatmap-axis')).forEach(el => el.remove());

    weekdayAxis.classList.add('cal-heatmap-axis');
    yearAxis.classList.add('cal-heatmap-axis');
    wrapper.appendChild(weekdayAxis);
    wrapper.appendChild(yearAxis);
}




export function renderActivityTypeChart(runs) {
    if (!runs || runs.length === 0) return;

    // Percentil 70 de distancia para considerar Long Run
    const p70Distance = [...runs].map(a => a.distance)
        .sort((a, b) => a - b)[Math.floor(0.7 * runs.length)];

    // Clasificación de cada actividad.
    runs.forEach(a => {
        if (a.sport_type === 'TrailRun') {
            a.workout_type_classified = 'Trail Run';
        } else if (a.average_heartrate && a.average_heartrate < 145) {
            a.workout_type_classified = 'Easy/Recovery Run';
        } else if (a.workout_type !== 1 && a.distance >= p70Distance) {
            a.workout_type_classified = 'Long Run';
        } else if (a.workout_type === 1) {
            a.workout_type_classified = 'Race';
        } else if (a.average_heartrate && a.average_heartrate > 165) {
            a.workout_type_classified = 'Intervals/Intense Run';
        } else {
            a.workout_type_classified = 'Other Workout/Unclassified';
        }
    });

    // Contar por categoría
    const workoutTypeCounts = {};
    runs.forEach(a => {
        const key = a.workout_type_classified;
        workoutTypeCounts[key] = (workoutTypeCounts[key] || 0) + 1;
    });

    const workoutTypeLabels = Object.keys(workoutTypeCounts);
    const workoutTypeData = workoutTypeLabels.map(label => workoutTypeCounts[label]);

    createChart('activity-type-barchart', {
        type: 'bar',
        data: {
            labels: workoutTypeLabels,
            datasets: [{
                label: '# Activities',
                data: workoutTypeData,
                backgroundColor: 'rgba(252, 82, 0, 0.7)'
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } }
        }
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
                {
                    type: 'bar',
                    label: 'Distance (km)',
                    data: monthlyDistances,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                    borderColor: '#FC5200',
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: '# Runs',
                    data: monthlyCounts,
                    borderColor: 'rgba(54,162,235,1)',
                    backgroundColor: 'rgba(54,162,235,0.25)',
                    fill: false,
                    yAxisID: 'y1',
                    tension: 0.2,
                    pointRadius: 3,
                    hidden: true
                }
            ]
        },
        options: {
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Distance (km)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: '# Runs' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

export function renderPaceVsDistanceChart(runs) {
    // Prepare datasets for each category
    const generalData = [];
    const raceData = [];
    const trailData = [];

    runs.forEach(r => {
        if (!r.distance || !r.moving_time) return;
        const point = {
            x: r.distance / 1000,
            y: (r.moving_time / 60) / (r.distance / 1000) // Pace in min/km
        };
        if (r.workout_type === 1) {
            raceData.push(point);
        } else if (r.sport_type === 'TrailRun') {
            trailData.push(point);
        } else {
            generalData.push(point);
        }
    });

    createChart('pace-vs-distance-chart', {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'General Training',
                    data: generalData,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                    pointStyle: 'circle'
                },
                {
                    label: 'Race',
                    data: raceData,
                    backgroundColor: 'rgba(199, 164, 4, 0.9)',
                    pointStyle: 'rectRot'
                },
                {
                    label: 'Trail Run',
                    data: trailData,
                    backgroundColor: 'rgba(93, 22, 1, 0.98)',
                    pointStyle: 'circle'
                }
            ]
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
                    label: 'Evolution',
                    data: trend,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.3)',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: 'origin',
                    tension: 0.3,
                    spanGaps: true,
                    order: 1
                },
                {
                    label: 'Estimated VO₂max (weekly avg)',
                    data: weeklyAvg,
                    borderColor: 'rgba(6, 205, 250, 0.2)',
                    backgroundColor: 'rgba(16, 144, 235, 0.05)',
                    tension: 0.2,
                    spanGaps: true,
                    fill: false,
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


export async function renderGearGanttChart(runs) {
    // 1. Obtener todos los IDs de gear usados
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    // 2. Si no hay gears, no hacemos nada
    if (gearIds.length === 0) return;

    // 3. Traer info detallada de cada gear
    let gearIdToName = {};
    try {
        const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
        results.forEach(result => {
            const gear = result.gear;
            gearIdToName[gear.id] = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ');
        });
    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        return;
    }

    // 4. Agregar distancia por gear por mes
    const gearMonthKm = runs.reduce((acc, a) => {
        if (!a.gear_id) return acc;
        const gearKey = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearKey] = (acc[month][gearKey] || 0) + a.distance / 1000;
        return acc;
    }, {});

    // 5. Rango de meses
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

    // 6. Todos los gears
    const allGears = gearIds;

    // 7. Construir datasets
    const datasets = allGears.map((gearId, idx) => ({
        label: gearIdToName[gearId] || gearId,
        data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
        backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 60%)`
    }));

    // 8. Crear gráfico
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
    // Separate data for trail and non-trail runs
    const trailData = [];
    const roadData = [];
    runs.forEach(r => {
        const point = {
            x: r.distance / 1000,
            y: r.total_elevation_gain || 0
        };
        if (r.sport_type === 'TrailRun') {
            trailData.push(point);
        } else {
            roadData.push(point);
        }
    });

    createChart('distance-vs-elevation-chart', {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Trail Run',
                    data: trailData,
                    backgroundColor: 'rgba(174, 59, 2, 0.87)'
                },
                {
                    label: 'Other Runs',
                    data: roadData,
                    backgroundColor: 'rgba(245, 131, 0, 0.78)'
                }
            ]
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














export function renderRunsHeatmap(runs, { showHeatmap = true, showPoints = false } = {}) {
    const heatmapDiv = document.getElementById("runs-heatmap");
    if (!heatmapDiv) return;

    // Set container size
    heatmapDiv.style.width = "100%";
    heatmapDiv.style.height = "400px";

    // Prepare data
    const heatPoints = [];
    const markerPoints = [];
    runs.forEach(run => {
        if (run.start_latlng?.length >= 2) {
            if (showHeatmap) heatPoints.push([run.start_latlng[0], run.start_latlng[1], 1.0]);
            if (showPoints) markerPoints.push({ lat: run.start_latlng[0], lng: run.start_latlng[1], type: "start" });
        }
        if (run.end_latlng?.length >= 2) {
            if (showHeatmap) heatPoints.push([run.end_latlng[0], run.end_latlng[1], 0.8]);
            if (showPoints) markerPoints.push({ lat: run.end_latlng[0], lng: run.end_latlng[1], type: "end" });
        }
        if (showHeatmap && run.map?.polyline) {
            try {
                const decoded = decodePolyline(run.map.polyline);
                decoded.forEach(p => heatPoints.push([p[0], p[1], 0.4]));
            } catch (e) {
                console.warn("Polyline decode failed:", e);
            }
        }
        if (showHeatmap && Array.isArray(run.coordinates)) {
            run.coordinates.forEach(c => {
                if (c.length >= 2) heatPoints.push([c[0], c[1], 0.5]);
            });
        }
    });

    if (!showHeatmap && markerPoints.length === 0) {
        heatmapDiv.innerHTML = `<p>No valid coordinates found. Runs: ${runs.length}</p>`;
        return;
    }
    if (showHeatmap && heatPoints.length === 0) {
        heatmapDiv.innerHTML = `<p>No valid coordinates found. Runs: ${runs.length}</p>`;
        return;
    }

    // Remove previous map instance if exists
    if (runsHeatmapMap) {
        runsHeatmapMap.remove();
        runsHeatmapMap = null;
        runsHeatmapLayer = null;
    }
    heatmapDiv.innerHTML = "";

    // Use Leaflet if available
    if (typeof L !== "undefined" && L.heatLayer) {
        // Center map on first point or default
        let center = [0, 0];
        if (showHeatmap && heatPoints.length > 0) {
            center = [heatPoints[0][0], heatPoints[0][1]];
        } else if (markerPoints.length > 0) {
            center = [markerPoints[0].lat, markerPoints[0].lng];
        }
        runsHeatmapMap = L.map(heatmapDiv).setView(center, 2);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(runsHeatmapMap);

        if (showHeatmap && heatPoints.length > 0) {
            runsHeatmapLayer = L.heatLayer(heatPoints, {
                radius: 15,
                blur: 20,
                maxZoom: 17
            }).addTo(runsHeatmapMap);
        }

        if (showPoints && markerPoints.length > 0) {
            markerPoints.forEach(p => {
                const color = p.type === "start" ? "green" : "red";
                L.circleMarker([p.lat, p.lng], {
                    radius: 4,
                    color,
                    fillColor: color,
                    fillOpacity: 0.8,
                    weight: 1
                }).addTo(runsHeatmapMap);
            });
        }

        // Fit bounds if possible
        const allLatLngs = [
            ...(showHeatmap ? heatPoints.map(p => [p[0], p[1]]) : []),
            ...(showPoints ? markerPoints.map(p => [p.lat, p.lng]) : [])
        ];
        if (allLatLngs.length > 1) {
            runsHeatmapMap.fitBounds(allLatLngs);
        }

    } else {
        // Fallback: just show a message
        heatmapDiv.innerHTML = `<p>Leaflet.js is required for map visualization.</p>`;
    }
}
