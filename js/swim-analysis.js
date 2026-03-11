// js/swim-analysis.js
import * as utils from './utils.js';

let charts = {};

// ------------------------
// SWIM TYPE & COLORS
// ------------------------

const swimColors = {
    pool: "#0077cc",
    openwater: "#00b894"
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

    // Enriquecer con derivados
    const enriched = swims.map(a => ({
        ...a,
        distance_km: a.distance ? a.distance / 1000 : 0,
        pace_sec100: paceSecPer100m(a),
        pace_min100: paceMinPer100m(a),
        swim_type: getSwimType(a)
    }));

    renderSummaryCards(enriched);
    renderPoolVsOpenWaterSummary(enriched);

    renderDistanceHistogram(enriched);
    renderPaceHistogram(enriched);
    renderDurationHistogram(enriched);
    renderHrHistogram(enriched);

    renderPaceVsDistanceChart(enriched);
    renderHrVsPaceChart(enriched);
    renderDistanceVsHrChart(enriched);

    renderDistanceOverTime(enriched);
    renderPaceOverTime(enriched);

    renderPaceZonesChart(enriched);

    renderDistanceVsDuration(enriched);

    renderTopSwims(enriched);
    renderSwimsTable(enriched);
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
             .reduce((s,a)=>s+a.pace_min100,0) /
        Math.max(1, swims.filter(a=>a.pace_min100).length);

    const avgHr =
        swims.filter(a => a.average_heartrate)
             .reduce((s,a)=>s+a.average_heartrate,0) /
        Math.max(1, swims.filter(a=>a.average_heartrate).length);

    const longest = swims.reduce((best,a)=>
        a.distance_km > (best?.distance_km || 0) ? a : best, null);

    const bestPace = swims
        .filter(a=>a.pace_min100)
        .reduce((best,a)=>
            a.pace_min100 < (best?.pace_min100 || Infinity) ? a : best, null);

    const paceMin = Math.floor(avgPaceMin);
    const paceSec = Math.round((avgPaceMin - paceMin)*60);

    el.innerHTML = `
        <div class="card"><h3>Swims</h3><p>${swims.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${totalDistance.toFixed(1)} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${(totalTime/3600).toFixed(1)} h</p></div>
        <div class="card"><h3>Avg Pace</h3><p>${paceMin}:${paceSec.toString().padStart(2,'0')} /100m</p></div>
        <div class="card"><h3>Avg HR</h3><p>${isFinite(avgHr)?avgHr.toFixed(0):"-"} bpm</p></div>
        <div class="card"><h3>Longest Session</h3><p>${longest ? longest.name+" – "+longest.distance_km.toFixed(2)+" km" : "-"}</p></div>
        <div class="card"><h3>Best Pace</h3><p>${bestPace ? formatPace(bestPace.pace_min100)+" /100m" : "-"}</p></div>
    `;
}

function formatPace(paceMin100) {
    if (!paceMin100) return "-";
    const min = Math.floor(paceMin100);
    const sec = Math.round((paceMin100 - min)*60);
    return `${min}:${sec.toString().padStart(2,'0')}`;
}

// ------------------------
// POOL VS OPEN WATER SUMMARY
// ------------------------

function renderPoolVsOpenWaterSummary(swims) {
    const el = document.getElementById("swim-pool-open-summary");
    if (!el) return;

    const pool = swims.filter(s=>s.swim_type==="pool");
    const ow = swims.filter(s=>s.swim_type==="openwater");

    function agg(arr) {
        const dist = arr.reduce((s,a)=>s+a.distance_km,0);
        const count = arr.length;
        const avgPace = arr.filter(a=>a.pace_min100)
            .reduce((s,a)=>s+a.pace_min100,0) / Math.max(1, arr.filter(a=>a.pace_min100).length);
        const avgHr = arr.filter(a=>a.average_heartrate)
            .reduce((s,a)=>s+a.average_heartrate,0) / Math.max(1, arr.filter(a=>a.average_heartrate).length);
        return {dist,count,avgPace,avgHr};
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
                    <td>${poolAgg.count?formatPace(poolAgg.avgPace):"-"}</td>
                    <td>${owAgg.count?formatPace(owAgg.avgPace):"-"}</td>
                </tr>
                <tr>
                    <td>Avg HR</td>
                    <td>${isFinite(poolAgg.avgHr)?poolAgg.avgHr.toFixed(0):"-"}</td>
                    <td>${isFinite(owAgg.avgHr)?owAgg.avgHr.toFixed(0):"-"}</td>
                </tr>
            </tbody>
        </table>
    `;
}

// ------------------------
// HISTOGRAMS
// ------------------------

function renderDistanceHistogram(swims) {

    const distances = swims.map(s => s.distance_km);
    if (!distances.length) return;

    const binSize = 0.5;
    const max = Math.max(...distances, 0);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    distances.forEach(d => {
        const idx = Math.floor(d / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-distance-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_, i) =>
                `${(i * binSize).toFixed(1)}–${((i + 1) * binSize).toFixed(1)} km`
            ),
            datasets: [{
                label: "# swims",
                data: bins,
                backgroundColor: "rgba(0,150,255,0.7)"
            }]
        },
        options: { plugins: { legend: { display: false } } }
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
    const bins = new Array(Math.ceil((max-min) / binSize)).fill(0);

    paces.forEach(p => {
        const idx = Math.floor((p-min) / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-pace-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_, i) => {
                const from = min + i*binSize;
                const to = min + (i+1)*binSize;
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

function renderDurationHistogram(swims) {
    const durations = swims.map(s => (s.moving_time || 0)/60);
    if (!durations.length) return;

    const binSize = 10;
    const max = Math.max(...durations, 0);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    durations.forEach(d => {
        const idx = Math.floor(d / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-duration-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_,i)=>`${i*binSize}-${(i+1)*binSize} min`),
            datasets: [{
                label: "# swims",
                data: bins,
                backgroundColor: "rgba(0,120,200,0.7)"
            }]
        },
        options: { plugins: { legend: { display: false } } }
    });
}

function renderHrHistogram(swims) {
    const hrs = swims
        .map(s=>s.average_heartrate)
        .filter(h=>h && isFinite(h));
    if (!hrs.length) return;

    const binSize = 5;
    const max = Math.max(...hrs, 0);
    const min = Math.min(...hrs, max);
    const bins = new Array(Math.ceil((max-min)/binSize)).fill(0);

    hrs.forEach(h=>{
        const idx = Math.floor((h-min)/binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-hr-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_,i)=>`${min+i*binSize}-${min+(i+1)*binSize} bpm`),
            datasets: [{
                label: "# swims",
                data: bins,
                backgroundColor: "rgba(200,80,80,0.7)"
            }]
        },
        options: { plugins: { legend: { display: false } } }
    });
}

// ------------------------
// SCATTERS
// ------------------------

function renderPaceVsDistanceChart(swims) {

    const data = swims
        .filter(s => s.distance_km > 0 && s.pace_min100)
        .map(s => ({
            x: s.distance_km,
            y: s.pace_min100,
            type: s.swim_type
        }));

    createChart("swim-pace-distance-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Swim",
                data,
                backgroundColor: ctx => swimColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "Pace (min/100m)" } }
            }
        }
    });
}

function renderHrVsPaceChart(swims) {
    const data = swims
        .filter(s=>s.pace_min100 && s.average_heartrate)
        .map(s=>({
            x: s.pace_min100,
            y: s.average_heartrate,
            type: s.swim_type
        }));

    createChart("swim-hr-pace-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Swim",
                data,
                backgroundColor: ctx => swimColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
            scales: {
                x: { title: { display: true, text: "Pace (min/100m)" } },
                y: { title: { display: true, text: "Avg HR (bpm)" } }
            }
        }
    });
}

function renderDistanceVsHrChart(swims) {
    const data = swims
        .filter(s=>s.average_heartrate)
        .map(s=>({
            x: s.distance_km,
            y: s.average_heartrate,
            type: s.swim_type
        }));

    createChart("swim-distance-hr-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Swim",
                data,
                backgroundColor: ctx => swimColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "Avg HR (bpm)" } }
            }
        }
    });
}

// ------------------------
// TIME EVOLUTION
// ------------------------

function renderDistanceOverTime(swims) {

    const sorted = [...swims].sort((a,b)=>
        new Date(a.start_date) - new Date(b.start_date)
    );

    const labels = sorted.map(s => s.start_date_local.substring(0,10));
    const distances = sorted.map(s => s.distance_km);

    createChart("swim-distance-over-time", {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Distance (km)",
                data: distances,
                borderColor: "rgba(0,150,255,0.9)",
                fill: false
            }]
        }
    });
}

function renderPaceOverTime(swims) {
    const sorted = [...swims].sort((a,b)=>
        new Date(a.start_date) - new Date(b.start_date)
    );

    const labels = sorted.map(s => s.start_date_local.substring(0,10));
    const paces = sorted.map(s => s.pace_min100 || null);

    createChart("swim-pace-over-time", {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Pace (min/100m)",
                data: paces,
                borderColor: "rgba(0,200,150,1)",
                spanGaps: true,
                fill: false
            }]
        }
    });
}

// ------------------------
// PACE ZONES
// ------------------------

function renderPaceZonesChart(swims) {
    const paces = swims
        .map(s=>s.pace_min100)
        .filter(p=>p && isFinite(p));
    if (!paces.length) return;

    const zones = [
        {label:"<1:40", min:0, max:1+40/60},
        {label:"1:40–1:50", min:1+40/60, max:1+50/60},
        {label:"1:50–2:00", min:1+50/60, max:2},
        {label:"2:00–2:10", min:2, max:2+10/60},
        {label:">2:10", min:2+10/60, max:999}
    ];

    const counts = zones.map(z=>
        paces.filter(p=>p>=z.min && p<z.max).length
    );

    const total = paces.length;
    const perc = counts.map(c=> total? (c/total*100):0);

    createChart("swim-pace-zones-chart", {
        type: "bar",
        data: {
            labels: zones.map(z=>z.label),
            datasets: [{
                label: "% time",
                data: perc,
                backgroundColor: "rgba(0,150,255,0.7)"
            }]
        },
        options: {
            scales: {
                y: { title: { display:true, text:"% of swims" }, max:100 }
            }
        }
    });
}

// ------------------------
// DISTANCE VS DURATION
// ------------------------

function renderDistanceVsDuration(swims) {

    const data = swims.map(s => ({
        x: (s.moving_time || 0) / 60,
        y: s.distance_km,
        type: s.swim_type
    }));

    createChart("swim-distance-duration-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Swim",
                data,
                backgroundColor: ctx => swimColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
            scales: {
                x: { title: { display: true, text: "Duration (min)" } },
                y: { title: { display: true, text: "Distance (km)" } }
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
        .sort((a,b)=>b.distance_km-a.distance_km)
        .slice(0,10);

    const topPace = [...swims]
        .filter(s=>s.pace_min100)
        .sort((a,b)=>a.pace_min100-b.pace_min100)
        .slice(0,10);

    el.innerHTML = `
        <div class="top-box">
            <h3>Longest Swims</h3>
            <ol>${topDistance.map(s=>`<li>${s.name} – ${s.distance_km.toFixed(2)} km</li>`).join("")}</ol>
        </div>

        <div class="top-box">
            <h3>Best Pace</h3>
            <ol>${topPace.map(s=>`<li>${s.name} – ${formatPace(s.pace_min100)} /100m</li>`).join("")}</ol>
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
        .sort((a,b)=>new Date(b.start_date)-new Date(a.start_date))
        .map(s=>{
            return `
                <tr>
                    <td>${s.start_date_local.substring(0,10)}</td>
                    <td>${s.name}</td>
                    <td>${s.distance_km.toFixed(2)}</td>
                    <td>${s.pace_min100 ? formatPace(s.pace_min100) : "-"}</td>
                    <td>${s.average_heartrate ? s.average_heartrate.toFixed(0) : "-"}</td>
                    <td>${s.swim_type}</td>
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
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}
