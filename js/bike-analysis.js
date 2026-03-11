// js/analysis.js
import * as utils from './utils.js';

let charts = {};

// ------------------------
// MAIN ENTRY
// ------------------------

export function renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo) {

    const filteredActivities =
        utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);

    const rides = filteredActivities.filter(a =>
        a.type === "Ride" ||
        a.sport_type === "Ride" ||
        a.sport_type === "MountainBikeRide"
    );

    console.log("Rendering bike analysis for", rides.length, "rides");
    console.log(rides);

    if (!rides.length) return;

    renderSummaryCards(rides);

    renderBikeTypeChart(rides);

    renderDistanceHistogram(rides);
    renderElevationHistogram(rides);

    renderSpeedVsDistanceChart(rides);
    renderDistanceVsElevationChart(rides);

    renderElevationRatioChart(rides);

    renderPowerVsSpeedChart(rides);

    renderTopActivities(rides);

    renderActivitiesTable(rides);
}

// ------------------------
// CHART UTILITY
// ------------------------

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const ctx = canvas.getContext("2d");
    const chart = new Chart(ctx, config);

    charts[canvasId] = chart;

    return chart;  // ← Y AHORA sí devuelves la instancia correcta
}


// ------------------------
// SUMMARY
// ------------------------

function renderSummaryCards(rides) {

    const el = document.getElementById("summary-cards");
    if (!el) return;

    const totalDistance =
        rides.reduce((s, a) => s + a.distance, 0) / 1000;

    const totalElevation =
        rides.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);

    const totalTime =
        rides.reduce((s, a) => s + a.moving_time, 0);

    const avgSpeed =
        totalDistance / (totalTime / 3600);

    el.innerHTML = `
        <div class="card">
            <h3>Rides</h3>
            <p>${rides.length}</p>
        </div>

        <div class="card">
            <h3>Total Distance</h3>
            <p>${totalDistance.toFixed(0)} km</p>
        </div>

        <div class="card">
            <h3>Total Elevation</h3>
            <p>${totalElevation.toLocaleString()} m</p>
        </div>

        <div class="card">
            <h3>Average Speed</h3>
            <p>${avgSpeed.toFixed(1)} km/h</p>
        </div>
    `;
}

// ------------------------
// ROAD VS MTB
// ------------------------

function renderBikeTypeChart(rides) {

    let road = 0;
    let mtb = 0;
    let indoor = 0;
    let gravel = 0;
    let electric = 0;

    rides.forEach(r => {
        if (r.sport_type === "MountainBikeRide") mtb++;
        else if (r.distance == 0) indoor++;
        else if (r.sport_type == "IndoorRide") indoor++;
        else if (r.sport_type == "GravelBikeRide") gravel++;
        else if (r.sport_type == "EBikeRide") electric++;
        else if (r.sport_type == "EMountainBikeRide") electric++;
        else if (r.sport_type == "EGravelBikeRide") electric++;
        else road++;
    });

    createChart("bike-type-chart", {

        type: "pie",

        data: {
            labels: ["Road", "MTB", "Indoor", "Gravel", "Electric"],
            datasets: [{
                data: [road, mtb, indoor, gravel, electric],
                backgroundColor: ["#FC5200", "#2e7d32", "#1976d2", "#FFD54F", "#7E57C2"]
            }]
        }
    });
}

// ------------------------
// DISTANCE HISTOGRAM
// ------------------------

function renderDistanceHistogram(rides) {
    const distances = rides.map(r => r.distance / 1000);
    const binSize = 10;
    const max = Math.max(...distances);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    distances.forEach(d => {
        bins[Math.floor(d / binSize)]++;
    });

    createChart("distance-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_, i) => `${i * binSize}-${(i + 1) * binSize}`),
            datasets: [{
                label: "# rides",
                data: bins,
                backgroundColor: "rgba(252,82,0,0.7)"
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });
}



// ------------------------
// ELEVATION HISTOGRAM
// ------------------------

function renderElevationHistogram(rides) {

    const values =
        rides.map(r => r.total_elevation_gain || 0);

    const binSize = 200;

    const max = Math.max(...values);

    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    values.forEach(v => {
        bins[Math.floor(v / binSize)]++;
    });

    createChart("elevation-histogram", {

        type: "bar",

        data: {
            labels: bins.map((_, i) =>
                `${i * binSize}-${(i + 1) * binSize}`),

            datasets: [{
                label: "# rides",
                data: bins,
                backgroundColor: "rgba(200,40,40,0.7)"
            }]
        }
    });
}

// ------------------------
// DISTANCE VS SPEED
// ------------------------

function renderSpeedVsDistanceChart(rides) {

    const data = rides
        .filter(r => r.moving_time)
        .map(r => ({

            x: r.distance / 1000,

            y: (r.distance / 1000) / (r.moving_time / 3600)
        }));

    createChart("speed-distance-chart", {

        type: "scatter",

        data: {
            datasets: [{
                label: "Ride",
                data,
                backgroundColor: "#FC5200"
            }]
        },

        options: {
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "Speed (km/h)" } }
            }
        }
    });
}

// ------------------------
// DISTANCE VS ELEVATION
// ------------------------

function renderDistanceVsElevationChart(rides) {

    const data = rides.map(r => ({

        x: r.distance / 1000,

        y: r.total_elevation_gain || 0
    }));

    createChart("distance-elevation-chart", {

        type: "scatter",

        data: {
            datasets: [{
                label: "Ride",
                data,
                backgroundColor: "rgba(50,100,200,0.8)"
            }]
        },

        options: {
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "Elevation Gain (m)" } }
            }
        }
    });
}

// ------------------------
// ELEVATION RATIO
// ------------------------

function renderElevationRatioChart(rides) {

    const data = rides
        .filter(r => r.distance)
        .map(r => ({

            x: r.distance / 1000,

            y: (r.total_elevation_gain || 0) / (r.distance / 1000)
        }));

    createChart("elevation-ratio-chart", {

        type: "scatter",

        data: {
            datasets: [{
                label: "Elevation per km",
                data,
                backgroundColor: "rgba(120,40,180,0.8)"
            }]
        },

        options: {
            scales: {
                x: { title: { display: true, text: "Distance (km)" } },
                y: { title: { display: true, text: "m / km" } }
            }
        }
    });
}

// ------------------------
// POWER VS SPEED
// ------------------------

function renderPowerVsSpeedChart(rides) {

    const data = rides
        .filter(r => r.average_watts)
        .map(r => ({

            x: r.average_watts,

            y: (r.distance / 1000) / (r.moving_time / 3600)
        }));

    if (!data.length) return;

    createChart("power-speed-chart", {

        type: "scatter",

        data: {
            datasets: [{
                label: "Power vs Speed",
                data,
                backgroundColor: "rgba(220,60,60,0.8)"
            }]
        },

        options: {
            scales: {
                x: { title: { display: true, text: "Power (W)" } },
                y: { title: { display: true, text: "Speed (km/h)" } }
            }
        }
    });
}

// ------------------------
// TOP RIDES
// ------------------------

function renderTopActivities(rides) {

    const el = document.getElementById("top-rides");
    if (!el) return;

    const topDistance = [...rides]
        .sort((a, b) => b.distance - a.distance)
        .slice(0, 10);

    const topElevation = [...rides]
        .sort((a, b) => b.total_elevation_gain - a.total_elevation_gain)
        .slice(0, 10);

    const topDuration = [...rides]
        .sort((a, b) => b.moving_time - a.moving_time)
        .slice(0, 10);

    const formatTime = s => {

        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);

        return `${h}h ${m}m`;
    };

    el.innerHTML = `

        <div class="top-box">

            <h3>Longest Rides</h3>

            <ol>
                ${topDistance.map(a =>
        `<li>${a.name} – ${(a.distance / 1000).toFixed(1)} km</li>`
    ).join("")}
            </ol>

        </div>

        <div class="top-box">

            <h3>Most Elevation</h3>

            <ol>
                ${topElevation.map(a =>
        `<li>${a.name} – ${a.total_elevation_gain} m</li>`
    ).join("")}
            </ol>

        </div>

        <div class="top-box">

            <h3>Longest Duration</h3>

            <ol>
                ${topDuration.map(a =>
        `<li>${a.name} – ${formatTime(a.moving_time)}</li>`
    ).join("")}
            </ol>

        </div>
    `;
}

// ------------------------
// ACTIVITIES TABLE
// ------------------------

function renderActivitiesTable(rides) {

    const el = document.getElementById("activities-table");
    if (!el) return;

    const rows = rides
        .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
        .map(a => {

            const speed =
                (a.distance / 1000) / (a.moving_time / 3600);

            return `
            <tr>
                <td>${a.start_date_local.substring(0, 10)}</td>
                <td>${a.name}</td>
                <td>${(a.distance / 1000).toFixed(1)}</td>
                <td>${a.total_elevation_gain || 0}</td>
                <td>${speed.toFixed(1)}</td>
                <td>${a.average_watts || "-"}</td>
            </tr>
            `;
        })
        .join("");

    el.innerHTML = `

        <table>

        <thead>

            <tr>
                <th>Date</th>
                <th>Activity</th>
                <th>km</th>
                <th>Elev (m)</th>
                <th>km/h</th>
                <th>W</th>
            </tr>

        </thead>

        <tbody>

            ${rows}

        </tbody>

        </table>
    `;
}