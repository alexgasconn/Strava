// js/swim-analysis.js
import * as utils from './utils.js';

let charts = {};

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

    renderSummaryCards(swims);

    renderDistanceHistogram(swims);
    renderPaceHistogram(swims);

    renderPaceVsDistanceChart(swims);
    renderDistanceOverTime(swims);

    renderRollingMeanPace(swims);

    renderDistanceVsDuration(swims);

    renderSwolfHistogram(swims);

    renderTopSwims(swims);

    renderSwimsTable(swims);
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
        swims.reduce((s, a) => s + a.distance, 0) / 1000;

    const totalTime =
        swims.reduce((s, a) => s + a.moving_time, 0);

    const avgPaceSec =
        totalTime / (totalDistance * 10); // pace per 100m

    const paceMin = Math.floor(avgPaceSec / 60);
    const paceSec = Math.round(avgPaceSec % 60);

    el.innerHTML = `
        <div class="card"><h3>Swims</h3><p>${swims.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${totalDistance.toFixed(1)} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${(totalTime/3600).toFixed(1)} h</p></div>
        <div class="card"><h3>Avg Pace</h3><p>${paceMin}:${paceSec.toString().padStart(2,'0')} /100m</p></div>
    `;
}

// ------------------------
// DISTANCE HISTOGRAM
// ------------------------

function renderDistanceHistogram(swims) {

    const distances = swims.map(s => s.distance / 1000);

    const binSize = 0.5; // 500m
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

// ------------------------
// PACE HISTOGRAM
// ------------------------

function renderPaceHistogram(swims) {

    const paces = swims
        .filter(s => s.distance > 0)
        .map(s => (s.moving_time / (s.distance / 100)) ); // sec per 100m

    const binSize = 5; // 5 seconds
    const max = Math.max(...paces, 0);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    paces.forEach(p => {
        const idx = Math.floor(p / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-pace-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_, i) =>
                `${i*binSize}-${(i+1)*binSize} sec/100m`
            ),
            datasets: [{
                label: "# swims",
                data: bins,
                backgroundColor: "rgba(0,200,150,0.7)"
            }]
        },
        options: { plugins: { legend: { display: false } } }
    });
}

// ------------------------
// PACE VS DISTANCE
// ------------------------

function renderPaceVsDistanceChart(swims) {

    const data = swims
        .filter(s => s.distance > 0)
        .map(s => ({
            x: s.distance / 1000,
            y: (s.moving_time / (s.distance / 100)), // sec per 100m
        }));

    createChart("swim-pace-distance-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Swim",
                data,
                backgroundColor: "rgba(0,150,255,0.8)"
            }]
        },
        options: {
            parsing: false,
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "Pace (sec/100m)" } }
            }
        }
    });
}

// ------------------------
// DISTANCE OVER TIME
// ------------------------

function renderDistanceOverTime(swims) {

    const sorted = [...swims].sort((a,b)=>
        new Date(a.start_date) - new Date(b.start_date)
    );

    const labels = sorted.map(s => s.start_date_local.substring(0,10));
    const distances = sorted.map(s => s.distance / 1000);

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

// ------------------------
// ROLLING MEAN PACE
// ------------------------

function renderRollingMeanPace(swims) {

    const sorted = [...swims].sort((a,b)=>
        new Date(a.start_date) - new Date(b.start_date)
    );

    const labels = sorted.map(s => s.start_date_local.substring(0,10));

    const paces = sorted.map(s =>
        s.moving_time / (s.distance / 100)
    );

    const rolling = rollingMean(paces, 10);

    createChart("swim-rolling-pace", {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Rolling Pace (10 swims)",
                data: rolling,
                borderColor: "rgba(0,200,150,1)",
                fill: false
            }]
        }
    });
}

function rollingMean(arr, window) {
    const out = [];
    for (let i=0; i<arr.length; i++) {
        const start = Math.max(0, i-window+1);
        const slice = arr.slice(start, i+1);
        out.push(slice.reduce((a,b)=>a+b,0) / slice.length);
    }
    return out;
}

// ------------------------
// DISTANCE VS DURATION
// ------------------------

function renderDistanceVsDuration(swims) {

    const data = swims.map(s => ({
        x: s.moving_time / 60, // minutes
        y: s.distance / 1000
    }));

    createChart("swim-distance-duration-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Swim",
                data,
                backgroundColor: "rgba(0,100,255,0.8)"
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
// SWOLF HISTOGRAM
// ------------------------

function renderSwolfHistogram(swims) {

    const swolfValues = swims
        .map(s => s.swolf || s.average_swolf || null)
        .filter(v => v !== null);

    if (!swolfValues.length) return;

    const binSize = 2;
    const max = Math.max(...swolfValues, 0);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    swolfValues.forEach(v => {
        const idx = Math.floor(v / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("swim-swolf-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_,i)=>`${i*binSize}-${(i+1)*binSize}`),
            datasets: [{
                label: "SWOLF count",
                data: bins,
                backgroundColor: "rgba(0,80,200,0.7)"
            }]
        }
    });
}

// ------------------------
// TOP SWIMS
// ------------------------

function renderTopSwims(swims) {

    const el = document.getElementById("swim-top");
    if (!el) return;

    const topDistance = [...swims].sort((a,b)=>b.distance-a.distance).slice(0,10);

    const topPace = [...swims]
        .filter(s=>s.distance>0)
        .sort((a,b)=>
            (a.moving_time/(a.distance/100)) -
            (b.moving_time/(b.distance/100))
        )
        .slice(0,10);

    const topSwolf = [...swims]
        .filter(s=>s.swolf || s.average_swolf)
        .sort((a,b)=>
            (a.swolf||a.average_swolf) -
            (b.swolf||b.average_swolf)
        )
        .slice(0,10);

    el.innerHTML = `
        <div class="top-box">
            <h3>Longest Swims</h3>
            <ol>${topDistance.map(s=>`<li>${s.name} – ${(s.distance/1000).toFixed(2)} km</li>`).join("")}</ol>
        </div>

        <div class="top-box">
            <h3>Best Pace</h3>
            <ol>${topPace.map(s=>{
                const pace = s.moving_time/(s.distance/100);
                const min = Math.floor(pace/60);
                const sec = Math.round(pace%60);
                return `<li>${s.name} – ${min}:${sec.toString().padStart(2,'0')} /100m</li>`;
            }).join("")}</ol>
        </div>

        <div class="top-box">
            <h3>Best SWOLF</h3>
            <ol>${topSwolf.map(s=>`<li>${s.name} – ${s.swolf||s.average_swolf}</li>`).join("")}</ol>
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
            const pace = s.moving_time/(s.distance/100);
            const min = Math.floor(pace/60);
            const sec = Math.round(pace%60);
            return `
                <tr>
                    <td>${s.start_date_local.substring(0,10)}</td>
                    <td>${s.name}</td>
                    <td>${(s.distance/1000).toFixed(2)}</td>
                    <td>${min}:${sec.toString().padStart(2,'0')}</td>
                    <td>${s.swolf||s.average_swolf||"-"}</td>
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
                    <th>SWOLF</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}
