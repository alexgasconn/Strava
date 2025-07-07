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
    
    // 2. Agregación de datos enriquecida: Sumamos distancia, contamos actividades y tipos por día
    const aggregatedData = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        if (!acc[date]) {
            acc[date] = {
                distance: 0,
                count: 0,
                types: new Set(),
                activities: []
            };
        }
        acc[date].distance += act.distance ? act.distance / 1000 : 0;
        acc[date].count += 1;
        if (act.type) acc[date].types.add(act.type);
        acc[date].activities.push(act);
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
    const kmValues = Object.values(aggregatedData)
        .map(day => day.distance)
        .filter(v => v > 0)
        .sort((a, b) => a - b);
    
    // Si hay pocos datos, usamos valores fijos razonables
    const thresholds = kmValues.length >= 5
        ? [
            kmValues[Math.floor(0.2 * kmValues.length)],
            kmValues[Math.floor(0.4 * kmValues.length)],
            kmValues[Math.floor(0.6 * kmValues.length)],
            kmValues[Math.floor(0.8 * kmValues.length)]
        ]
        : [2, 5, 10, 15];

    // 6. Preparamos datos para CalHeatmap con información enriquecida
    const heatmapData = Object.entries(aggregatedData).map(([date, dayData]) => ({
        date,
        value: dayData.distance,
        count: dayData.count,
        types: Array.from(dayData.types).join(', ')
    }));

    // 7. Renderizado del heatmap mejorado
    cal.paint({
        itemSelector: "#cal-heatmap",
        domain: { 
            type: "month", 
            label: { 
                text: (timestamp) => {
                    const date = new Date(timestamp);
                    const month = date.toLocaleDateString('en', { month: 'short' });
                    const year = date.getFullYear().toString().slice(-2);
                    return `${month} '${year}`;
                }, 
                position: "bottom" 
            },
            padding: [0, 10, 0, 10]
        },
        subDomain: { 
            type: "ghDay", 
            radius: 2, 
            width: 11, 
            height: 11,
            gutter: 4,
            label: (timestamp) => {
                const date = new Date(timestamp);
                return date.getDate();
            }
        },
        range: 12, // Muestra 12 meses
        data: { 
            source: heatmapData, 
            x: 'date', 
            y: 'value' 
        },
        scale: { 
            color: { 
                type: 'threshold', 
                range: ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'], 
                domain: thresholds
            } 
        },
        date: { 
            start: startDate
        },
        // Tooltip enriquecido con información detallada
        tooltip: {
            text: function(date, value, dayjsDate) {
                const dateStr = dayjsDate.format('YYYY-MM-DD');
                const dayData = aggregatedData[dateStr];
                
                if (!dayData) {
                    return `${dayjsDate.format('dddd, MMM D, YYYY')}<br/>No activities`;
                }
                
                const dayName = dayjsDate.format('dddd');
                const weekOfYear = Math.ceil(dayjsDate.dayOfYear() / 7);
                
                let tooltipText = `<strong>${dayName}, ${dayjsDate.format('MMM D, YYYY')}</strong><br/>`;
                tooltipText += `<strong>${dayData.distance.toFixed(1)} km</strong> in ${dayData.count} activit${dayData.count === 1 ? 'y' : 'ies'}<br/>`;
                
                if (dayData.types.size > 0) {
                    tooltipText += `Types: ${Array.from(dayData.types).join(', ')}<br/>`;
                }
                
                tooltipText += `Week ${weekOfYear} of ${dayjsDate.format('YYYY')}`;
                
                return tooltipText;
            }
        }
    });

    // 8. Añadimos etiquetas de días de la semana
    setTimeout(() => {
        const calElement = document.querySelector('#cal-heatmap .cal-heatmap-container');
        if (calElement) {
            const weekdayLabels = document.createElement('div');
            weekdayLabels.style.cssText = `
                position: absolute;
                left: -40px;
                top: 20px;
                font-size: 11px;
                color: #666;
                line-height: 15px;
            `;
            weekdayLabels.innerHTML = `
                <div style="height: 15px;">M</div>
                <div style="height: 15px;"></div>
                <div style="height: 15px;">W</div>
                <div style="height: 15px;"></div>
                <div style="height: 15px;">F</div>
                <div style="height: 15px;"></div>
                <div style="height: 15px;">S</div>
            `;
            calElement.style.position = 'relative';
            calElement.appendChild(weekdayLabels);
        }
    }, 100);

    // 9. Añadimos leyenda mejorada
    setTimeout(() => {
        const legend = document.createElement('div');
        legend.style.cssText = `
            margin-top: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-size: 12px;
            color: #666;
        `;
        
        legend.innerHTML = `
            <span>Less</span>
            <div style="display: flex; gap: 2px;">
                <div style="width: 11px; height: 11px; background: #ebedf0; border-radius: 2px;"></div>
                <div style="width: 11px; height: 11px; background: #c6e48b; border-radius: 2px;"></div>
                <div style="width: 11px; height: 11px; background: #7bc96f; border-radius: 2px;"></div>
                <div style="width: 11px; height: 11px; background: #239a3b; border-radius: 2px;"></div>
                <div style="width: 11px; height: 11px; background: #196127; border-radius: 2px;"></div>
            </div>
            <span>More</span>
            <span style="margin-left: 20px; font-size: 11px;">
                Thresholds: ${thresholds.map(t => t.toFixed(1)).join(', ')} km
            </span>
        `;
        
        heatmapContainer.appendChild(legend);
    }, 100);
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
    // Constantes configurables
    const USER_MAX_HR = 195;
    const HR_INTERCEPT = 218.29;
    const HR_COEF_DISTANCE = 0.73;
    const HR_COEF_PACE = -14.73;
    const HR_MIN = 100;
    const HR_MAX = 200;
    const ROLLING_WINDOW = 3; // meses
    const DECAY_PER_MONTH = 0.075; // VO2max se reduce 0.05 por mes de antigüedad

    // Cache de actividades válidas con HR y VO2 calculados
    const validActs = [];

    // Fecha de hoy para calcular antigüedad
    const today = new Date();

    // Un solo bucle: estimación de HR, filtro y cálculo de VO2
    for (const act of runs) {
        if (act.distance > 0 && act.moving_time > 0) {
            // Aseguramos average_heartrate
            if (!act.average_heartrate) {
                const distance_km = act.distance / 1000;
                const pace_min_per_km = (act.moving_time / 60) / distance_km;
                let hr = Math.round(
                    HR_INTERCEPT
                    + HR_COEF_DISTANCE * distance_km
                    + HR_COEF_PACE * pace_min_per_km
                );
                // Imponer rango
                act.average_heartrate = Math.min(HR_MAX, Math.max(HR_MIN, hr));
            }

            // Cálculo básico de VO₂ en el momento
            const vel_m_min = (act.distance / act.moving_time) * 60;
            const vo2_at_pace = vel_m_min * 0.2 + 3.5;
            let vo2max = vo2_at_pace / (act.average_heartrate / USER_MAX_HR);

            // Aplicar decay por antigüedad en meses
            const actDate = new Date(act.start_date_local);
            const monthsOld = 
                (today.getFullYear() - actDate.getFullYear()) * 12
                + (today.getMonth() - actDate.getMonth());
            vo2max = vo2max - (monthsOld * DECAY_PER_MONTH);

            validActs.push({
                yearMonth: act.start_date_local.slice(0, 7),
                vo2max
            });
        }
    }

    // Generar lista de todos los meses
    const allMonths = (() => {
        if (!validActs.length) return [];
        const months = validActs.map(d => d.yearMonth);
        const sorted = Array.from(new Set(months)).sort();
        const [startY, startM] = sorted[0].split('-').map(Number);
        const [endY, endM] = sorted[sorted.length - 1].split('-').map(Number);
        const result = [];
        let y = startY, m = startM;
        while (y < endY || (y === endY && m <= endM)) {
            result.push(`${y}-${String(m).padStart(2, '0')}`);
            m++;
            if (m > 12) { m = 1; y++; }
        }
        return result;
    })();

    // Agrupar y promediar por mes
    const byMonth = validActs.reduce((acc, {yearMonth, vo2max}) => {
        (acc[yearMonth] = acc[yearMonth] || []).push(vo2max);
        return acc;
    }, {});
    const monthlyAvg = allMonths.map(m =>
        byMonth[m]
            ? byMonth[m].reduce((a, b) => a + b, 0) / byMonth[m].length
            : null
    );

    // Rolling mean
    const rolling = monthlyAvg.map((_, i) => {
        const window = monthlyAvg
            .slice(Math.max(0, i - (ROLLING_WINDOW - 1)), i + 1)
            .filter(v => v != null);
        return window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
    });

    // Render
    createChart('vo2max-over-time', {
        type: 'line',
        data: {
            labels: allMonths,
            datasets: [{
                label: `${ROLLING_WINDOW}-month rolling VO₂max`,
                data: rolling,
                borderColor: 'rgba(54, 162, 235, 1)',
                tension: 0.2,
                spanGaps: true
            }]
        },
        options: {
            scales: {
                y: { title: { display: true, text: 'VO₂max' } }
            }
        }
    });
}


export function renderFitnessChart(runs) {

    // Primero, rellenamos suffer_score si falta o es 0
    runs.forEach(act => {
        if ((!act.suffer_score || act.suffer_score === 0) && act.moving_time > 0) {
            // Estimación simple si falta suffer_score
            const sufferScorePerMinute = 30 * (1 + (Math.random() - 0.5) * 0.2);
            act.suffer_score = Math.round((act.moving_time / 60) * sufferScorePerMinute);
        }
    });

    // Ahora agregamos el esfuerzo por día usando solo suffer_score
    const effortByDay = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        const effort = act.suffer_score ?? 0;
        acc[date] = (acc[date] || 0) + effort;
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
                { label: 'ATL (Fatigue)', data: atl, borderColor: 'rgba(252, 82, 0, 0.3)', fill: false, tension: 0.2, pointRadius: 0 },
                { label: 'CTL (Fitness)', data: ctl, borderColor: 'rgba(0, 116, 217, 0.6)', fill: true, backgroundColor: 'rgba(0,116,217,0.15)', tension: 0.2, pointRadius: 0 },
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
        if (!acc[gearKey]) acc[gearKey] = {};
        acc[gearKey][month] = (acc[gearKey][month] || 0) + a.distance / 1000;
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

    // 4. Build datasets - one dataset per month (columns), with gears as labels (rows)
    const datasets = allMonths.map((month, idx) => ({
        label: month,
        data: allGears.map(gearId => gearMonthKm[gearId]?.[month] || 0),
        backgroundColor: `hsl(${(idx * 360 / allMonths.length)}, 70%, 60%)`
    }));

    createChart('gear-gantt-chart', {
        type: 'bar',
        data: { 
            labels: allGears.map(gearId => gearIdToName[gearId] || gearId), // Gears as row labels
            datasets 
        },
        options: {
            indexAxis: 'y', // Horizontal bars (gears on Y-axis)
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Gear Usage Over Time (Gantt Chart)'
                }
            },
            scales: {
                x: { 
                    stacked: true, 
                    title: { display: true, text: 'Distance (km)' } 
                },
                y: { 
                    stacked: true, 
                    title: { display: true, text: 'Gear' } 
                }
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
