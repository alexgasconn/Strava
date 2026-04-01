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

    renderAccumulatedDistanceChart(rides);
    renderWeeklyDistanceTrendChart(rides);

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

    el.innerHTML = `

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin: 2rem 0;">

        <div class="top-box" style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">

            <h3>Longest Rides</h3>

            <ol>
                ${topDistance.map(a =>
        `<li>${a.name} – ${(a.distance / 1000).toFixed(1)} km</li>`
    ).join("")}
            </ol>

        </div>

        <div class="top-box" style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">

            <h3>Most Elevation</h3>

            <ol>
                ${topElevation.map(a =>
        `<li>${a.name} – ${a.total_elevation_gain} m</li>`
    ).join("")}
            </ol>

        </div>

        <div class="top-box" style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">

            <h3>Fastest Rides</h3>

            <ol>
                ${topFastest.map(a =>
        `<li>${a.name} – ${a.speed.toFixed(1)} km/h</li>`
    ).join("")}
            </ol>

        </div>

        </div>
    `;
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

            return `
            <tr>
                <td>${a.start_date_local.substring(0, 10)}</td>
                <td>${a.name}</td>
                <td>${bikeTypeBadge(a)}</td>
                <td>${(a.distance / 1000).toFixed(1)}</td>
                <td>${a.total_elevation_gain || 0}</td>
                <td>${elevPerKm}</td>
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
                <th>Type</th>
                <th>km</th>
                <th>Elev (m)</th>
                <th>Elev/km</th>
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
            durationValues[Math.floor(0.3 * durationValues.length)],
            durationValues[Math.floor(0.5 * durationValues.length)],
            durationValues[Math.floor(0.7 * durationValues.length)],
            durationValues[Math.floor(0.9 * durationValues.length)]
        ]
        : [0.75, 1.5, 2.5, 4, 6]; // horas

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
                    '#ffffff',
                    '#d9fdd3',
                    '#a8f0a2',
                    '#5edb77',
                    '#22b455',
                    '#0a6102'
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

export function renderWeeklyDistanceTrendChart(rides) {
    if (!rides || rides.length === 0) return;

    const { labels, weeklyKm } = buildWeeklyDistanceSeries(rides, a => (a.distance || 0) / 1000);
    const rollingWindowWeeks = 5;
    const rolling = utils.rollingMean(weeklyKm, rollingWindowWeeks).map(v => +v.toFixed(2));

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
                x: { title: { display: true, text: 'Week start (ISO)' } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}
