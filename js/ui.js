// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';

// --- DOM REFERENCES  ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const athleteName = document.getElementById('athlete-name');
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');


let uiCharts = {}; // Almacén de gráficos para la pestaña "Athlete" para no interferir con los del dashboard principal
function createUiChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found.`);
        return;
    }
    if (uiCharts[canvasId]) {
        uiCharts[canvasId].destroy();
    }
    uiCharts[canvasId] = new Chart(canvas, config);
}


// --- UI HELPERS ---
export function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.style.display = 'flex';
        loadingOverlay.classList.remove('hidden');
    }
}

export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
        loadingOverlay.classList.add('hidden');
    }
}

export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Check console for details.`);
}

export function setupDashboard(activities) {
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    athleteName.textContent = `Running Dashboard`;

    const dates = activities.map(a => a.start_date_local.substring(0, 10)).sort();
    if (dates.length > 0) {
        document.getElementById('date-from').min = dates[0];
        document.getElementById('date-from').max = dates[dates.length - 1];
        document.getElementById('date-to').min = dates[0];
        document.getElementById('date-to').max = dates[dates.length - 1];
    }
    setupExportButtons(activities);
}

// LA FUNCIÓN PRINCIPAL DE RENDERIZADO
export function renderDashboard(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    renderSummaryCards(runs);
    renderAllCharts(runs);
    renderRaceList(runs);
    renderAllRunsTable(runs);
    renderStreaks(runs);
    renderPersonalBests(runs);
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

function renderAllCharts(runs) {
    charts.renderActivityTypeChart(runs);
    charts.renderMonthlyDistanceChart(runs);
    charts.renderPaceVsDistanceChart(runs);
    charts.renderDistanceHistogram(runs);
    charts.renderVo2maxChart(runs);
    charts.renderFitnessChart(runs);
    charts.renderGearGanttChart(runs);
    charts.renderAccumulatedDistanceChart(runs);
    charts.renderRollingMeanDistanceChart(runs);
    charts.renderDistanceVsElevationChart(runs);
    charts.renderElevationHistogram(runs);
    charts.renderRunsHeatmap(runs);
    charts.renderConsistencyChart(runs);
}


// =======================================================
//          NUEVA SECCIÓN: RENDERIZADO DE LA PESTAÑA "ATHLETE"
// =======================================================

export function renderAthleteTab(allActivities) {
    console.log("Initializing Athlete Tab...");
    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    const athleteData = JSON.parse(localStorage.getItem('strava_athlete_data'));
    const zonesData = JSON.parse(localStorage.getItem('strava_training_zones'));

    // Renderizar componentes
    if (athleteData) renderAthleteProfile(athleteData);
    if (zonesData) renderTrainingZones(zonesData);

    renderAllTimeStats(runs);
    renderRecordStats(runs);
    renderStartTimeHistogram(runs);
    renderYearlyComparison(runs);
    renderGearSection(runs);
    renderWeeklyMixChart(runs);
    renderHourMatrix(runs);
    renderYearMonthMatrix(runs);
    renderMonthWeekdayMatrix(runs);
    renderMonthDayMatrix(runs);
}

function renderAllTimeStats(runs) {
    const container = document.getElementById('all-time-stats-cards');
    if (!container) return;
    const totalDist = (runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0);
    const totalTime = (runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1);
    const totalElev = runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString();
    container.innerHTML = `
        <div class="card"><h3>Total Runs</h3><p>${runs.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${totalDist} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${totalTime} h</p></div>
        <div class="card"><h3>Total Elevation</h3><p>${totalElev} m</p></div>
    `;
}

function renderRecordStats(runs) {
    const container = document.getElementById('record-stats');
    if (!container || runs.length === 0) return;

    // Longest run
    const longestRun = [...runs].sort((a, b) => b.distance - a.distance)[0];

    // Fastest run (pace)
    const fastestRun = [...runs].filter(r => r.distance > 1000).sort((a, b) => a.average_speed - b.average_speed).reverse()[0];
    const paceMin = fastestRun.average_speed > 0 ? (1000 / fastestRun.average_speed) / 60 : 0;
    const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';

    // Most elevation
    const mostElev = [...runs].sort((a, b) => b.total_elevation_gain - a.total_elevation_gain)[0];

    // More time transcurred (oldest to newest)
    const oldestRun = [...runs].sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local))[0];
    const newestRun = [...runs].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))[0];
    const timeDiffMs = new Date(newestRun.start_date_local) - new Date(oldestRun.start_date_local);
    const timeDiffDays = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24));

    // Favourite hour of the day
    const hourCounts = Array(24).fill(0);
    runs.forEach(run => {
        let hour = new Date(run.start_date_local).getHours();
        hour = (hour - 2 + 24) % 24; // adjust for timezone as in histogram
        hourCounts[hour]++;
    });
    const favHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Favourite day of the week
    const dayCounts = Array(7).fill(0);
    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
        let dayIdx = date.getDay();
        // Shift so Monday=0, Sunday=6
        dayIdx = (dayIdx + 6) % 7;
        dayCounts[dayIdx]++;
    });
    const favDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const favDay = dayLabels[favDayIdx];

    // Average distance
    const avgDist = runs.length ? (runs.reduce((s, a) => s + a.distance, 0) / runs.length / 1000).toFixed(2) : 0;

    // Average pace
    const avgPaceMin = runs.length
        ? (runs.reduce((s, r) => s + (r.average_speed > 0 ? (1000 / r.average_speed) / 60 : 0), 0) / runs.length)
        : 0;
    const avgPaceStr = avgPaceMin > 0
        ? `${Math.floor(avgPaceMin)}:${Math.round((avgPaceMin % 1) * 60).toString().padStart(2, '0')}`
        : '-';

    container.innerHTML = `
            <ul style="list-style: none; padding-left: 0; line-height: 1.8;">
                <li><strong>Longest Run:</strong> ${(longestRun.distance / 1000).toFixed(2)} km (<a href="activity.html?id=${longestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Fastest Run (Pace):</strong> ${paceStr} /km over ${(fastestRun.distance / 1000).toFixed(1)}k (<a href="activity.html?id=${fastestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Most Elevation:</strong> ${Math.round(mostElev.total_elevation_gain)} m (<a href="activity.html?id=${mostElev.id}" target="_blank">View</a>)</li>
                <li><strong>Time Span:</strong> ${timeDiffDays} days (${oldestRun.start_date_local.substring(0, 10)} to ${newestRun.start_date_local.substring(0, 10)})</li>
                <li><strong>Favourite Hour:</strong> ${favHour}:00</li>
                <li><strong>Favourite Day:</strong> ${favDay}</li>
                <li><strong>Average Distance:</strong> ${avgDist} km</li>
                <li><strong>Average Pace:</strong> ${avgPaceStr} /km</li>
            </ul>
        `;
}

function renderStartTimeHistogram(runs) {
    const hours = Array(24).fill(0);
    runs.forEach(run => {
        let hour = new Date(run.start_date_local).getHours();
        hour = (hour - 2 + 24) % 24;
        hours[hour]++;
    });
    const labels = hours.map((_, i) => `${i}:00`);
    createUiChart('start-time-histogram', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '# of Runs',
                data: hours,
                backgroundColor: 'rgba(252, 82, 0, 0.7)'
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { y: { ticks: { stepSize: 1 } } }
        }
    });
}



function renderYearlyComparison(runs) {
    const byYear = runs.reduce((acc, run) => {
        const year = run.start_date_local.substring(0, 4);
        if (!acc[year]) acc[year] = { distance: 0, count: 0, elevation: 0, movingTime: 0 };
        acc[year].distance += run.distance / 1000;
        acc[year].count++;
        acc[year].elevation += run.total_elevation_gain;
        acc[year].movingTime += run.moving_time / 3600;
        return acc;
    }, {});

    const years = Object.keys(byYear).sort();
    // Get max for each measure
    const distDataRaw = years.map(y => byYear[y].distance);
    const countDataRaw = years.map(y => byYear[y].count);
    const elevDataRaw = years.map(y => byYear[y].elevation);
    const timeDataRaw = years.map(y => byYear[y].movingTime);

    const maxDist = Math.max(...distDataRaw) || 1;
    const maxCount = Math.max(...countDataRaw) || 1;
    const maxElev = Math.max(...elevDataRaw) || 1;
    const maxTime = Math.max(...timeDataRaw) || 1;

    // Scale to [0, 1]
    const distData = distDataRaw.map(v => v / maxDist);
    const countData = countDataRaw.map(v => v / maxCount);
    const elevData = elevDataRaw.map(v => v / maxElev);
    const timeData = timeDataRaw.map(v => v / maxTime);

    const datasets = [
        {
            label: 'Total Distance (scaled)',
            data: distData,
            backgroundColor: 'rgba(0, 116, 217, 0.8)',
            hidden: false,
            realData: distDataRaw
        },
        {
            label: 'Number of Runs (scaled)',
            data: countData,
            backgroundColor: 'rgba(252, 82, 0, 0.8)',
            hidden: true,
            realData: countDataRaw
        },
        {
            label: 'Total Elevation Gain (scaled)',
            data: elevData,
            backgroundColor: 'rgba(0, 200, 83, 0.7)',
            hidden: true,
            realData: elevDataRaw
        },
        {
            label: 'Total Moving Time (scaled)',
            data: timeData,
            backgroundColor: 'rgba(255, 193, 7, 0.7)',
            hidden: true,
            realData: timeDataRaw
        }
    ];

    createUiChart('yearly-comparison-chart', {
        type: 'bar',
        data: {
            labels: years,
            datasets
        },
        options: {
            plugins: {
                legend: {
                    onClick: (e, legendItem, legend) => {
                        const chart = legend.chart;
                        const idx = legendItem.datasetIndex;
                        chart.data.datasets[idx].hidden = !chart.data.datasets[idx].hidden;
                        chart.update();
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dataset = context.dataset;
                            const yearIdx = context.dataIndex;
                            let label = dataset.label.replace(' (scaled)', '');
                            let value = dataset.realData ? dataset.realData[yearIdx] : context.parsed.y;
                            // Format value depending on dataset
                            if (label === 'Total Distance') {
                                return `${label}: ${value.toLocaleString(undefined, {maximumFractionDigits: 1})} km`;
                            }
                            if (label === 'Number of Runs') {
                                return `${label}: ${value}`;
                            }
                            if (label === 'Total Elevation Gain') {
                                return `${label}: ${value.toLocaleString()} m`;
                            }
                            if (label === 'Total Moving Time') {
                                return `${label}: ${value.toLocaleString(undefined, {maximumFractionDigits: 1})} h`;
                            }
                            return `${label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 1,
                    title: { display: true, text: 'Scaled Value (0-1)' }
                }
            }
        }
    });
}


function renderWeeklyMixChart(runs) {
    // Prepare data for each day of the week (Monday-Sunday)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayCounts = Array(7).fill(0);
    const dayKms = Array(7).fill(0);

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
        let dayIdx = date.getDay();
        // Shift so Monday=0, Sunday=6
        dayIdx = (dayIdx + 6) % 7;
        dayCounts[dayIdx]++;
        dayKms[dayIdx] += run.distance / 1000;
    });

    createUiChart('weekly-mix-chart', {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Total Trainings',
                    data: dayCounts,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                    yAxisID: 'y',
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Total Distance (km)',
                    data: dayKms,
                    fill: true,
                    backgroundColor: 'rgba(0, 116, 217, 0.2)',
                    borderColor: 'rgba(0, 116, 217, 1)',
                    pointBackgroundColor: 'rgba(0, 116, 217, 1)',
                    yAxisID: 'y1',
                    order: 2
                }
            ]
        },
        options: {
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Trainings' },
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}





function renderHourMatrix(runs) {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hourLabels = Array.from({ length: 24 }, (_, i) => i);

    // Inicializar matriz de conteos [7 días x 24 horas]
    const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        const dayIdx = (date.getDay() + 6) % 7; // Monday=0
        const hour = (date.getHours() - 2 + 24) % 24;
        counts[dayIdx][hour]++;
    });

    const data = [];
    const maxCount = Math.max(...counts.flat());

    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            data.push({ x: hour, y: day, v: counts[day][hour] });
        }
    }

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.2 + 0.8 * (v / maxCount);
        return `rgba(252,82,0,${alpha.toFixed(2)})`;
    }

    createUiChart('hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Runs',
                data: data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: item => {
                            const d = item[0].raw;
                            return `${dayLabels[d.y]} - ${d.x}:00`;
                        },
                        label: item => `Runs: ${item.raw.v}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 24,
                    ticks: {
                        stepSize: 1,
                        callback: val => `${val}:00`,
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Hour of Day', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: -0.5,
                    max: 6.5,
                    ticks: {
                        stepSize: 1,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Weekday', font: { weight: 'bold' } }
                }
            }
        }
    });
}




function renderYearMonthMatrix(runs) {
    const stats = {}; // { [year]: { [month]: { count, distance } } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const year = date.getFullYear();
        const month = date.getMonth(); // 0–11

        if (!stats[year]) stats[year] = {};
        if (!stats[year][month]) stats[year][month] = { count: 0, distance: 0 };

        stats[year][month].count++;
        stats[year][month].distance += run.distance / 1000; // asumiendo metros → km
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const data = [];
    let maxKm = 0;
    years.forEach((year, yIdx) => {
        months.forEach(month => {
            const entry = stats[year]?.[month];
            const km = entry ? entry.distance : 0;
            const count = entry ? entry.count : 0;
            maxKm = Math.max(maxKm, km);
            data.push({ x: month, y: yIdx, km, count });
        });
    });

    function getColor(km) {
        if (km === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(0,128,255,${alpha.toFixed(2)})`;
    }

    createUiChart('year-month-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Distance (km)',
                data,
                backgroundColor: data.map(d => getColor(d.km))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${years[d.y]} - ${monthLabels[d.x]}`;
                        },
                        label: item => {
                            const d = item.raw;
                            return [
                                `Runs: ${d.count}`,
                                `Distance: ${d.km.toFixed(1)} km`
                            ];
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: 11.5,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Month',
                        font: { weight: 'bold' }
                    }
                },
                y: {
                    type: 'linear',
                    min: -0.5,
                    max: years.length - 0.5,
                    ticks: {
                        stepSize: 1,
                        callback: val => years[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Year',
                        font: { weight: 'bold' }
                    }
                }
            },
            layout: {
                padding: 10
            }
        }
    });
}



function renderMonthWeekdayMatrix(runs) {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // stats[month][weekday] = { count, distance }
    const stats = Array.from({ length: 12 }, () =>
        Array.from({ length: 7 }, () => ({ count: 0, distance: 0 }))
    );

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const month = date.getMonth();           // 0–11
        const dayIdx = (date.getDay() + 6) % 7;  // Monday = 0
        const distKm = run.distance / 1000;

        stats[month][dayIdx].count++;
        stats[month][dayIdx].distance += distKm;
    });

    const data = [];
    let maxKm = 0;
    for (let m = 0; m < 12; m++) {
        for (let d = 0; d < 7; d++) {
            const entry = stats[m][d];
            maxKm = Math.max(maxKm, entry.distance);
            data.push({
                x: m,
                y: d,
                km: entry.distance,
                count: entry.count
            });
        }
    }

    function getColor(km) {
        if (km === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(0,200,120,${alpha.toFixed(2)})`;
    }

    createUiChart('month-weekday-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Distance (km)',
                data,
                backgroundColor: data.map(d => getColor(d.km))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${dayLabels[d.y]} - ${monthLabels[d.x]}`;
                        },
                        label: item => {
                            const d = item.raw;
                            return [
                                `Runs: ${d.count}`,
                                `Distance: ${d.km.toFixed(1)} km`
                            ];
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: 11.5,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Month',
                        font: { weight: 'bold' }
                    }
                },
                y: {
                    type: 'linear',
                    min: -0.5,
                    max: 6.5,
                    ticks: {
                        stepSize: 1,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Weekday',
                        font: { weight: 'bold' }
                    }
                }
            },
            layout: { padding: 10 }
        }
    });
}



function renderMonthDayMatrix(runs) {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = Array.from({ length: 31 }, (_, i) => i + 1);

    // stats[day][month] = { count, distance }
    const stats = Array.from({ length: 31 }, () =>
        Array.from({ length: 12 }, () => ({ count: 0, distance: 0 }))
    );

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const month = date.getMonth();      // 0–11
        const day = date.getDate() - 1;     // 0–30
        const distKm = run.distance / 1000; // meters → km

        stats[day][month].count++;
        stats[day][month].distance += distKm;
    });

    const data = [];
    let maxKm = 0;
    for (let d = 0; d < 31; d++) {
        for (let m = 0; m < 12; m++) {
            const entry = stats[d][m];
            if (entry.distance > 0) maxKm = Math.max(maxKm, entry.distance);
            data.push({
                x: d,   // day
                y: m,   // month
                km: entry.distance,
                count: entry.count
            });
        }
    }

    function getColor(km) {
        if (km === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(255,140,0,${alpha.toFixed(2)})`;
    }

    createUiChart('month-day-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Distance (km)',
                data,
                backgroundColor: data.map(d => getColor(d.km))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${monthLabels[d.y]} ${d.x + 1}`;
                        },
                        label: item => {
                            const d = item.raw;
                            return [
                                `Runs: ${d.count}`,
                                `Distance: ${d.km.toFixed(1)} km`
                            ];
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: 30.5,
                    ticks: {
                        stepSize: 2,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Day of Month', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: -0.5,
                    max: 11.5,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Month', font: { weight: 'bold' } }
                }
            },
            layout: { padding: 10 }
        }
    });
}











// --- HTML/TABLE RENDERING FUNCTIONS ----

function renderRaceList(runs) {
    const container = document.getElementById('race-list');
    if (!container) return;

    const races = runs.filter(act => act.workout_type === 1);
    if (races.length === 0) {
        container.innerHTML = "<tbody><tr><td colspan='6'>No races found in this period.</td></tr></tbody>";
        return;
    }

    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    const tableBody = races.map(act => {
        const distKm = (act.distance / 1000).toFixed(2);
        const timeStr = new Date(act.moving_time * 1000).toISOString().substr(11, 8);
        const paceMin = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
        const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';
        return `<tr>
            <td>${act.start_date_local.substring(0, 10)}</td>
            <td>${act.name}</td>
            <td>${distKm} km</td>
            <td>${timeStr}</td>
            <td>${paceStr} /km</td>
            <td><a href="activity.html?id=${act.id}" target="_blank"><button>View</button></a></td>
        </tr>`;
    }).join('');
    container.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
}

function renderAllRunsTable(runs) {
    const container = document.getElementById('all-runs-table');
    if (!container) return;

    if (runs.length === 0) {
        container.innerHTML = "<tbody><tr><td colspan='6'>No runs found in this period.</td></tr></tbody>";
        return;
    }

    // Ordenamos las carreras de más reciente a más antigua para la tabla
    const sortedRuns = [...runs].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
    let showAll = container.getAttribute('data-show-all') === 'true';
    const runsToShow = showAll ? sortedRuns : sortedRuns.slice(0, 10);

    const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
    const tableBody = runsToShow.map(act => {
        const distKm = (act.distance / 1000).toFixed(2);
        const timeStr = new Date(act.moving_time * 1000).toISOString().substr(11, 8);
        const paceMin = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
        const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';
        return `<tr>
            <td>${act.start_date_local.substring(0, 10)}</td>
            <td>${act.name}</td>
            <td>${distKm} km</td>
            <td>${timeStr}</td>
            <td>${paceStr} /km</td>
            <td><a href="activity.html?id=${act.id}" target="_blank"><button>View</button></a></td>
        </tr>`;
    }).join('');

    let toggleBtn = '';
    if (sortedRuns.length > 10) {
        toggleBtn = `
            <div style="margin: 0.5em 0;">
                <button id="toggle-all-runs-btn">
                    ${showAll ? 'Show Only Last 10' : 'Show All Runs'}
                </button>
            </div>
        `;
    }

    container.innerHTML = toggleBtn + tableHeader + `<tbody>${tableBody}</tbody>`;

    if (sortedRuns.length > 10) {
        document.getElementById('toggle-all-runs-btn').onclick = () => {
            container.setAttribute('data-show-all', showAll ? 'false' : 'true');
            renderAllRunsTable(runs);
        };
    }
}


function renderStreaks(runs) {
    const streaksInfo = document.getElementById('streaks-info');
    if (!streaksInfo) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

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

    function getISOWeek(d) {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = date.getUTCDay() || 7; // lunes = 1, domingo = 7
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    }

    function calcStreaks(items, type) {
        // items = array de strings: YYYY-MM-DD, YYYY-W## o YYYY-MM
        const sorted = Array.from(new Set(items)).sort();
        let maxStreak = 0, currentStreak = 0, prev = null;
        let maxStart = null, maxEnd = null;
        let tempStart = null;

        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            if (!prev) {
                currentStreak = 1;
                tempStart = item;
            } else {
                let diff = 0;
                if (type === 'day') {
                    diff = (new Date(item) - new Date(prev)) / 86400000;
                } else if (type === 'week') {
                    const [y1, w1] = prev.split('-W').map(Number);
                    const [y2, w2] = item.split('-W').map(Number);
                    diff = (y2 - y1) * 52 + (w2 - w1); // simplificación: años con 52 semanas
                } else if (type === 'month') {
                    const [y1, m1] = prev.split('-').map(Number);
                    const [y2, m2] = item.split('-').map(Number);
                    diff = (y2 - y1) * 12 + (m2 - m1);
                }

                if (diff === 1) {
                    currentStreak++;
                } else {
                    currentStreak = 1;
                    tempStart = item;
                }
            }

            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
                maxStart = tempStart;
                maxEnd = item;
            }
            prev = item;
        }

        return { sorted, maxStreak, maxStart, maxEnd };
    }

    function calcCurrentStreak(sorted, type) {
        let value = 0, start = null, end = null;
        let idx = sorted.length - 1;
        let temp;
        if (type === 'day') temp = yesterday.toISOString().slice(0, 10);
        else if (type === 'week') temp = `${yesterday.getFullYear()}-W${String(getISOWeek(yesterday)).padStart(2,'0')}`;
        else if (type === 'month') {
            temp = yesterday.toISOString().slice(0, 7);
        }

        while (idx >= 0) {
            let item = sorted[idx];
            let match = false;
            if (type === 'day' && item === temp) match = true;
            else if (type === 'week' && item === temp) match = true;
            else if (type === 'month' && item === temp) match = true;

            if (match) {
                if (value === 0) end = temp;
                value++;
                start = temp;

                // retrocede
                if (type === 'day') {
                    temp = new Date(new Date(temp).getTime() - 86400000).toISOString().slice(0, 10);
                } else if (type === 'week') {
                    let [y, w] = temp.split('-W').map(Number);
                    if (w === 1) {
                        y -= 1;
                        w = getISOWeek(new Date(y, 11, 28)); // última semana del año anterior
                    } else w -= 1;
                    temp = `${y}-W${String(w).padStart(2,'0')}`;
                } else if (type === 'month') {
                    let [y, m] = temp.split('-').map(Number);
                    if (m === 1) {
                        y -= 1;
                        m = 12;
                    } else m -= 1;
                    temp = `${y}-${String(m).padStart(2,'0')}`;
                }

                idx--;
            } else break;
        }

        return { value, start, end };
    }

    // --- CALCULO DE RACHAS ---
    // Días
    const dayItems = runs.map(r => r.start_date_local.substring(0, 10));
    const dayStreaks = calcStreaks(dayItems, 'day');
    const currentDay = calcCurrentStreak(dayStreaks.sorted, 'day');

    // Semanas (lunes)
    const weekItems = runs.map(r => {
        const d = new Date(r.start_date_local);
        const year = d.getFullYear();
        const week = getISOWeek(d);
        return `${year}-W${String(week).padStart(2,'0')}`;
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
        <div>
          <h4>🏆 Best Historical Streak</h4>
          <div><b>Consecutive Days:</b> ${dayStreaks.maxStreak} <br>
            <small>${formatDate(dayStreaks.maxStart)} - ${formatDate(dayStreaks.maxEnd)}</small>
          </div>
          <div><b>Consecutive Weeks:</b> ${weekStreaks.maxStreak} <br>
            <small>${formatWeek(weekStreaks.maxStart)} - ${formatWeek(weekStreaks.maxEnd)}</small>
          </div>
          <div><b>Consecutive Months:</b> ${monthStreaks.maxStreak} <br>
            <small>${formatDate(monthStreaks.maxStart)} - ${formatDate(monthStreaks.maxEnd)}</small>
          </div>
        </div>
        <div>
          <h4>🔥 Current Streak</h4>
          <div><b>Consecutive Days:</b> ${currentDay.value} <br>
            <small>${formatDate(currentDay.start)} - ${formatDate(currentDay.end)}</small>
          </div>
          <div><b>Consecutive Weeks:</b> ${currentWeek.value} <br>
            <small>${formatWeek(currentWeek.start)} - ${formatWeek(currentWeek.end)}</small>
          </div>
          <div><b>Consecutive Months:</b> ${currentMonth.value} <br>
            <small>${formatDate(currentMonth.start)} - ${formatDate(currentMonth.end)}</small>
          </div>
        </div>
      </div>
    `;
}



function renderPersonalBests(runs) {
    const distances = [
        { name: 'Mile', km: 1.609 },
        { name: '5K', km: 5 },
        { name: '10K', km: 10 },
        { name: 'Half Marathon', km: 21.097 },
        { name: 'Marathon', km: 42.195 }
    ];
    const margin = 0.1; // 10%

    // Helper to format pace
    function formatPace(secPerKm) {
        if (!isFinite(secPerKm) || secPerKm <= 0) return '-';
        const min = Math.floor(secPerKm / 60);
        const sec = Math.round(secPerKm % 60);
        return `${min}:${sec.toString().padStart(2, '0')} /km`;
    }

    // Find bests and top 3 for each distance
    const bests = distances.map(d => {
        const min = d.km * (1 - margin);
        const max = d.km * (1 + margin);
        const candidates = runs.filter(a => {
            const distKm = a.distance / 1000;
            return distKm >= min && distKm <= max && a.moving_time > 0;
        });
        if (candidates.length === 0) return { ...d, best: null, top3: [] };

        // Sort by best pace (lowest time/km)
        const sorted = [...candidates].sort((a, b) =>
            (a.moving_time / (a.distance / 1000)) - (b.moving_time / (b.distance / 1000))
        );
        const best = sorted[0];
        const top3 = sorted.slice(0, 3).map(act => {
            const paceSec = act.moving_time / (act.distance / 1000);
            return {
                id: act.id,
                date: act.start_date_local.substring(0, 10),
                pace: formatPace(paceSec),
                name: act.name || '',
                dist: (act.distance / 1000).toFixed(2),
                time: new Date(act.moving_time * 1000).toISOString().substr(11, 8)
            };
        });
        return {
            ...d,
            best: top3[0],
            top3
        };
    });

    // Render: one table per distance, with a button to show/hide top 3
    const container = document.getElementById('personal-bests');
    if (!container) return;
    container.innerHTML = bests.map((b, idx) => {
        if (!b.best) {
            return `
                <div class="personal-best-table">
                    <h4>${b.name}</h4>
                    <table class="df-table">
                        <thead>
                            <tr>
                                <th>Best Pace</th>
                                <th>Date</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="3">No result</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }
        const tableId = `top3-${b.name.replace(/\s/g, '').toLowerCase()}`;
        return `
            <div class="personal-best-table" style="margin-bottom:2em;">
                <h4>${b.name}</h4>
                <table class="df-table">
                    <thead>
                        <tr>
                            <th>Best Pace</th>
                            <th>Date</th>
                            <th>Details</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${b.best.pace}</td>
                            <td>${b.best.date}</td>
                            <td><a href="activity.html?id=${b.best.id}" target="_blank"><button>View</button></a></td>
                            <td>
                                <button onclick="document.getElementById('${tableId}').style.display = (document.getElementById('${tableId}').style.display === 'none' ? 'block' : 'none')">
                                    Show Top 3
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div id="${tableId}" style="display:none; margin-top:0.5em;">
                    <table class="df-table" style="background:#f9f9f9;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Date</th>
                                <th>Pace</th>
                                <th>Distance (km)</th>
                                <th>Time</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${b.top3.map((t, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${t.date}</td>
                                    <td>${t.pace}</td>
                                    <td>${t.dist}</td>
                                    <td>${t.time}</td>
                                    <td><a href="activity.html?id=${t.id}" target="_blank"><button>View</button></a></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

async function renderGearSection(runs) {
    const container = document.getElementById('gear-info-section');
    if (!container) return;
    const gearListContainer = document.getElementById('gear-info-list');
    const gearUsage = new Map();
    runs.forEach(run => {
        if (run.gear_id) {
            if (!gearUsage.has(run.gear_id)) {
                gearUsage.set(run.gear_id, { numUses: 0, lastUse: run.start_date_local });
            }
            gearUsage.get(run.gear_id).numUses++;
        }
    });
    const gearIds = Array.from(gearUsage.keys());
    if (gearIds.length === 0) {
        gearListContainer.innerHTML = '<p>No gear used in this period.</p>';
        return;
    }
    gearListContainer.innerHTML = '<p>Loading detailed gear info...</p>';
    try {
        const results = await Promise.all(gearIds.map(id => fetchGearById(id)));
        const gearIdToName = {};
        results.forEach(result => {
            const gear = result.gear;
            gearIdToName[gear.id] = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ');
        });
        renderGearCards(results, gearUsage, runs);
    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        gearListContainer.innerHTML = '<p>Error loading gear details. Check the console.</p>';
    }
}







function renderGearCards(apiResults, usageData, allRuns) {
    const gearListContainer = document.getElementById('gear-info-list');
    let isEditMode = localStorage.getItem('gearEditMode') === 'true';
    const cardsHtml = apiResults.map(result => {
        const gear = result.gear;
        const usage = usageData.get(gear.id) || { numUses: 0, lastUse: 'N/A' };
        const customData = JSON.parse(localStorage.getItem(`gear-custom-${gear.id}`) || '{}');
        const price = customData.price ?? 120;
        const durationKm = customData.durationKm ?? 700;
        const totalKm = gear.distance / 1000;
        const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
        const euroPerKm = price > 0 && totalKm > 0 ? (price / totalKm).toFixed(2) : '-';
        const needsReplacement = durabilityPercent >= 100;
        let durabilityColor = durabilityPercent > 90 ? '#dc3545' : durabilityPercent > 75 ? '#ffc107' : '#28a745';
        const editInputs = `
            <div class="gear-edit-fields">
                <div><label for="price-${gear.id}">Price (€):</label><input type="number" value="${price}" id="price-${gear.id}"></div>
                <div><label for="duration-${gear.id}">Lifespan (km):</label><input type="number" value="${durationKm}" id="duration-${gear.id}"></div>
                <button class="save-gear-btn" data-gearid="${gear.id}">💾 Save</button>
            </div>`;
        return `
          <div class="gear-card ${gear.retired ? 'retired' : ''} ${gear.primary ? 'primary' : ''}">
            ${gear.retired ? '<span class="badge retired-badge">RETIRED</span>' : ''}
            ${gear.primary ? '<span class="badge primary-badge">PRIMARY</span>' : ''}
            <h4>${gear.name || `${gear.brand_name} ${gear.model_name}`}</h4>
            <p class="gear-distance">${totalKm.toFixed(0)} km</p>
            <div class="durability-bar" title="${durabilityPercent.toFixed(0)}% of ${durationKm} km">
                <div class="durability-progress" style="width: ${durabilityPercent}%; background-color: ${durabilityColor};"></div>
            </div>
            <small>${durabilityPercent.toFixed(0)}% of ${durationKm} km</small>
            <div class="gear-stats">
                <span><strong>Uses:</strong> ${usage.numUses}</span>
                <span><strong>€/km:</strong> ${euroPerKm}</span>
                <span><strong>Last Use:</strong> ${new Date(usage.lastUse).toLocaleDateString()}</span>
            </div>
            ${needsReplacement && !gear.retired ? '<div class="alert-danger">Replacement Needed!</div>' : ''}
            ${isEditMode ? editInputs : ''}
          </div>`;
    }).join('');
    const editButtonHtml = `<div class="edit-mode-toggle"><button id="toggle-gear-edit">${isEditMode ? '✅ Done Editing' : '✏️ Edit Gear'}</button></div>`;
    gearListContainer.innerHTML = editButtonHtml + `<div id="gear-cards-container">${cardsHtml}</div>`;
    document.getElementById('toggle-gear-edit').addEventListener('click', () => {
        localStorage.setItem('gearEditMode', !isEditMode);
        renderGearCards(apiResults, usageData, allRuns);
    });
    if (isEditMode) {
        document.querySelectorAll('.save-gear-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gearId = btn.getAttribute('data-gearid');
                const price = parseFloat(document.getElementById(`price-${gearId}`).value);
                const durationKm = parseInt(document.getElementById(`duration-${gearId}`).value, 10);
                if (!isNaN(price) && !isNaN(durationKm)) {
                    localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify({ price, durationKm }));
                    btn.textContent = '✅';
                    setTimeout(() => renderGearCards(apiResults, usageData, allRuns), 500);
                } else {
                    alert('Please enter valid numbers for price and duration.');
                }
            });
        });
    }
}


// --- SECCIÓN DEL SELECTOR DE AÑO ---

export function setupYearlySelector(activities, onYearSelect) {
    const yearlyBtn = document.getElementById('yearly-btn');
    const yearList = document.getElementById('year-list');
    if (!yearlyBtn || !yearList) return;
    const years = Array.from(new Set(activities.map(a => new Date(a.start_date_local).getFullYear()))).sort((a, b) => b - a);
    yearList.innerHTML = years.map(year => `<button class="year-btn" data-year="${year}">${year}</button>`).join('');
    yearlyBtn.onclick = () => {
        yearList.style.display = yearList.style.display === 'none' ? 'flex' : 'none';
    };
    yearList.querySelectorAll('.year-btn').forEach(btn => {
        btn.onclick = () => {
            const year = btn.getAttribute('data-year');
            const from = `${year}-01-01`;
            const to = `${year}-12-31`;
            yearList.style.display = 'none';
            if (onYearSelect) {
                onYearSelect(from, to);
            }
        };
    });
}

// --- BOTONES DE EXPORTACIÓN ---
export function setupExportButtons(activities) {
    // CSV
    document.getElementById('download-csv-btn').onclick = () => {
        if (!activities || activities.length === 0) return alert('No data to export.');
        const headers = Object.keys(activities[0]);
        const csvRows = [
            headers.join(','),
            ...activities.map(act => headers.map(h => `"${(act[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'strava_activities.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // PDF
    document.getElementById('download-pdf-btn').onclick = () => {
        window.print();
    };
}


export function renderAthleteProfile(athlete) {
    const container = document.getElementById('athlete-profile-card');
    if (!container) return;
    const contentDiv = container.querySelector('.profile-content');
    if (!contentDiv) return;

    contentDiv.innerHTML = `
        <img src="${athlete.profile_medium}" alt="Athlete profile picture">
        <div class="profile-details">
            <span class="name">${athlete.firstname} ${athlete.lastname}</span>
            <span class="location">${athlete.city || ''}, ${athlete.country || ''}</span>
            <span class="stats">Followers: ${athlete.follower_count} | Friends: ${athlete.friend_count}</span>
        </div>
    `;
}

export function renderTrainingZones(zones) {
    const container = document.getElementById('training-zones-card');
    if (!container) return;
    const contentDiv = container.querySelector('.zones-content');
    if (!contentDiv) return;

    let html = '';

    // Renderizar Zonas de Frecuencia Cardíaca (Versión Robusta)
    if (zones.heart_rate && zones.heart_rate.zones && zones.heart_rate.custom_zones) {
        const hrZones = zones.heart_rate.zones;

        // La API a veces devuelve la primera zona con min y max 0, la filtramos.
        // También nos aseguramos de que haya zonas válidas.
        const validZones = hrZones.filter(z => typeof z.min !== 'undefined' && typeof z.max !== 'undefined' && z.max > 0);

        if (validZones.length > 0) {
            // Calculamos el ancho total de las zonas para la proporcionalidad
            const totalRange = validZones[validZones.length - 1].max - validZones[0].min;

            // Generamos dinámicamente cada segmento de la barra
            const zonesHtml = validZones.map((zone, index) => {
                const zoneWidth = ((zone.max - zone.min) / totalRange) * 100;
                const zoneNumber = index + 1;
                // Si es la última zona, el texto es "min+"
                const zoneText = (index === validZones.length - 1) ? `${zone.min}+` : zone.max;

                return `<div class="zone-segment hr-z${zoneNumber}" style="flex-basis: ${zoneWidth}%;" title="Z${zoneNumber}: ${zone.min}-${zone.max}">${zoneText}</div>`;
            }).join('');

            html += `
                <div class="zone-group">
                    <h4>Heart Rate Zones (bpm)</h4>
                    <div class="zone-bar">
                        ${zonesHtml}
                    </div>
                </div>`;
        }
    }

    // Renderizar Zonas de Potencia (sin cambios, ya era robusto)
    if (zones.power && zones.power.zones && zones.power.zones.length > 0) {
        // Buscamos el FTP, que es el inicio de la Zona 4 (o la última zona si hay menos)
        const ftpZone = zones.power.zones.find(z => z.name === 'Z4') || zones.power.zones[zones.power.zones.length - 1];
        if (ftpZone) {
            html += `
                <div class="zone-group">
                    <h4>Functional Threshold Power (FTP)</h4>
                    <p style="font-size: 1.5rem; font-weight: bold; color: var(--text-dark); margin: 0;">${ftpZone.min} W</p>
                </div>`;
        }
    }

    contentDiv.innerHTML = html || '<p>No custom training zones configured in your Strava profile.</p>';
}