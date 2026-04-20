// js/swim-analysis.js
import * as utils from './utils.js';

let charts = {};

// ------------------------
// SWIM TYPE & COLORS
// ------------------------

const swimColors = {
    pool: "#56b5f8",
    openwater: "#3204d4"
};

function getSwimType(a) {
    if (a.trainer === true) return "pool";
    if (a.start_latlng?.length === 2) return "openwater";
    return "pool";
}

function paceSecPer100m(act) {
    if (!act.distance || !act.moving_time) return null;
    return act.moving_time / (act.distance / 100);
}

function paceMinPer100m(act) {
    const sec = paceSecPer100m(act);
    if (!sec) return null;
    return sec / 60;
}



// ------------------------
// POOL / YARD LENGTH ESTIMATION
// ------------------------

const POOL_LENGTHS = [20, 25, 50, "25yd", "50yd"];

// Tiempo realista por largo (segundos)
function realisticLengthTime(poolLength, timePerLength) {
    switch (poolLength) {
        case 20: return timePerLength >= 15 && timePerLength <= 35;
        case 25: return timePerLength >= 18 && timePerLength <= 45;
        case 50: return timePerLength >= 35 && timePerLength <= 120;
        case "25yd": return timePerLength >= 15 && timePerLength <= 40;
        case "50yd": return timePerLength >= 35 && timePerLength <= 120;
        default: return false;
    }
}

function estimatePoolLength(activity, historicalCounts = {}) {
    if (!activity.distance || !activity.moving_time) return null;

    // candidatos divisibles
    let candidates = POOL_LENGTHS.filter(p => {
        if (typeof p === "number") return activity.distance % p === 0;
        if (p === "25yd") return activity.distance % 23 === 0; // aprox 25yd en metros
        if (p === "50yd") return activity.distance % 46 === 0; // aprox 50yd en metros
        return false;
    });

    if (!candidates.length) return null;

    // filtrar por tiempo por largo realista
    candidates = candidates.filter(p => {
        const lengths = activity.distance / (typeof p === "number" ? p : (p === "25yd" ? 23 : 46));
        const timePerLength = activity.moving_time / lengths;
        return realisticLengthTime(p, timePerLength);
    });

    if (candidates.length === 1) return candidates[0];

    if (candidates.length > 1) {
        // usar frecuencia histórica
        candidates.sort((a, b) => (historicalCounts[b] || 0) - (historicalCounts[a] || 0));
        return candidates[0];
    }

    return null; // ninguno válido
}




// ------------------------
// MAIN ENTRY
// ------------------------

export function renderSwimAnalysisTab(allActivities, dateFilterFrom, dateFilterTo) {

    const filteredActivities =
        utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);

    const swims = filteredActivities.filter(a =>
        a.type === "Swim" ||
        a.sport_type === "Swim" ||
        a.sport_type === "PoolSwim" ||
        a.sport_type === "OpenWaterSwim"
    );

    console.log("Rendering swim analysis for", swims.length, "swims");

    if (!swims.length) return;

    // calcular frecuencias de longitudes en todo el dataset
    const historicalCounts = { 20: 0, 25: 0, 50: 0, "25yd": 0, "50yd": 0 };

    swims.forEach(a => {

        if (getSwimType(a) !== "pool") return;

        const candidates = POOL_LENGTHS.filter(p => a.distance && a.distance % p === 0);

        if (candidates.length === 1) {
            historicalCounts[candidates[0]]++;
        }

    });

    const enriched = swims.map(a => {

        const swimType = getSwimType(a);

        const poolLength =
            swimType === "pool"
                ? estimatePoolLength(a, historicalCounts)
                : null;

        return {
            ...a,
            distance_km: a.distance ? a.distance / 1000 : 0,
            pace_sec100: paceSecPer100m(a),
            pace_min100: paceMinPer100m(a),
            swim_type: swimType,
            moving_ratio: a.elapsed_time ? (a.moving_time || 0) / a.elapsed_time : 1,
            pool_length: poolLength
        };
    });

    renderSummaryCards(enriched);
    renderPoolVsOpenWaterSummary(enriched);

    renderDistanceHistogram(enriched);
    renderPaceHistogram(enriched);

    renderPaceVsDistanceChart(enriched);

    renderTopSwims(enriched);
    renderSwimsTable(enriched);

    renderConsistencyChart(enriched, dateFilterFrom, dateFilterTo);

    renderPoolLengthChart(enriched);

    renderAccumulatedDistanceChart(enriched);
    renderWeeklyDistanceTrendChart(enriched);
}

function buildWeeklyDistanceSeries(activities, distanceGetter) {
    const weeklyTotals = {};
    const parseLocalDate = (isoDateLike) => {
        const datePart = String(isoDateLike).substring(0, 10);
        const [y, m, d] = datePart.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    };
    const toLocalDateKey = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    activities.forEach(activity => {
        if (!activity?.start_date_local) return;

        const date = parseLocalDate(activity.start_date_local);
        if (Number.isNaN(date.getTime())) return;

        const weekStart = new Date(date);
        const daysSinceMonday = (weekStart.getDay() + 6) % 7;
        weekStart.setDate(weekStart.getDate() - daysSinceMonday);
        weekStart.setHours(0, 0, 0, 0);

        const key = toLocalDateKey(weekStart);
        const km = Number(distanceGetter(activity)) || 0;
        weeklyTotals[key] = (weeklyTotals[key] || 0) + km;
    });

    const weekStarts = Object.keys(weeklyTotals).sort();
    if (weekStarts.length === 0) {
        return { labels: [], weeklyKm: [] };
    }

    const labels = [];
    const weeklyKm = [];
    const firstWeek = parseLocalDate(weekStarts[0]);
    const lastWeek = parseLocalDate(weekStarts[weekStarts.length - 1]);

    for (let d = new Date(firstWeek); d <= lastWeek; d.setDate(d.getDate() + 7)) {
        const key = toLocalDateKey(d);
        labels.push(key);
        weeklyKm.push(+((weeklyTotals[key] || 0).toFixed(2)));
    }

    return { labels, weeklyKm };
}

// ------------------------
// CHART UTILITY
// ------------------------

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (charts[canvasId]) charts[canvasId].destroy();

    // Ensure charts are responsive and maintain aspect ratio
    if (!config.options) config.options = {};
    config.options.responsive = true;
    config.options.maintainAspectRatio = true;

    const ctx = canvas.getContext("2d");
    const chart = new Chart(ctx, config);
    charts[canvasId] = chart;
    return chart;
}

// ------------------------
// SUMMARY
// ------------------------

function renderSummaryCards(swims) {

    const el = document.getElementById("swim-summary-cards");
    if (!el) return;

    const totalDistance =
        swims.reduce((s, a) => s + a.distance_km, 0);

    const totalTime =
        swims.reduce((s, a) => s + (a.moving_time || 0), 0);

    const avgPaceMin =
        swims.filter(a => a.pace_min100)
            .reduce((s, a) => s + a.pace_min100, 0) /
        Math.max(1, swims.filter(a => a.pace_min100).length);

    const paceMin = Math.floor(avgPaceMin);
    const paceSec = Math.round((avgPaceMin - paceMin) * 60);

    el.innerHTML = `
        <div class="card"><h3>Swims</h3><p>${swims.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${totalDistance.toFixed(1)} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${(totalTime / 3600).toFixed(1)} h</p></div>
        <div class="card"><h3>Avg Pace</h3><p>${paceMin}:${paceSec.toString().padStart(2, '0')} /100m</p></div>
    `;
}

function formatPace(paceMin100) {
    if (!paceMin100) return "-";
    return utils.formatPace(paceMin100 * 60, 1).replace(' /km', '');
}


function poolBadge(poolLength) {

    if (poolLength === 20)
        return `<span class="pool-badge pool-20">20m</span>`;

    if (poolLength === 25)
        return `<span class="pool-badge pool-25">25m</span>`;

    if (poolLength === 50)
        return `<span class="pool-badge pool-50">50m</span>`;

    return `<span class="pool-badge pool-unknown">-</span>`;
}

function poolLengthInt(poolLength) {
    const parsed = Number.parseInt(poolLength, 10);
    return Number.isFinite(parsed) ? String(parsed) : '-';
}

// ------------------------
// POOL VS OPEN WATER SUMMARY
// ------------------------

function renderPoolVsOpenWaterSummary(swims) {
    const el = document.getElementById("swim-pool-open-summary");
    if (!el) return;

    const pool = swims.filter(s => s.swim_type === "pool");
    const ow = swims.filter(s => s.swim_type === "openwater");

    function agg(arr) {
        const count = arr.length;

        const dist = arr.reduce((s, a) => s + (a.distance_km || 0), 0);
        const avgDist = count ? dist / count : 0;
        const avgPace = arr.filter(a => a.pace_min100 != null)
            .reduce((s, a) => s + a.pace_min100, 0) / Math.max(1, arr.filter(a => a.pace_min100 != null).length);
        const avgHr = arr.filter(a => a.average_heartrate != null)
            .reduce((s, a) => s + a.average_heartrate, 0) / Math.max(1, arr.filter(a => a.average_heartrate != null).length);
        const tempVals = arr.filter(a => a.average_temp != null);
        const avgTemp = tempVals.reduce((s, a) => s + a.average_temp, 0) / Math.max(1, tempVals.length);

        return { dist, count, avgPace, avgHr, avgDist, avgTemp };
    }

    const poolAgg = agg(pool);
    const owAgg = agg(ow);

    el.innerHTML = `
        <table class="compact-table">
            <thead>
                <tr>
                    <th></th>
                    <th>Pool</th>
                    <th>Open Water</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Sessions</td>
                    <td>${poolAgg.count}</td>
                    <td>${owAgg.count}</td>
                </tr>
                <tr>
                    <td>Distance total (km)</td>
                    <td>${poolAgg.dist.toFixed(1)}</td>
                    <td>${owAgg.dist.toFixed(1)}</td>
                </tr>
                <tr>
                    <td>Avg pace (/100m)</td>
                    <td>${poolAgg.count ? formatPace(poolAgg.avgPace) : "-"}</td>
                    <td>${owAgg.count ? formatPace(owAgg.avgPace) : "-"}</td>
                </tr>
                <tr>
                    <td>Avg HR</td>
                    <td>${isFinite(poolAgg.avgHr) ? poolAgg.avgHr.toFixed(0) : "-"}</td>
                    <td>${isFinite(owAgg.avgHr) ? owAgg.avgHr.toFixed(0) : "-"}</td>
                </tr>
                <tr>
                    <td>Avg Distance (km)</td>
                    <td>${poolAgg.count ? poolAgg.avgDist.toFixed(1) : "-"}</td>
                    <td>${owAgg.count ? owAgg.avgDist.toFixed(1) : "-"}</td>
                </tr>
                <tr>
                    <td>Avg Temp (°C)</td>
                    <td>${isFinite(poolAgg.avgTemp) ? poolAgg.avgTemp.toFixed(1) : "-"}</td>
                    <td>${isFinite(owAgg.avgTemp) ? owAgg.avgTemp.toFixed(1) : "-"}</td>
                </tr>

            </tbody>
        </table>
    `;
}

// ------------------------
// HISTOGRAMS
// ------------------------

function renderDistanceHistogram(swims) {

    const binSize = 0.25;

    const distances = swims.map(s => s.distance_km);
    if (!distances.length) return;

    const max = Math.max(...distances, 0);
    const binCount = Math.ceil(max / binSize);

    const binsPool = new Array(binCount).fill(0);
    const binsOW = new Array(binCount).fill(0);

    swims.forEach(s => {

        const idx = Math.min(Math.floor(s.distance_km / binSize), binCount - 1);
        if (idx >= binCount) return;

        if (s.swim_type === "pool") binsPool[idx]++;
        if (s.swim_type === "openwater") binsOW[idx]++;

    });

    createChart("swim-distance-histogram", {
        type: "bar",
        data: {
            labels: new Array(binCount).fill(0).map((_, i) =>
                `${(i * binSize).toFixed(1)}–${((i + 1) * binSize).toFixed(1)} km`
            ),
            datasets: [
                {
                    label: "Pool",
                    data: binsPool,
                    backgroundColor: swimColors.pool
                },
                {
                    label: "Open Water",
                    data: binsOW,
                    backgroundColor: swimColors.openwater
                }
            ]
        },
        options: {
            plugins: { legend: { display: true } }
        }
    });
}

function renderPaceHistogram(swims) {

    const paces = swims
        .map(s => s.pace_min100)
        .filter(p => p && isFinite(p));

    if (!paces.length) return;

    const binSize = 0.05; // 3s aprox
    const max = Math.max(...paces, 0);
    const min = Math.min(...paces, max);
    const bins = new Array(Math.ceil((max - min) / binSize)).fill(0);

    paces.forEach(p => {
        const idx = Math.floor((p - min) / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-pace-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_, i) => {
                const from = min + i * binSize;
                const to = min + (i + 1) * binSize;
                return `${formatPace(from)}–${formatPace(to)}`;
            }),
            datasets: [{
                label: "# swims",
                data: bins,
                backgroundColor: "rgba(0,200,150,0.7)"
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { maxRotation: 90, minRotation: 45 } } }
        }
    });
}


// ------------------------
// SCATTERS
// ------------------------

function renderPaceVsDistanceChart(swims) {

    const pool = swims
        .filter(s => s.swim_type === "pool" && s.distance_km > 0 && s.pace_min100)
        .map(s => ({
            x: s.distance_km,
            y: s.pace_min100
        }));

    const openwater = swims
        .filter(s => s.swim_type === "openwater" && s.distance_km > 0 && s.pace_min100)
        .map(s => ({
            x: s.distance_km,
            y: s.pace_min100
        }));

    createChart("swim-pace-distance-chart", {
        type: "scatter",
        data: {
            datasets: [
                {
                    label: "Pool",
                    data: pool,
                    backgroundColor: swimColors.pool
                },
                {
                    label: "Open Water",
                    data: openwater,
                    backgroundColor: swimColors.openwater
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "Pace (min/100m)" } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const d = ctx.raw.x.toFixed(2);
                            const p = formatPace(ctx.raw.y);
                            return `Distance: ${d} km | Pace: ${p}/100m`;
                        }
                    }
                }
            }
        }
    });
}



// ------------------------
// TOP SWIMS
// ------------------------

function renderTopSwims(swims) {

    const el = document.getElementById("swim-top");
    if (!el) return;

    const topDistance = [...swims]
        .sort((a, b) => b.distance_km - a.distance_km)
        .slice(0, 10);

    const topPace = [...swims]
        .filter(s => s.pace_min100)
        .sort((a, b) => a.pace_min100 - b.pace_min100)
        .slice(0, 10);

    el.innerHTML = `
<div class="top-box">
<h3>Longest Swims</h3>
<table class="compact-table">
<thead>
<tr>
<th>#</th>
<th>Swim</th>
<th>Distance</th>
</tr>
</thead>
<tbody>
${topDistance.map((s, i) => `
<tr>
<td>${i + 1}</td>
<td>${s.name}</td>
<td>${s.distance_km.toFixed(2)} km</td>
</tr>`).join("")}
</tbody>
</table>
</div>

<div class="top-box">
<h3>Best Pace</h3>
<table class="compact-table">
<thead>
<tr>
<th>#</th>
<th>Swim</th>
<th>Pace</th>
</tr>
</thead>
<tbody>
${topPace.map((s, i) => `
<tr>
<td>${i + 1}</td>
<td>${s.name}</td>
<td>${formatPace(s.pace_min100)}</td>
</tr>`).join("")}
</tbody>
</table>
</div>
`;
}

// ------------------------
// TABLE
// ------------------------

function renderSwimsTable(swims) {

    const el = document.getElementById("swim-table");
    if (!el) return;

    const rows = swims
        .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
        .map(s => {
            return `
                <tr>
                    <td>${s.start_date_local.substring(0, 10)}</td>
                    <td>${s.name}</td>
                    <td>${s.distance_km.toFixed(2)}</td>
                    <td>${s.pace_min100 ? formatPace(s.pace_min100) : "-"}</td>
                    <td>${s.average_heartrate ? s.average_heartrate.toFixed(0) : "-"}</td>
                    <td>
                        <span class="swim-badge ${s.swim_type}">
                        ${s.swim_type}
                        </span>
                        </td>
                    <td>${(s.moving_ratio * 100).toFixed(2)}%</td>
                    <td>${poolLengthInt(s.pool_length)}</td>
                </tr>
            `;
        }).join("");

    el.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>km</th>
                    <th>Pace /100m</th>
                    <th>Avg HR</th>
                    <th>Type</th>
                    <th>Moving %</th>
                    <th>Pool</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}


// --- CHART RENDERING FUNCTIONS ---
export function renderConsistencyChart(swims, dateFilterFrom = null, dateFilterTo = null) {
    const container = document.getElementById('cal-heatmap-swim');
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

    // Agregar datos y calcular umbrales
    const safeSwims = swims || [];
    const aggregatedData = safeSwims.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.moving_time ? act.moving_time / 3600 : 0);
        return acc;
    }, {});

    const durationValues = Object.values(aggregatedData)
        .filter(v => v > 0)
        .sort((a, b) => a - b);

    const thresholds = durationValues.length >= 6
        ? [
            durationValues[Math.floor(0.1 * durationValues.length)],
            durationValues[Math.floor(0.3 * durationValues.length)],
            durationValues[Math.floor(0.5 * durationValues.length)],
            durationValues[Math.floor(0.7 * durationValues.length)],
            durationValues[Math.floor(0.9 * durationValues.length)]
        ]
        : [0.25, 0.5, 0.75, 1.25, 2]; // horas

    const cal = new CalHeatmap();
    const today = new Date();
    const hasManualFilters = Boolean(dateFilterFrom || dateFilterTo);
    const periodStart = hasManualFilters
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364)
        : new Date(today.getFullYear(), 0, 1);
    const periodEnd = hasManualFilters
        ? today
        : new Date(today.getFullYear(), 11, 31);

    const dayOfWeek = periodStart.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
    const firstMonday = new Date(periodStart);
    firstMonday.setDate(periodStart.getDate() + daysUntilMonday);

    const monthRange = hasManualFilters
        ? ((periodEnd.getFullYear() - firstMonday.getFullYear()) * 12 + (periodEnd.getMonth() - firstMonday.getMonth()) + 1)
        : 12;

    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    function markTodayCell() {
        const dayCells = heatmapWrapper.querySelectorAll('[data-day]');
        dayCells.forEach(cell => {
            const title = cell.getAttribute('title') || '';
            const ariaLabel = cell.getAttribute('aria-label') || '';
            const dataDate = cell.getAttribute('data-date') || '';
            const dateText = `${title} ${ariaLabel} ${dataDate}`;
            if (!dateText.includes(todayIso)) return;

            cell.style.outline = '2px solid #111';
            cell.style.outlineOffset = '1px';
            if (!cell.querySelector('.today-marker-x')) {
                const mark = document.createElement('span');
                mark.className = 'today-marker-x';
                mark.textContent = 'X';
                mark.style.position = 'absolute';
                mark.style.inset = '0';
                mark.style.display = 'flex';
                mark.style.alignItems = 'center';
                mark.style.justifyContent = 'center';
                mark.style.fontSize = '8px';
                mark.style.fontWeight = '700';
                mark.style.color = '#111';
                mark.style.pointerEvents = 'none';
                cell.style.position = 'relative';
                cell.appendChild(mark);
            }
        });
    }

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
        date: { start: firstMonday, locale: { weekStart: 1 } },
        range: Math.max(1, monthRange),
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
                range: [
                    '#ffffff',  // sin actividad
                    '#dbeafe',  // azul muy claro
                    '#93c5fd',
                    '#60a5fa',
                    '#2563eb',
                    '#1e3a8a'   // azul muy oscuro
                ],
                domain: thresholds
            }
        }
    });

    // Agregar etiquetas de días de la semana (solo primera columna)
    setTimeout(() => {
        markTodayCell();

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


// ------------------------
// POOL + OPEN WATER DISTRIBUTION
// ------------------------
function renderPoolLengthChart(swims) {

    const counts = {
        "20m": 0,
        "25m": 0,
        "50m": 0,
        "25yd": 0,
        "50yd": 0,
        "openwater": 0
    };

    swims.forEach(s => {
        if (s.swim_type === "pool") {
            switch (s.pool_length) {
                case 20: counts["20m"]++; break;
                case 25: counts["25m"]++; break;
                case 50: counts["50m"]++; break;
                case "25yd": counts["25yd"]++; break;
                case "50yd": counts["50yd"]++; break;
            }
        } else if (s.swim_type === "openwater") {
            counts.openwater++;
        }
    });

    // Filtrar solo longitudes con >0 sesiones
    const labels = [];
    const data = [];
    const backgroundColor = [];

    const colorMap = {
        "20m": "#10b981",
        "25m": "#2563eb",
        "50m": "#7c3aed",
        "25yd": "#f59e0b",
        "50yd": "#d97706",
        "openwater": "#3204d4"
    };

    Object.entries(counts).forEach(([key, val]) => {
        if (val > 0) {
            labels.push(key.replace("m", " m").replace("yd", " yd")); // formateo bonito
            data.push(val);
            backgroundColor.push(colorMap[key]);
        }
    });

    createChart("swim-pool-length-chart", {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Sessions",
                data,
                backgroundColor
            }]
        },
        options: {
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

export function renderAccumulatedDistanceChart(swims) {
    if (!swims || swims.length === 0) return;

    // 1. Aggregate distance per day (YYYY-MM-DD)
    const distanceByDay = swims.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + (act.distance_km || 0);
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

    createChart('swim-accumulated-distance-chart', {
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

export function renderWeeklyDistanceTrendChart(swims) {
    if (!swims || swims.length === 0) return;

    const { labels, weeklyKm } = buildWeeklyDistanceSeries(swims, a => a.distance_km || 0);
    const rollingWindowWeeks = 5;
    const rolling = utils.rollingMean(weeklyKm, rollingWindowWeeks).map(v => +v.toFixed(2));

    createChart('swim-weekly-distance-trend-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Weekly distance (km)',
                    data: weeklyKm,
                    type: 'bar',
                    backgroundColor: 'rgba(54,162,235,0.20)',
                    borderColor: 'rgba(54,162,235,0.35)',
                    borderWidth: 1,
                    hidden: true,
                    order: 2
                },
                {
                    label: `Rolling mean (${rollingWindowWeeks} weeks)`,
                    data: rolling,
                    type: 'line',
                    borderColor: 'rgba(255,99,132,1)',
                    backgroundColor: 'rgba(255,99,132,0.18)',
                    pointRadius: 0,
                    borderWidth: 4,
                    tension: 0.25,
                    order: 1
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}
