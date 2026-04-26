// js/analysis.js
import * as utils from './utils.js';

let charts = {};

// --- BIKE TYPE COLORING ---

const bikeColors = {
    road: "#FC5200",
    mtb: "#2e7d32",
    indoor: "#1976d2",
    gravel: "#FFD54F",
    electric: "#7E57C2"
};

function getBikeType(r) {
    if (r.sport_type === "MountainBikeRide") return "mtb";
    if (r.sport_type === "GravelBikeRide") return "gravel";
    if (r.sport_type === "EBikeRide" ||
        r.sport_type === "EMountainBikeRide" ||
        r.sport_type === "EGravelBikeRide") return "electric";
    if (r.sport_type === "IndoorRide" || r.distance === 0) return "indoor";
    return "road";
}

function getBikeTypeLabel(r) {
    const bikeType = getBikeType(r);
    if (bikeType === "mtb") return "MTB";
    if (bikeType === "gravel") return "Gravel";
    if (bikeType === "electric") return "Electric";
    if (bikeType === "indoor") return "Indoor";
    if (bikeType === "road") return "Road";
    return "Outdoor";
}

function bikeTypeBadge(r) {
    const bikeType = getBikeType(r);
    const label = getBikeTypeLabel(r);
    return `<span class="bike-type-badge bike-type-${bikeType}">${label}</span>`;
}


// ------------------------
// MAIN ENTRY
// ------------------------

export function renderBikeAnalysisTab(allActivities, dateFilterFrom, dateFilterTo, gearFilter = 'all', rollingWindowWeeks = 26) {

    const filteredActivities =
        utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);

    const rides = filteredActivities
        .filter(a =>
            a.type === "Ride" ||
            a.sport_type === "Ride" ||
            a.sport_type === "MountainBikeRide"
        )
        .filter(a => gearFilter === 'all' || a.gear_id === gearFilter);

    console.log("Rendering bike analysis for", rides.length, "rides");
    console.log(rides);

    if (!rides.length) return;

    renderSummaryCards(rides);
    renderBikeTypeSummary(rides);

    renderBikeTypeChart(rides);

    renderDistanceHistogram(rides);
    renderElevationHistogram(rides);

    renderSpeedVsDistanceChart(rides);
    renderDistanceVsElevationChart(rides);

    renderElevationRatioChart(rides);

    renderPowerVsSpeedChart(rides);

    renderAccumulatedDistanceChart(rides);
    renderWeeklyDistanceTrendChart(rides, rollingWindowWeeks);

    renderTopActivities(rides);

    renderActivitiesTable(rides);

    renderConsistencyChart(rides, dateFilterFrom, dateFilterTo);
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
// SORTABLE TABLE UTILITY
// ------------------------

function makeSortable(table) {
    if (!table) return;
    const headers = table.querySelectorAll('thead th[data-sort]');
    headers.forEach(th => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.addEventListener('click', () => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const type = th.dataset.sort;
            const currentDir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
            headers.forEach(h => { h.dataset.dir = ''; h.classList.remove('sort-asc', 'sort-desc'); });
            th.dataset.dir = currentDir;
            th.classList.add(currentDir === 'asc' ? 'sort-asc' : 'sort-desc');
            const realIdx = Array.from(th.parentElement.children).indexOf(th);
            rows.sort((a, b) => {
                const cellA = a.children[realIdx];
                const cellB = b.children[realIdx];
                if (!cellA || !cellB) return 0;
                let vA, vB;
                if (type === 'num' || type === 'pace') {
                    vA = parseFloat(cellA.dataset.value ?? cellA.textContent) || 0;
                    vB = parseFloat(cellB.dataset.value ?? cellB.textContent) || 0;
                } else if (type === 'date') {
                    vA = new Date(cellA.textContent.trim()).getTime() || 0;
                    vB = new Date(cellB.textContent.trim()).getTime() || 0;
                } else {
                    vA = cellA.textContent.trim().toLowerCase();
                    vB = cellB.textContent.trim().toLowerCase();
                    return currentDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
                }
                return currentDir === 'asc' ? vA - vB : vB - vA;
            });
            rows.forEach(r => tbody.appendChild(r));
        });
    });
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

function renderBikeTypeSummary(rides) {
    const el = document.getElementById("bike-type-summary");
    if (!el) return;

    const types = ["road", "mtb", "gravel", "indoor", "electric"];
    const labels = { road: "Road", mtb: "MTB", gravel: "Gravel", indoor: "Indoor", electric: "Electric" };

    function agg(arr) {
        const count = arr.length;
        if (!count) return null;
        const totalDist = arr.reduce((s, a) => s + (a.distance || 0) / 1000, 0);
        const totalSec = arr.reduce((s, a) => s + (a.moving_time || 0), 0);
        const avgDist = totalDist / count;
        const avgSpeed = arr.reduce((s, a) => {
            const spd = (a.distance / 1000) / (a.moving_time / 3600);
            return s + (isFinite(spd) ? spd : 0);
        }, 0) / count;
        const avgTime = totalSec / count;
        const avgTimeH = Math.floor(avgTime / 3600);
        const avgTimeM = Math.floor((avgTime % 3600) / 60);
        const avgTimeStr = avgTimeH > 0
            ? `${avgTimeH}h ${String(avgTimeM).padStart(2, '0')}m`
            : `${avgTimeM}m`;
        return { count, totalDist, avgDist, avgSpeed, avgTimeStr };
    }

    const rows = types.map(t => {
        const arr = rides.filter(r => getBikeType(r) === t);
        const a = agg(arr);
        if (!a) return `<tr>
            <td><span class="bike-type-badge bike-type-${t}">${labels[t]}</span></td>
            <td>-</td><td>-</td><td>-</td><td>-</td>
        </tr>`;
        return `<tr>
            <td><span class="bike-type-badge bike-type-${t}">${labels[t]}</span></td>
            <td>${a.count}</td>
            <td>${a.totalDist.toFixed(0)} km</td>
            <td>${a.avgDist.toFixed(1)} km</td>
            <td>${a.avgSpeed.toFixed(1)} km/h</td>
            <td>${a.avgTimeStr}</td>
        </tr>`;
    }).join("");

    el.innerHTML = `
        <table class="compact-table">
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Sessions</th>
                    <th>Total dist</th>
                    <th>Avg dist</th>
                    <th>Avg speed</th>
                    <th>Avg time</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderSummaryCards(rides) {

    const el = document.getElementById("bike-summary-cards");
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
            <p>${totalDistance.toFixed(1)} km</p>
        </div>

        <div class="card">
            <h3>Total Elevation</h3>
            <p>${totalElevation.toLocaleString()} m</p>
        </div>

        <div class="card">
            <h3>Avg Speed</h3>
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
    const distances = rides
        .map(r => (r.distance ? r.distance / 1000 : 0))
        .filter(d => !isNaN(d) && d >= 0);

    if (!distances.length) return;

    const binSize = 10;
    const max = Math.max(...distances, 0);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    distances.forEach(d => {
        const idx = Math.floor(d / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("bike-distance-histogram", {
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
    const values = rides
        .map(r => r.total_elevation_gain || 0)
        .filter(v => !isNaN(v) && v >= 0);

    if (!values.length) return;

    const binSize = 50;
    const max = Math.max(...values, 0);
    const bins = new Array(Math.ceil(max / binSize)).fill(0);

    values.forEach(v => {
        const idx = Math.floor(v / binSize);
        if (bins[idx] !== undefined) bins[idx]++;
    });

    createChart("bike-elevation-histogram", {
        type: "bar",
        data: {
            labels: bins.map((_, i) => `${i * binSize}-${(i + 1) * binSize}`),
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
        .filter(r => r.moving_time > 0 && r.distance > 0)
        .map(r => ({
            x: r.distance / 1000,
            y: (r.distance / 1000) / (r.moving_time / 3600),
            type: getBikeType(r)
        }));

    if (!data.length) return;

    createChart("bike-speed-distance-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Ride",
                data,
                backgroundColor: ctx => bikeColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
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
    const data = rides
        .filter(r => r.distance >= 0 && r.total_elevation_gain >= 0)
        .map(r => ({
            x: r.distance / 1000,
            y: r.total_elevation_gain || 0,
            type: getBikeType(r)
        }));

    if (!data.length) return;

    createChart("bike-distance-elevation-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Ride",
                data,
                backgroundColor: ctx => bikeColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
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
        .filter(r => r.distance > 0)
        .map(r => ({
            x: r.distance / 1000,
            y: (r.total_elevation_gain || 0) / (r.distance / 1000),
            type: getBikeType(r)
        }))
        .filter(p => isFinite(p.y));

    if (!data.length) return;

    createChart("bike-elevation-ratio-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Elevation per km",
                data,
                backgroundColor: ctx => bikeColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
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
        .filter(r => r.average_watts > 0 && r.moving_time > 0 && r.distance > 0)
        .map(r => ({
            x: r.average_watts,
            y: (r.distance / 1000) / (r.moving_time / 3600),
            type: getBikeType(r)
        }))
        .filter(p => isFinite(p.y));

    if (!data.length) return;

    createChart("bike-power-speed-chart", {
        type: "scatter",
        data: {
            datasets: [{
                label: "Power vs Speed",
                data,
                backgroundColor: ctx => bikeColors[ctx.raw.type]
            }]
        },
        options: {
            parsing: false,
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

    const topFastest = [...rides]
        .filter(a => a.moving_time > 0 && a.distance > 0)
        .map(a => ({
            ...a,
            speed: (a.distance / 1000) / (a.moving_time / 3600)
        }))
        .sort((a, b) => b.speed - a.speed)
        .slice(0, 10);

    const formatTime = s => {

        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);

        return `${h}h ${m}m`;
    };

    const activityLink = a => {
        if (!a?.id) return a?.name || '-';
        return `<a href="html/activity-router.html?id=${encodeURIComponent(a.id)}" target="_blank" rel="noopener noreferrer">${a.name}</a>`;
    };

    el.innerHTML = `

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin: 2rem 0;">

        <div class="top-box" style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">

            <h3>Longest Rides</h3>

            <table class="compact-table" id="bike-top-distance-table">
            <thead><tr><th>#</th><th>Ride</th><th data-sort="num">km</th></tr></thead>
            <tbody>
                ${topDistance.map((a, i) =>
        `<tr><td>${i + 1}</td><td>${activityLink(a)}</td><td data-value="${a.distance / 1000}">${(a.distance / 1000).toFixed(1)} km</td></tr>`
    ).join("")}
            </tbody>
            </table>

        </div>

        <div class="top-box" style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">

            <h3>Most Elevation</h3>

            <table class="compact-table" id="bike-top-elevation-table">
            <thead><tr><th>#</th><th>Ride</th><th data-sort="num">Elev (m)</th></tr></thead>
            <tbody>
                ${topElevation.map((a, i) =>
        `<tr><td>${i + 1}</td><td>${activityLink(a)}</td><td data-value="${a.total_elevation_gain}">${a.total_elevation_gain} m</td></tr>`
    ).join("")}
            </tbody>
            </table>

        </div>

        <div class="top-box" style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">

            <h3>Fastest Rides</h3>

            <table class="compact-table" id="bike-top-speed-table">
            <thead><tr><th>#</th><th>Ride</th><th data-sort="num">km/h</th></tr></thead>
            <tbody>
                ${topFastest.map((a, i) =>
        `<tr><td>${i + 1}</td><td>${activityLink(a)}</td><td data-value="${a.speed}">${a.speed.toFixed(1)} km/h</td></tr>`
    ).join("")}
            </tbody>
            </table>

        </div>

        </div>
    `;

    makeSortable(document.getElementById('bike-top-distance-table'));
    makeSortable(document.getElementById('bike-top-elevation-table'));
    makeSortable(document.getElementById('bike-top-speed-table'));
}

// ------------------------
// ACTIVITIES TABLE
// ------------------------

function renderActivitiesTable(rides) {

    const el = document.getElementById("bike-activities-table");
    if (!el) return;

    const rows = rides
        .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
        .map(a => {

            const speed =
                (a.distance / 1000) / (a.moving_time / 3600);

            const elevPerKm =
                a.distance > 0
                    ? ((a.total_elevation_gain || 0) / (a.distance / 1000)).toFixed(1)
                    : "-";

            const activityLink = a.id
                ? `<a href="html/activity-router.html?id=${encodeURIComponent(a.id)}" target="_blank" rel="noopener noreferrer">${a.name}</a>`
                : a.name;

            const elapsedSec = a.elapsed_time || 0;
            const elapsedH = Math.floor(elapsedSec / 3600);
            const elapsedM = Math.floor((elapsedSec % 3600) / 60);
            const elapsedStr = elapsedH > 0
                ? `${elapsedH}h ${String(elapsedM).padStart(2, '0')}m`
                : `${elapsedM}m`;

            return `
            <tr>
                <td>${a.start_date_local.substring(0, 10)}</td>
                <td>${activityLink}</td>
                <td>${bikeTypeBadge(a)}</td>
                <td data-value="${(a.distance / 1000).toFixed(1)}">${(a.distance / 1000).toFixed(1)}</td>
                <td data-value="${a.total_elevation_gain || 0}">${a.total_elevation_gain || 0}</td>
                <td data-value="${elevPerKm === '-' ? 0 : elevPerKm}">${elevPerKm}</td>
                <td data-value="${speed.toFixed(1)}">${speed.toFixed(1)}</td>
                <td data-value="${a.average_watts || 0}">${a.average_watts || "-"}</td>
                <td data-value="${elapsedSec}">${elapsedStr}</td>
            </tr>
            `;
        })
        .join("");

    el.innerHTML = `

        <table id="bike-all-table">

        <thead>

            <tr>
                <th data-sort="date">Date</th>
                <th>Activity</th>
                <th data-sort="text">Type</th>
                <th data-sort="num">km</th>
                <th data-sort="num">Elev (m)</th>
                <th data-sort="num">Elev/km</th>
                <th data-sort="num">km/h</th>
                <th data-sort="num">W</th>
                <th data-sort="num">Elapsed</th>
            </tr>

        </thead>

        <tbody>

            ${rows}

        </tbody>

        </table>
    `;

    makeSortable(document.getElementById('bike-all-table'));
}



export function renderConsistencyChart(rides, dateFilterFrom = null, dateFilterTo = null) {
    const container = document.getElementById('cal-heatmap-bike');
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
    const safeRides = rides || [];
    const aggregatedData = safeRides.reduce((acc, act) => {
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
            durationValues[Math.floor(0.25 * durationValues.length)],
            durationValues[Math.floor(0.45 * durationValues.length)],
            durationValues[Math.floor(0.6 * durationValues.length)],
            durationValues[Math.floor(0.75 * durationValues.length)],
            durationValues[Math.floor(0.9 * durationValues.length)]
        ]
        : [0.5, 1, 1.75, 2.75, 4, 6]; // horas

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
                    '#bbf7d0',  // verde claro visible
                    '#86efac',
                    '#4ade80',
                    '#22c55e',
                    '#16a34a',
                    '#15803d',
                    '#166534'
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

export function renderAccumulatedDistanceChart(rides) {
    if (!rides || rides.length === 0) return;

    // 1. Aggregate distance per day (YYYY-MM-DD)
    const distanceByDay = rides.reduce((acc, act) => {
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

    createChart('bike-accumulated-distance-chart', {
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

export function renderWeeklyDistanceTrendChart(rides, rollingWindowWeeks = 26) {
    if (!rides || rides.length === 0) return;

    const { labels, weeklyKm } = buildWeeklyDistanceSeries(rides, a => (a.distance || 0) / 1000);
    const rolling = utils.rollingMean(weeklyKm, rollingWindowWeeks).map(v => +v.toFixed(2));

    // Convert weeks to human-readable label
    const windowLabel = rollingWindowWeeks >= 52 ? '1 year' 
        : rollingWindowWeeks >= 26 ? '6 months' 
        : rollingWindowWeeks >= 12 ? '3 months' 
        : '1 month';

    createChart('bike-weekly-distance-trend-chart', {
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
                    label: `Rolling mean (${windowLabel})`,
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
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: { size: 11 }
                    }
                }
            },
            scales: {
                x: { title: { display: true } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}
