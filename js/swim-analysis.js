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

    const enriched = swims.map(a => ({
        ...a,
        distance_km: a.distance ? a.distance / 1000 : 0,
        pace_sec100: paceSecPer100m(a),
        pace_min100: paceMinPer100m(a),
        swim_type: getSwimType(a),
        moving_ratio: a.elapsed_time ? (a.moving_time || 0) / a.elapsed_time : 1
    }));

    renderSummaryCards(enriched);
    renderPoolVsOpenWaterSummary(enriched);

    renderDistanceHistogram(enriched);
    renderPaceHistogram(enriched);

    renderPaceVsDistanceChart(enriched);

    renderTopSwims(enriched);
    renderSwimsTable(enriched);

    renderConsistencyChart(enriched);
}

// ------------------------
// CHART UTILITY
// ------------------------

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (charts[canvasId]) charts[canvasId].destroy();

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
    const min = Math.floor(paceMin100);
    const sec = Math.round((paceMin100 - min) * 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
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
        const dist = arr.reduce((s, a) => s + a.distance_km, 0);
        const count = arr.length;
        const avgPace = arr.filter(a => a.pace_min100)
            .reduce((s, a) => s + a.pace_min100, 0) / Math.max(1, arr.filter(a => a.pace_min100).length);
        const avgHr = arr.filter(a => a.average_heartrate)
            .reduce((s, a) => s + a.average_heartrate, 0) / Math.max(1, arr.filter(a => a.average_heartrate).length);
        const avgDist = arr.reduce((s, a) => s + a.distance_km, 0);
        return { dist, count, avgPace, avgHr, avgDist };
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

            </tbody>
        </table>
    `;
}

// ------------------------
// HISTOGRAMS
// ------------------------

function renderDistanceHistogram(swims) {

    const binSize = 0.5;

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
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}


// --- CHART RENDERING FUNCTIONS ---
export function renderConsistencyChart(swims) {
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

    if (!swims || swims.length === 0) {
        heatmapWrapper.innerHTML = `<p style="text-align:center; color:#8c8c8c;">
            No hay datos de actividad para este período.
        </p>`;
        return;
    }

    // Agregar datos y calcular umbrales
    const aggregatedData = swims.reduce((acc, act) => {
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
                range: ['#ebedf0', '#a1f1fc', '#91baf8', '#067ff0', '#1100ff'],
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