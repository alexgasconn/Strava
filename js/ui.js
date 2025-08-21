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
    charts.renderConsistencyChart(runs);
    charts.renderActivityTypeChart(runs);
    charts.renderMonthlyDistanceChart(runs);
    charts.renderPaceVsDistanceChart(runs);
    charts.renderDistanceHistogram(runs);
    charts.renderVo2maxChart(runs);
    charts.renderFitnessChart(runs);
    charts.renderStackedAreaGearChart(runs);
    charts.renderGearGanttChart(runs);
    charts.renderAccumulatedDistanceChart(runs);
    charts.renderRollingMeanDistanceChart(runs);
    charts.renderDistanceVsElevationChart(runs);
    charts.renderElevationHistogram(runs);
    charts.renderRunsHeatmap(runs);
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
    renderPersonalBests(runs);
    renderWeeklyMixChart(runs)
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

    // --- DÍAS CONSECUTIVOS ---
    const runDates = new Set(runs.map(a => a.start_date_local.substring(0, 10)));
    const allDays = Array.from(runDates).sort();

    // Mejor racha histórica de días
    let maxDayStreak = 0, currentDayStreak = 0, prevDay = null;
    for (let i = 0; i < allDays.length; i++) {
        const day = allDays[i];
        if (!prevDay) {
            currentDayStreak = 1;
        } else {
            const prev = new Date(prevDay);
            const curr = new Date(day);
            const diff = (curr - prev) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                currentDayStreak++;
            } else {
                currentDayStreak = 1;
            }
        }
        if (currentDayStreak > maxDayStreak) maxDayStreak = currentDayStreak;
        prevDay = day;
    }
    // Racha actual de días (hasta hoy, hacia atrás)
    let today = new Date().toISOString().slice(0, 10);
    let idx = allDays.length - 1;
    let currentDayStreakValue = 0;
    while (idx >= 0) {
        if (allDays[idx] === today) {
            currentDayStreakValue++;
            today = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
            idx--;
        } else {
            break;
        }
    }

    // --- SEMANAS CONSECUTIVAS ---
    const weekSet = new Set(runs.map(a => {
        const d = new Date(a.start_date_local);
        const year = d.getFullYear();
        const week = utils.getISOWeek(d);
        return `${year}-W${week}`;
    }));
    const allWeeks = Array.from(weekSet).sort();

    let maxWeekStreak = 0, currentWeekStreak = 0, prevWeek = null;
    for (let i = 0; i < allWeeks.length; i++) {
        const [year, weekStr] = allWeeks[i].split('-W');
        const week = parseInt(weekStr, 10);
        const prev = prevWeek ? prevWeek.split('-W').map(Number) : null;
        if (!prevWeek) {
            currentWeekStreak = 1;
        } else {
            if (
                (parseInt(year) === prev[0] && week === prev[1] + 1) ||
                (parseInt(year) === prev[0] + 1 && prev[1] === 52 && week === 1)
            ) {
                currentWeekStreak++;
            } else {
                currentWeekStreak = 1;
            }
        }
        if (currentWeekStreak > maxWeekStreak) maxWeekStreak = currentWeekStreak;
        prevWeek = allWeeks[i];
    }
    // Racha actual de semanas (hasta esta semana, hacia atrás)
    let now = new Date();
    let thisWeekYear = now.getFullYear();
    let thisWeekNum = utils.getISOWeek(now);
    let currentWeekStreakValue = 0;
    let weekIdx = allWeeks.length - 1;
    while (weekIdx >= 0) {
        const [wYear, wNum] = allWeeks[weekIdx].split('-W').map(Number);
        if (wYear === thisWeekYear && wNum === thisWeekNum) {
            currentWeekStreakValue++;
            // Retrocede una semana
            if (thisWeekNum === 1) {
                thisWeekYear -= 1;
                thisWeekNum = 52;
            } else {
                thisWeekNum -= 1;
            }
            weekIdx--;
        } else {
            break;
        }
    }

    // --- MESES CONSECUTIVOS ---
    const monthSet = new Set(runs.map(a => a.start_date_local.substring(0, 7)));
    const allMonths = Array.from(monthSet).sort();

    let maxMonthStreak = 0, currentMonthStreak = 0, prevMonth = null;
    for (let i = 0; i < allMonths.length; i++) {
        const [year, month] = allMonths[i].split('-').map(Number);
        const prev = prevMonth ? prevMonth.split('-').map(Number) : null;
        if (!prevMonth) {
            currentMonthStreak = 1;
        } else {
            if (
                (year === prev[0] && month === prev[1] + 1) ||
                (year === prev[0] + 1 && prev[1] === 12 && month === 1)
            ) {
                currentMonthStreak++;
            } else {
                currentMonthStreak = 1;
            }
        }
        if (currentMonthStreak > maxMonthStreak) maxMonthStreak = currentMonthStreak;
        prevMonth = allMonths[i];
    }
    // Racha actual de meses (hasta este mes, hacia atrás)
    let thisMonthStr = new Date().toISOString().slice(0, 7);
    let [curYear, curMonth] = thisMonthStr.split('-').map(Number);
    let currentMonthStreakValue = 0;
    let monthIdx = allMonths.length - 1;
    while (monthIdx >= 0) {
        const [mYear, mMonth] = allMonths[monthIdx].split('-').map(Number);
        if (mYear === curYear && mMonth === curMonth) {
            currentMonthStreakValue++;
            // Retrocede un mes
            if (curMonth === 1) {
                curYear -= 1;
                curMonth = 12;
            } else {
                curMonth -= 1;
            }
            monthIdx--;
        } else {
            break;
        }
    }

    streaksInfo.innerHTML = `
      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <div>
          <h4>🏆 Best Historical Streak</h4>
          <div><b>Consecutive Days:</b> ${maxDayStreak}</div>
          <div><b>Consecutive Weeks:</b> ${maxWeekStreak}</div>
          <div><b>Consecutive Months:</b> ${maxMonthStreak}</div>
        </div>
        <div>
          <h4>🔥 Current Streak</h4>
          <div><b>Consecutive Days:</b> ${currentDayStreakValue}</div>
          <div><b>Consecutive Weeks:</b> ${currentWeekStreakValue}</div>
          <div><b>Consecutive Months:</b> ${currentMonthStreakValue}</div>
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
                gearUsage.set(run.gear_id, { numUses: 0, firstUse: run.start_date_local });
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
        // NUEVO CÓDIGO AQUI
        const gearIdToName = {};
        results.forEach(result => {
            const gear = result.gear;
            // Usa el nombre más bonito disponible
            gearIdToName[gear.id] = gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ');
        });
        charts.renderStackedAreaGearChart(runs, gearIdToName);
        charts.renderGearGanttChart(runs, gearIdToName);
        renderGearCards(results, gearUsage, runs);
    } catch (error) {
        console.error("Failed to fetch gear details:", error);
        gearListContainer.innerHTML = '<p>Error loading gear details. Check the console.</p>';
    }
}




function renderConsistencyStats(runs) {
    const container = document.getElementById('consistency-stats');
    if (!container || runs.length === 0) {
        container.innerHTML = "<p>No run data available.</p>";
        return;
    }

    const avgDist = (runs.reduce((sum, act) => sum + act.distance, 0) / runs.length / 1000).toFixed(1);
    const avgTime = (runs.reduce((sum, act) => sum + act.moving_time, 0) / runs.length);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = new Array(7).fill(0);
    runs.forEach(act => {
        const dayIndex = new Date(act.start_date_local).getDay();
        dayCounts[dayIndex]++;
    });
    const mostActiveDayIndex = dayCounts.indexOf(Math.max(...dayCounts));

    container.innerHTML = `
        <ul style="list-style: none; padding-left: 0; line-height: 1.8;">
            <li><strong>Average Distance:</strong> ${avgDist} km / run</li>
            <li><strong>Average Time:</strong> ${new Date(avgTime * 1000).toISOString().substr(14, 5)} / run</li>
            <li><strong>Most Active Day:</strong> ${daysOfWeek[mostActiveDayIndex]}</li>
        </ul>
    `;
}




function renderGearCards(apiResults, usageData, allRuns) {
    const gearListContainer = document.getElementById('gear-info-list');
    let isEditMode = localStorage.getItem('gearEditMode') === 'true';
    const cardsHtml = apiResults.map(result => {
        const gear = result.gear;
        const usage = usageData.get(gear.id) || { numUses: 0, firstUse: 'N/A' };
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
                <span><strong>First Use:</strong> ${new Date(usage.firstUse).toLocaleDateString()}</span>
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