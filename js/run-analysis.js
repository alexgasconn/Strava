// js/analysis.js
import * as utils from './utils.js';
import { calculateFitness, rollingMean as calculateRollingMean } from './utils.js';

function getGears() {
    return JSON.parse(localStorage.getItem('strava_gears') || '[]');
}

export function renderAnalysisTab(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    renderSummaryCards(runs);
    renderStreaks(runs);
    renderActivityTypeChart(runs);
    renderMonthlyDistanceChart(runs);
    renderPaceVsDistanceChart(runs);
    renderDistanceHistogram(runs);
    renderAccumulatedDistanceChart(runs);
    renderRollingMeanDistanceChart(runs);
    renderDistanceVsElevationChart(runs);
    renderElevationHistogram(runs);
    renderRunsHeatmap(runs);
    renderConsistencyChart(runs);
}

let charts = {};

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
    const container = document.getElementById('cal-heatmap');
    if (!container) return;

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.display = 'flex';
    container.style.justifyContent = 'center'; // CENTRAR
    container.style.alignItems = 'flex-start'; // alineación vertical al top

    // Wrapper interno para mantener la anchura del heatmap
    const heatmapWrapper = document.createElement('div');
    heatmapWrapper.style.display = 'inline-block';
    container.appendChild(heatmapWrapper);

    // Verificar disponibilidad de CalHeatmap
    if (typeof CalHeatmap === 'undefined') {
        heatmapWrapper.innerHTML = `<p style="text-align:center; color:#8c8c8c;">
            Heatmap no disponible en este dispositivo o navegador.
        </p>`;
        return;
    }

    if (!runs || runs.length === 0) {
        heatmapWrapper.innerHTML = `<p style="text-align:center; color:#8c8c8c;">
            No hay datos de actividad para este período.
        </p>`;
        return;
    }

    // Agregar datos y calcular umbrales
    const aggregatedData = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.distance ? act.distance / 1000 : 0);
        return acc;
    }, {});

    const kmValues = Object.values(aggregatedData).filter(v => v > 0).sort((a, b) => a - b);
    const thresholds = kmValues.length >= 5
        ? [
            kmValues[Math.floor(0.2 * kmValues.length)],
            kmValues[Math.floor(0.4 * kmValues.length)],
            kmValues[Math.floor(0.6 * kmValues.length)],
            kmValues[Math.floor(0.8 * kmValues.length)]
        ]
        : [2, 5, 10, 15];

    // Crear CalHeatmap con configuración correcta
    const cal = new CalHeatmap();
    const today = new Date();

    // Calcular el primer lunes del año
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const dayOfWeek = startOfYear.getDay(); // 0 = domingo, 1 = lunes, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysUntilMonday);

    cal.paint({
        itemSelector: heatmapWrapper, // usamos wrapper
        domain: {
            type: 'month',
            gutter: 4,
            label: { text: 'MMM', textAlign: 'center', position: 'top' } // centrado
        },
        subDomain: {
            type: 'day',
            width: 11,
            height: 11,
            gutter: 2,
            radius: 2,
            label: null
        },
        date: { start: firstMonday, locale: { weekStart: 1 } }, // Semana empieza en lunes
        range: 12, // 12 meses
        data: {
            source: Object.entries(aggregatedData).map(([date, value]) => ({
                date,
                value
            })),
            type: 'json',
            x: 'date',
            y: 'value'
        },
        scale: {
            color: {
                type: 'threshold',
                range: ['#ebedf0', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26'],
                domain: thresholds
            }
        }
    });

    // Agregar etiquetas de días de la semana (solo primera columna)
    setTimeout(() => {
        const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        const firstColumn = heatmapWrapper.querySelector('[data-week="1"]');

        if (firstColumn) {
            const days = firstColumn.querySelectorAll('[data-day]');
            days.forEach((day, idx) => {
                if (weekdayLabels[idx]) {
                    const label = document.createElement('span');
                    label.textContent = weekdayLabels[idx];
                    label.style.position = 'absolute';
                    label.style.left = '-12px';
                    label.style.fontSize = '9px';
                    label.style.color = '#767676';
                    day.style.position = 'relative';
                    day.appendChild(label);
                }
            });
        }
    }, 100);
}









export function renderActivityTypeChart(runs) {
    if (!runs || runs.length === 0) return;

    const p80Distance = [...runs].map(a => a.distance)
        .sort((a, b) => a - b)[Math.floor(0.8 * runs.length)];

    // Clasificación de cada actividad.
    runs.forEach(a => {
        if (a.sport_type === 'TrailRun') {
            a.workout_type_classified = 'Trail Run';
        } else if (a.workout_type !== 1 && a.distance >= p80Distance) {
            a.workout_type_classified = 'Long Run';
        } else if (a.workout_type === 1) {
            a.workout_type_classified = 'Race';
        }
        else if (a.suffer_score && a.suffer_score >= 50) {
            a.workout_type_classified = 'High intensity Run';
        }
        else if (a.suffer_score && a.suffer_score >= 30) {
            a.workout_type_classified = 'Moderate intensity Run';
        }
        else if (a.suffer_score && a.suffer_score < 15) {
            a.workout_type_classified = 'Low intensity Run';
        }
        else {
            a.workout_type_classified = 'Other';
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
                    label: 'Run',
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



export async function renderGearGanttChart(runs) {
    // 1. Obtener todos los IDs de gear usados
    const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    // 2. Si no hay gears, no hacemos nada
    if (gearIds.length === 0) return;

    // 3. Traer info detallada de cada gear
    let gearIdToName = {};
    try {
        const allGears = getGears();
        allGears.forEach(gear => {
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
                    label: 'Run',
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






export function renderRunsHeatmap(runs) {
    const mapDiv = document.getElementById("runs-heatmap");
    if (!mapDiv) return;

    // Set container size
    mapDiv.style.width = "100%";
    mapDiv.style.height = "400px";

    // Recolectar puntos (inicio y fin)
    const markerPoints = [];
    runs.forEach(run => {
        if (run.start_latlng?.length >= 2) {
            markerPoints.push({ lat: run.start_latlng[0], lng: run.start_latlng[1], type: "start" });
        }
        if (run.end_latlng?.length >= 2) {
            markerPoints.push({ lat: run.end_latlng[0], lng: run.end_latlng[1], type: "end" });
        }
    });

    if (markerPoints.length === 0) {
        mapDiv.innerHTML = `<p>No valid coordinates found. Runs: ${runs.length}</p>`;
        return;
    }

    // Eliminar mapa anterior si existe
    if (window.runsPointsMap) {
        window.runsPointsMap.remove();
        window.runsPointsMap = null;
    }
    mapDiv.innerHTML = "";

    // Inicializar mapa Leaflet
    if (typeof L !== "undefined") {
        const first = markerPoints[0];
        window.runsPointsMap = L.map(mapDiv).setView([first.lat, first.lng], 3);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(window.runsPointsMap);

        // Agregar marcadores
        markerPoints.forEach(p => {
            const color = p.type === "start" ? "green" : "red";
            L.circleMarker([p.lat, p.lng], {
                radius: 4,
                color,
                fillColor: color,
                fillOpacity: 0.8,
                weight: 1
            })
                .bindPopup(`${p.type === "start" ? "Start" : "End"} Point`)
                .addTo(window.runsPointsMap);
        });

        // Ajustar vista
        const bounds = markerPoints.map(p => [p.lat, p.lng]);
        if (bounds.length > 1) window.runsPointsMap.fitBounds(bounds);
    } else {
        mapDiv.innerHTML = `<p>Leaflet.js is required for map visualization.</p>`;
    }
}


function renderSummaryCards(runs) {
    const summaryContainer = document.getElementById('summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="card"><h3>Activities</h3><p>${runs.length}</p></div>
            <div class="card"><h3>Total Distance</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
            <div class="card"><h3>Total Time</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
            <div class="card"><h3>Total Elevation</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        `;
    }
}




function renderStreaks(runs) {
    const streaksInfo = document.getElementById('streaks-info');
    if (!streaksInfo) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const referenceDate = new Date(today);

    // --- UTILIDADES ---
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const [y, m, d] = dateStr.split('-');
        if (d) return `${d}/${m}/${y}`;
        if (m) return `${m}/${y}`;
        return dateStr;
    }

    function formatWeek(weekStr) {
        if (!weekStr) return '-';
        const [y, w] = weekStr.split('-W');
        return `W${w}/${y}`;
    }

    // Cálculo ISO Week más preciso
    function getISOWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return { year: d.getFullYear(), week: weekNo };
    }

    function getWeekString(date) {
        const { year, week } = getISOWeek(date);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }

    // Comparación precisa de fechas
    function daysBetween(date1Str, date2Str) {
        const d1 = new Date(date1Str);
        const d2 = new Date(date2Str);
        d1.setHours(0, 0, 0, 0);
        d2.setHours(0, 0, 0, 0);
        return Math.round((d2 - d1) / 86400000);
    }

    function weeksBetween(week1Str, week2Str) {
        const [y1, w1] = week1Str.split('-W').map(Number);
        const [y2, w2] = week2Str.split('-W').map(Number);

        // Convertir a días desde época y calcular semanas
        const date1 = getDateFromWeek(y1, w1);
        const date2 = getDateFromWeek(y2, w2);
        return Math.round((date2 - date1) / (7 * 86400000));
    }

    function getDateFromWeek(year, week) {
        const jan4 = new Date(year, 0, 4);
        const dayOffset = (week - 1) * 7;
        const weekStart = new Date(jan4);
        weekStart.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + dayOffset);
        return weekStart;
    }

    function monthsBetween(month1Str, month2Str) {
        const [y1, m1] = month1Str.split('-').map(Number);
        const [y2, m2] = month2Str.split('-').map(Number);
        return (y2 - y1) * 12 + (m2 - m1);
    }

    // Cálculo mejorado de rachas
    function calcStreaks(items, type) {
        if (items.length === 0) return { sorted: [], maxStreak: 0, maxStart: null, maxEnd: null };

        const sorted = Array.from(new Set(items)).sort();
        let maxStreak = 0, currentStreak = 0;
        let maxStart = null, maxEnd = null;
        let tempStart = null;

        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];

            if (currentStreak === 0) {
                currentStreak = 1;
                tempStart = item;
            } else {
                let diff = 0;
                const prev = sorted[i - 1];

                if (type === 'day') {
                    diff = daysBetween(prev, item);
                } else if (type === 'week') {
                    diff = weeksBetween(prev, item);
                } else if (type === 'month') {
                    diff = monthsBetween(prev, item);
                }

                if (diff === 1) {
                    currentStreak++;
                } else {
                    // Guardar racha anterior si es mejor
                    if (currentStreak > maxStreak) {
                        maxStreak = currentStreak;
                        maxStart = tempStart;
                        maxEnd = sorted[i - 1];
                    }
                    currentStreak = 1;
                    tempStart = item;
                }
            }
        }

        // Verificar última racha
        if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
            maxStart = tempStart;
            maxEnd = sorted[sorted.length - 1];
        }

        return { sorted, maxStreak, maxStart, maxEnd };
    }

    // Cálculo mejorado de racha actual
    function calcCurrentStreak(sorted, type) {
        if (sorted.length === 0) return { value: 0, start: null, end: null };

        let currentStreak = 0, start = null, end = null;

        // Obtener la referencia temporal (hoy o periodo actual)
        let checkDate;
        if (type === 'day') {
            checkDate = referenceDate.toISOString().slice(0, 10);
        } else if (type === 'week') {
            checkDate = getWeekString(referenceDate);
        } else if (type === 'month') {
            checkDate = referenceDate.toISOString().slice(0, 7);
        }

        // Buscar desde el final hacia atrás
        for (let i = sorted.length - 1; i >= 0; i--) {
            const item = sorted[i];
            let diff = 0;

            if (type === 'day') {
                diff = daysBetween(item, checkDate);
            } else if (type === 'week') {
                diff = weeksBetween(item, checkDate);
            } else if (type === 'month') {
                diff = monthsBetween(item, checkDate);
            }

            if (diff === 0) {
                // Encontramos el periodo actual/ayer
                if (currentStreak === 0) {
                    end = item;
                }
                currentStreak++;
                start = item;

                // Actualizar checkDate para buscar el periodo anterior
                if (type === 'day') {
                    const d = new Date(checkDate);
                    d.setDate(d.getDate() - 1);
                    checkDate = d.toISOString().slice(0, 10);
                } else if (type === 'week') {
                    const [y, w] = checkDate.split('-W').map(Number);
                    const prevDate = getDateFromWeek(y, w);
                    prevDate.setDate(prevDate.getDate() - 7);
                    checkDate = getWeekString(prevDate);
                } else if (type === 'month') {
                    let [y, m] = checkDate.split('-').map(Number);
                    m--;
                    if (m === 0) { m = 12; y--; }
                    checkDate = `${y}-${String(m).padStart(2, '0')}`;
                }
            } else if (diff > 0) {
                // Hay un gap, terminamos
                break;
            }
            // Si diff < 0, seguimos buscando hacia atrás
        }

        return { value: currentStreak, start, end };
    }

    // --- CALCULO DE RACHAS ---
    if (runs.length === 0) {
        streaksInfo.innerHTML = '<p>No hay carreras registradas aún.</p>';
        return;
    }

    // Días
    const dayItems = runs.map(r => r.start_date_local.substring(0, 10));
    const dayStreaks = calcStreaks(dayItems, 'day');
    const currentDay = calcCurrentStreak(dayStreaks.sorted, 'day');

    // Semanas (ISO)
    const weekItems = runs.map(r => {
        const d = new Date(r.start_date_local);
        return getWeekString(d);
    });
    const weekStreaks = calcStreaks(weekItems, 'week');
    const currentWeek = calcCurrentStreak(weekStreaks.sorted, 'week');

    // Meses
    const monthItems = runs.map(r => r.start_date_local.substring(0, 7));
    const monthStreaks = calcStreaks(monthItems, 'month');
    const currentMonth = calcCurrentStreak(monthStreaks.sorted, 'month');

    // --- RENDER ---
    streaksInfo.innerHTML = `
      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 250px;">
          <h4 style="margin-bottom: 1rem;">🏆 Best Historical Streak</h4>
          <div style="margin-bottom: 0.8rem;">
            <b>Consecutive Days:</b> ${dayStreaks.maxStreak || 0}
            ${dayStreaks.maxStart ? `<br><small style="color: #666;">${formatDate(dayStreaks.maxStart)} - ${formatDate(dayStreaks.maxEnd)}</small>` : ''}
          </div>
          <div style="margin-bottom: 0.8rem;">
            <b>Consecutive Weeks:</b> ${weekStreaks.maxStreak || 0}
            ${weekStreaks.maxStart ? `<br><small style="color: #666;">${formatWeek(weekStreaks.maxStart)} - ${formatWeek(weekStreaks.maxEnd)}</small>` : ''}
          </div>
          <div style="margin-bottom: 0.8rem;">
            <b>Consecutive Months:</b> ${monthStreaks.maxStreak || 0}
            ${monthStreaks.maxStart ? `<br><small style="color: #666;">${formatDate(monthStreaks.maxStart)} - ${formatDate(monthStreaks.maxEnd)}</small>` : ''}
          </div>
        </div>
        <div style="flex: 1; min-width: 250px;">
          <h4 style="margin-bottom: 1rem;">🔥 Current Streak</h4>
          <div style="margin-bottom: 0.8rem;">
            <b>Consecutive Days:</b> ${currentDay.value || 0}
            ${currentDay.start ? `<br><small style="color: #666;">${formatDate(currentDay.start)} - ${formatDate(currentDay.end)}</small>` : ''}
          </div>
          <div style="margin-bottom: 0.8rem;">
            <b>Consecutive Weeks:</b> ${currentWeek.value || 0}
            ${currentWeek.start ? `<br><small style="color: #666;">${formatWeek(currentWeek.start)} - ${formatWeek(currentWeek.end)}</small>` : ''}
          </div>
          <div style="margin-bottom: 0.8rem;">
            <b>Consecutive Months:</b> ${currentMonth.value || 0}
            ${currentMonth.start ? `<br><small style="color: #666;">${formatDate(currentMonth.start)} - ${formatDate(currentMonth.end)}</small>` : ''}
          </div>
        </div>
      </div>
    `;
}