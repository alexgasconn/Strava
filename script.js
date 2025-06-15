// =================================================================
// script.js - "ALL-IN-ONE" VERSION (COMPLETE AND FIXED)
// =================================================================

// --- 1. CONFIGURATION & GLOBAL STATE ---
const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const CACHE_KEY = 'strava_dashboard_data_v1';
let charts = {};

let dateFilterFrom = null;
let dateFilterTo = null;
let allActivities = []; // Store all activities for filtering

// --- 2. DOM REFERENCES ---
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');

// --- 3. UI FUNCTIONS ---
function showLoading(message) { loadingMessage.textContent = message; loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay.classList.add('hidden'); }
function handleError(message, error) { console.error(message, error); hideLoading(); alert(`Error: ${message}.`); }

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas, config);
}

// --- 4. AUTHENTICATION LOGIC ---

function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

// --- 5. RENDERING FUNCTIONS ---

function renderDashboard(activities) {
    const filtered = filterActivitiesByDate(activities);
    // --- Filter only running activities (includes Trail Run, etc) ---
    const runs = filtered.filter(a => a.type && a.type.includes('Run'));
    console.log(`Total running activities: ${runs.length}`);
    console.log(`Running activities:`, runs);

    // 1. Get all distances
    const allDistances = runs.map(a => a.distance);
    // 2. Calculate 90th percentile
    const sortedDistances = [...allDistances].sort((a, b) => a - b);
    const p90Index = Math.floor(0.9 * sortedDistances.length);
    const p90Distance = sortedDistances[p90Index] || 0;
    console.log(`90th Percentile Distance: ${p90Distance} m`);

    // 3. Tag as Long Run if not a race and distance >= 90th percentile
    runs.forEach(a => {
        if (a.workout_type !== 1 && a.distance >= p90Distance) {
            a.workout_type = 2; // Long run
        }
    });

    // --- Summary Cards ---
    const summaryContainer = document.getElementById('summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="card"><h3>Activities</h3><p>${runs.length}</p></div>
            <div class="card"><h3>Total Distance</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
            <div class="card"><h3>Total Time</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
            <div class="card"><h3>Total Elevation</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        `;
    }

    // --- Consistency Heatmap (CalHeatmap) ---
    const cal = new CalHeatmap();
    const aggregatedData = runs.reduce((acc, act) => {
        const date = act.start_date_local.substring(0, 10);
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {});
    const heatmapContainer = document.getElementById('cal-heatmap');
    if (heatmapContainer) {
        heatmapContainer.innerHTML = '';
        cal.paint({
            itemSelector: heatmapContainer,
            domain: { type: "month", label: { text: "MMM" } },
            subDomain: { type: "ghDay", radius: 2, width: 11, height: 11 },
            range: 12,
            data: { source: Object.entries(aggregatedData).map(([date, value]) => ({ date, value })), x: 'date', y: 'value' },
            scale: { color: { type: 'threshold', range: ['#ebedf0', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26'], domain: [1, 2, 3, 4] } },
            date: { start: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
        });
    }

    // --- Bar Chart: Running Types (workout_type) ---
    // workout_type: 0=Workout, 1=Race, 2=Long run, 3=Workout
    const workoutTypeLabels = ['Workout', 'Race', 'Long Run', 'Workout'];
    const workoutTypeCounts = [0, 0, 0, 0];
    runs.forEach(act => {
        const wt = typeof act.workout_type === 'number' ? act.workout_type : 0;
        workoutTypeCounts[wt] = (workoutTypeCounts[wt] || 0) + 1;
    });
    const workoutTypeCanvas = document.getElementById('activity-type-barchart');
    if (workoutTypeCanvas && !charts['activity-type-barchart']) {
        charts['activity-type-barchart'] = new Chart(workoutTypeCanvas, {
            type: 'bar',
            data: {
                labels: workoutTypeLabels,
                datasets: [{
                    label: '# Activities',
                    data: workoutTypeCounts,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)'
                }]
            },
            options: { indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // --- Line & Bar Chart: Monthly Distance + Number of Runs ---
    // Group and sum distance and count activities per month
    const monthlyDistanceMap = {};
    const monthlyCountMap = {};
    runs.forEach(act => {
        const month = act.start_date_local.substring(0, 7);
        monthlyDistanceMap[month] = (monthlyDistanceMap[month] || 0) + (act.distance / 1000);
        monthlyCountMap[month] = (monthlyCountMap[month] || 0) + 1;
    });
    const sortedMonths = Object.keys(monthlyDistanceMap).sort();
    const monthlyDistances = sortedMonths.map(month => monthlyDistanceMap[month]);
    const monthlyCounts = sortedMonths.map(month => monthlyCountMap[month]);
    const monthlyDistanceCanvas = document.getElementById('monthly-distance-chart');
    if (monthlyDistanceCanvas) {
        if (charts['monthly-distance-chart']) {
            charts['monthly-distance-chart'].destroy();
            charts['monthly-distance-chart'] = null;
        }
        charts['monthly-distance-chart'] = new Chart(monthlyDistanceCanvas, {
            type: 'bar',
            data: {
                labels: sortedMonths,
                datasets: [
                    {
                        type: 'line',
                        label: 'Distance (km)',
                        data: monthlyDistances,
                        borderColor: '#FC5200',
                        backgroundColor: 'rgba(252,82,0,0.15)',
                        fill: false,
                        tension: 0.1,
                        yAxisID: 'y',
                        order: 1
                    },
                    {
                        type: 'bar',
                        label: '# Runs',
                        data: monthlyCounts,
                        backgroundColor: 'rgba(54,162,235,0.25)',
                        borderColor: 'rgba(54,162,235,0.5)',
                        borderWidth: 1,
                        yAxisID: 'y1',
                        order: 2
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

    // --- Scatter Plot: Pace vs Distance (Running) ---
    const paceVsDistanceCanvas = document.getElementById('pace-vs-distance-chart');
    if (paceVsDistanceCanvas && !charts['pace-vs-distance-chart']) {
        charts['pace-vs-distance-chart'] = new Chart(paceVsDistanceCanvas, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Runs',
                    data: runs.filter(r => r.distance > 0).map(r => ({ x: r.distance / 1000, y: r.moving_time / (r.distance / 1000) })),
                    backgroundColor: 'rgba(252, 82, 0, 0.7)'
                }]
            },
            options: { scales: { x: { title: { display: true, text: 'Distance (km)' } }, y: { title: { display: true, text: 'Pace (sec/km)' } } } }
        });
    }

    // --- Distance Histogram (bin size configurable by variable) ---
    const HISTOGRAM_BIN_SIZE_KM = 1; // <-- Change this value to adjust bin size (in km)
    const histogramCanvas = document.getElementById('distance-histogram');
    if (histogramCanvas) {
        // Clear previous chart if exists
        if (charts['distance-histogram']) {
            charts['distance-histogram'].destroy();
            charts['distance-histogram'] = null;
        }
        const distances = runs.map(act => act.distance / 1000);
        const maxDistance = Math.max(...distances, 0);
        const binSize = HISTOGRAM_BIN_SIZE_KM;
        const binCount = Math.ceil(maxDistance / binSize);
        const bins = Array(binCount).fill(0);
        distances.forEach(d => {
            const idx = Math.floor(d / binSize);
            if (idx < binCount) bins[idx]++;
        });
        charts['distance-histogram'] = new Chart(histogramCanvas, {
            type: 'bar',
            data: {
                labels: bins.map((_, i) => `${(i * binSize).toFixed(1)}-${((i + 1) * binSize).toFixed(1)}`),
                datasets: [{
                    label: '# Activities',
                    data: bins,
                    backgroundColor: 'rgba(252, 82, 0, 0.5)'
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: `Distance (bins of ${binSize} km)` } },
                    y: { title: { display: true, text: 'Count' } }
                }
            }
        });
    }

    // --- Estimated VO2max per activity and time chart ---

    // Change this value to your real max HR if you know it:
    const USER_MAX_HR = 195; // <-- Adjust according to your profile

    // 1. Calculate estimated VO2max per activity
    const vo2maxData = runs
        .filter(act => act.average_heartrate && act.moving_time > 0 && act.distance > 0)
        .map(act => {
            const dist_km = act.distance / 1000;
            const time_hr = act.moving_time / 3600;
            const speed_kmh = dist_km / time_hr;
            // VO2 at pace (simplified): 3.5 + 12 * speed_km_h / 60
            // Or use Daniels: VO2 = (vel_m_min * 0.2) + 3.5
            const vel_m_min = (act.distance / act.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const avg_hr = act.average_heartrate;
            const vo2max = vo2_at_pace / (avg_hr / USER_MAX_HR);
            return {
                date: act.start_date_local.substring(0, 10),
                yearMonth: act.start_date_local.substring(0, 7),
                vo2max: vo2max
            };
        });

    // 2. Group by year-month and calculate monthly average
    const vo2maxByMonth = {};
    vo2maxData.forEach(d => {
        if (!vo2maxByMonth[d.yearMonth]) vo2maxByMonth[d.yearMonth] = [];
        vo2maxByMonth[d.yearMonth].push(d.vo2max);
    });
    const months = Object.keys(vo2maxByMonth).sort();
    const vo2maxMonthlyAvg = months.map(month => {
        const vals = vo2maxByMonth[month];
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    });

    // 3. Calculate rolling mean over monthly values
    function rollingMean(arr, windowSize) {
        const result = [];
        for (let i = 0; i < arr.length; i++) {
            const start = Math.max(0, i - windowSize + 1);
            const window = arr.slice(start, i + 1);
            result.push(window.reduce((a, b) => a + b, 0) / window.length);
        }
        return result;
    }
    const ROLLING_WINDOW = 1; // 3 months
    const vo2maxRolling = rollingMean(vo2maxMonthlyAvg, ROLLING_WINDOW);

    // 4. Chart
    createChart('vo2max-over-time', {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: `Estimated VO₂max (rolling mean ${ROLLING_WINDOW} months)`,
                data: vo2maxRolling,
                fill: true,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                pointRadius: 2,
                tension: 0.2
            }]
        },
        options: {
            plugins: { title: { display: true, text: 'Estimated VO₂max over time' } },
            scales: {
                x: { title: { display: true, text: 'Year-Month' } },
                y: { title: { display: true, text: 'VO₂max' } }
            }
        }
    });

    // --- Race List (workout_type === 1) ---
    const raceListContainer = document.getElementById('race-list');
    if (raceListContainer) {
        const races = runs.filter(act => act.workout_type === 1);
        if (races.length === 0) {
            raceListContainer.innerHTML = "<tr><td>No races found.</td></tr>";
        } else {
            raceListContainer.innerHTML = `
                <table class="df-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Date</th>
                            <th>Distance (km)</th>
                            <th>Time</th>
                            <th>Pace (min/km)</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${races.map(act => {
                const distKm = (act.distance / 1000).toFixed(2);
                const timeSec = act.moving_time;
                const h = Math.floor(timeSec / 3600);
                const m = Math.floor((timeSec % 3600) / 60);
                const s = timeSec % 60;
                const timeStr = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                const pace = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
                const paceStr = pace ? `${Math.floor(pace)}:${Math.round((pace % 1) * 60).toString().padStart(2, '0')}` : '-';
                return `<tr>
                                <td>${act.id}</td>
                                <td>${act.start_date_local.substring(0, 10)}</td>
                                <td>${distKm}</td>
                                <td>${timeStr}</td>
                                <td>${paceStr}</td>
                                <td>
                                  <a href="activity.html?id=${act.id}" target="_blank">
                                    <button>Details</button>
                                  </a>
                                </td>
                            </tr>`;
            }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    // --- ATL, CTL and TSB using effort ---

    // 1. Prepare daily effort data
    const effortByDay = {};
    runs.forEach(act => {
        const date = act.start_date_local.substring(0, 10);
        const effort = act.perceived_exertion ?? act.suffer_score ?? 0;
        effortByDay[date] = (effortByDay[date] || 0) + effort;
    });

    // 2. Generate full date range
    const allEffortDays = Object.keys(effortByDay).sort();
    if (allEffortDays.length === 0) return; // No data

    const startDate = new Date(allEffortDays[0]);
    const endDate = new Date(allEffortDays[allEffortDays.length - 1]);
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
    }

    // 3. Daily effort vector (fill with 0 if no activity)
    const dailyEffort = days.map(date => effortByDay[date] || 0);

    // 4. Exponential moving average function
    function expMovingAvg(arr, lambda) {
        const result = [];
        let prev = arr[0] || 0;
        for (let i = 0; i < arr.length; i++) {
            const val = arr[i] || 0;
            prev = prev + lambda * (val - prev);
            result.push(prev);
        }
        return result;
    }

    // 5. Calculate ATL (7 days), CTL (42 days), TSB
    const atl = expMovingAvg(dailyEffort, 1 / 7);
    const ctl = expMovingAvg(dailyEffort, 1 / 42);
    const tsb = ctl.map((c, i) => c - atl[i]);

    // 6. Chart all three on the same Y axis (left)
    createChart('ctl-atl-tsb', {
        type: 'line',
        data: {
            labels: days,
            datasets: [
                {
                    label: 'ATL (7d)',
                    data: atl,
                    borderColor: '#FC5200',
                    backgroundColor: 'rgba(252,82,0,0.1)',
                    fill: false,
                    tension: 0.2
                },
                {
                    label: 'CTL (42d)',
                    data: ctl,
                    borderColor: '#0074D9',
                    backgroundColor: 'rgba(0,116,217,0.1)',
                    fill: true,
                    tension: 0.2
                },
                {
                    label: 'TSB (CTL-ATL)',
                    data: tsb,
                    borderColor: '#2ECC40',
                    backgroundColor: 'rgba(46,204,64,0.1)',
                    fill: false,
                    tension: 0.2
                }
            ]
        },
        options: {
            plugins: { title: { display: true, text: 'ATL, CTL and TSB (Daily Effort)' } },
            scales: {
                x: { title: { display: true, text: 'Date' } },
                y: { title: { display: true, text: 'Load (ATL/CTL/TSB)' } }
            }
        }
    });

    // --- 7. PERFORMANCE BY GEAR ---

    // 1. Build a mapping from gear_id to gear_id (since only gear_id is available)
    // If you have gear names, you can enhance this later.
    // For now, just use gear_id as the label.
    // 2. Aggregate distance per gear per month
    const gearMonthKm = {};
    runs.forEach(a => {
        if (!a.gear_id) return;
        const gear = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!gearMonthKm[gear]) gearMonthKm[gear] = {};
        gearMonthKm[gear][month] = (gearMonthKm[gear][month] || 0) + a.distance / 1000;
    });

    // 3. Get all months and all gears
    const allMonths = Array.from(new Set(runs.map(a => a.start_date_local.substring(0, 7)))).sort();
    const allGears = Object.keys(gearMonthKm);

    // 4. Prepare data for charts
    const gearDistanceData = allGears.map(gear => {
        return {
            gear: gear,
            monthlyDistances: allMonths.map(month => gearMonthKm[gear][month] || 0)
        };
    });

    // 5. Render gear distance charts
    gearDistanceData.forEach((data, index) => {
        const canvasId = `gear-distance-chart-${index}`;
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            createChart(canvasId, {
                type: 'line',
                data: {
                    labels: allMonths,
                    datasets: [{
                        label: `Distance for ${data.gear}`,
                        data: data.monthlyDistances,
                        borderColor: `hsl(${(index * 360) / gearDistanceData.length}, 100%, 50%)`,
                        fill: false,
                        tension: 0.1
                    }]
                },
                options: {
                    plugins: { title: { display: true, text: `Monthly distance for ${data.gear}` } },
                    scales: {
                        x: { title: { display: true, text: 'Month' } },
                        y: { title: { display: true, text: 'Distance (km)' } }
                    }
                }
            });
        }
    });

    // --- Stacked Area Chart: Cumulative Distance by Gear ---
    const stackedAreaCanvas = document.getElementById('stacked-area-chart');
    if (stackedAreaCanvas) {
        // Prepare data for stacked area chart
        const stackedData = allMonths.map((month) => {
            const monthData = { x: month, y: 0 };
            allGears.forEach((gear, gearIdx) => {
                const val = gearMonthKm[gear][month] || 0;
                monthData[`y${gearIdx}`] = val;
                monthData.y += val;
            });
            return monthData;
        });
        createChart('stacked-area-chart', {
            type: 'line',
            data: {
                labels: allMonths,
                datasets: allGears.map((gear, idx) => ({
                    label: gear,
                    data: stackedData.map(d => ({ x: d.x, y: d[`y${idx}`] })),
                    fill: true,
                    backgroundColor: `hsl(${(idx * 360) / allGears.length}, 70%, 60%)`,
                    borderColor: `hsl(${(idx * 360) / allGears.length}, 70%, 40%)`,
                    tension: 0.2
                }))
            },
            options: {
                plugins: { title: { display: true, text: 'Cumulative distance by gear' } },
                scales: {
                    x: { title: { display: true, text: 'Month' } },
                    y: { title: { display: true, text: 'Distance (km)' } }
                }
            }
        });
    }

    if (allActivities.length) {
        const dates = allActivities.map(a => a.start_date_local.substring(0, 10)).sort();
        document.getElementById('date-from').min = dates[0];
        document.getElementById('date-from').max = dates[dates.length - 1];
        document.getElementById('date-to').min = dates[0];
        document.getElementById('date-to').max = dates[dates.length - 1];
    }

    const allRunsTable = document.getElementById('all-runs-table');
    if (allRunsTable) {
        if (runs.length === 0) {
            allRunsTable.innerHTML = "<tr><td>No runs found.</td></tr>";
        } else {
            allRunsTable.innerHTML = `
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Date</th>
                        <th>Distance (km)</th>
                        <th>Time</th>
                        <th>Pace (min/km)</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    ${runs.map(act => {
                const distKm = (act.distance / 1000).toFixed(2);
                const timeSec = act.moving_time;
                const h = Math.floor(timeSec / 3600);
                const m = Math.floor((timeSec % 3600) / 60);
                const s = timeSec % 60;
                const timeStr = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                const pace = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
                const paceStr = pace ? `${Math.floor(pace)}:${Math.round((pace % 1) * 60).toString().padStart(2, '0')}` : '-';

                return `<tr>
                    <td>${act.id}</td>
                    <td>${act.start_date_local.substring(0, 10)}</td>
                    <td>${distKm}</td>
                    <td>${timeStr}</td>
                    <td>${paceStr}</td>
                    <td>
                      <a href="activity.html?id=${act.id}" target="_blank">
                        <button>Details</button>
                      </a>
                    </td>
                </tr>`;
            }).join('')}
                </tbody>
            `;
        }
    }

    // --- Distance vs Elevation Gain (Scatterplot) ---
    const scatterData = runs.map(r => ({
        x: r.distance / 1000, // km
        y: r.total_elevation_gain || 0 // m
    }));
    plotScatterChart({
        canvasId: 'distance-vs-elevation-chart',
        data: scatterData,
        xLabel: 'Distance (km)',
        yLabel: 'Elevation Gain (m)',
        title: 'Distance vs Elevation Gain',
        color: 'rgba(54,162,235,0.7)'
    });

    // --- Elevation Gain Histogram ---
    const elevationValues = runs.map(r => r.total_elevation_gain || 0);
    plotHistogram({
        canvasId: 'elevation-histogram',
        values: elevationValues,
        binSize: 20, // puedes ajustar el tamaño del bin
        xLabel: 'Elevation Gain (m)',
        yLabel: '# Activities',
        title: 'Elevation Gain Histogram',
        color: 'rgba(252, 82, 0, 0.5)'
    });


    plotRunsHeatmap(runs);
    plotDistanceByDateCharts(runs); // o plotDistanceByDateCharts(filtered) si quieres filtrar
    plotStackedAreaGearChart(runs);   // Stacked area (Gear Usage by Month)
    plotGearGanttChart(runs);         // Mini Gantt (Gear Usage per Month)
}

// --- 6. INITIALIZATION AND AUTHENTICATION ---
async function initializeApp(encodedTokenPayload) {
  try {
    const response = await fetch('/api/strava-activities', {
      headers: {
        Authorization: `Bearer ${btoa(encodedTokenPayload)}`
      }
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    // Actualiza tokens si se han renovado
    if (result.tokens) {
      localStorage.setItem('strava_tokens', JSON.stringify(result.tokens));
    }

    const activities = result.activities;
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Athlete' };
    athleteName.textContent = `Dashboard for ${athleteInfo.firstname}`;

    allActivities = activities;
    renderDashboard(activities);
  } catch (error) {
    handleError("Error initializing the app", error);
  } finally {
    hideLoading();
  }
}


async function handleAuth() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (code) {
    showLoading('Authenticating...');
    try {
      const response = await fetch('/api/strava-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      localStorage.setItem('strava_tokens', JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at
      }));

      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      return handleError('Authentication failed', error);
    }
  }

  const tokenData = localStorage.getItem('strava_tokens');
  if (tokenData) {
    await initializeApp(tokenData);
  } else {
    hideLoading();
  }
}


// --- APP ENTRY POINT ---
loginButton.addEventListener('click', redirectToStravaAuthorize);
logoutButton.addEventListener('click', logout);
handleAuth();

document.getElementById('apply-date-filter').addEventListener('click', () => {
    dateFilterFrom = document.getElementById('date-from').value || null;
    dateFilterTo = document.getElementById('date-to').value || null;
    renderDashboard(allActivities);
});
document.getElementById('reset-date-filter').addEventListener('click', () => {
    dateFilterFrom = null;
    dateFilterTo = null;
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    renderDashboard(allActivities);
});
document.getElementById('refresh-button').addEventListener('click', async () => {
    const tokenData = localStorage.getItem('strava_tokens');
    if (!tokenData) {
        alert('You must be logged in.');
        return;
    }

    const encoded = btoa(tokenData);
    showLoading('Refreshing activities...');

    try {
        const response = await fetch('/api/strava-activities', {
            headers: {
                Authorization: `Bearer ${encoded}`
            }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'API failure');

        if (result.tokens) {
            localStorage.setItem('strava_tokens', JSON.stringify(result.tokens));
        }

        const activities = result.activities;
        localStorage.setItem(CACHE_KEY, JSON.stringify(activities));
        allActivities = activities;
        renderDashboard(activities);
    } catch (error) {
        handleError('Error refreshing activities', error);
    } finally {
        hideLoading();
    }
});


function filterActivitiesByDate(activities) {
    if (!dateFilterFrom && !dateFilterTo) return activities;
    return activities.filter(act => {
        const date = act.start_date_local.substring(0, 10);
        if (dateFilterFrom && date < dateFilterFrom) return false;
        if (dateFilterTo && date > dateFilterTo) return false;
        return true;
    });
}

// --- MISCELLANEOUS FUNCTIONS ---
function getMidpoint(coords) {
    // coords: [[lat, lng], ...]
    const n = coords.length;
    const avgLat = coords.reduce((sum, c) => sum + c[0], 0) / n;
    const avgLng = coords.reduce((sum, c) => sum + c[1], 0) / n;
    return [avgLat, avgLng];
}

function getRunHeatmapPoints(act) {
    const points = [];
    let coords = [];
    // Use decoded_polyline if available, else fallback to start/end
    if (Array.isArray(act.decoded_polyline) && act.decoded_polyline.length > 0) {
        coords = act.decoded_polyline;
    } else if (Array.isArray(act.start_latlng) && Array.isArray(act.end_latlng)) {
        coords = [act.start_latlng, act.end_latlng];
    }
    if (coords.length > 0) {
        const idxs = [
            0,
            Math.floor(coords.length * 0.2),
            Math.floor(coords.length * 0.4),
            Math.floor(coords.length * 0.5),
            Math.floor(coords.length * 0.6),
            Math.floor(coords.length * 0.8),
            coords.length - 1
        ];
        idxs.forEach(i => {
            if (
                coords[i] &&
                typeof coords[i][0] === 'number' &&
                typeof coords[i][1] === 'number' &&
                !isNaN(coords[i][0]) &&
                !isNaN(coords[i][1])
            ) {
                points.push([coords[i][0], coords[i][1]]);
            }
        });
    }
    return points;
}

// --- HEATMAP: RUNS BY LOCATION ---
function plotRunsHeatmap(runs) {
    const points = [];
    runs.forEach(act => {
        points.push(...getRunHeatmapPoints(act));
    });

    // Initialize map only once
    if (!window.runsHeatmapMap) {
        window.runsHeatmapMap = L.map('runs-heatmap').setView([40, -3], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(window.runsHeatmapMap);
    }

    // Remove previous layer
    if (window.runsHeatmapLayer) {
        window.runsHeatmapMap.removeLayer(window.runsHeatmapLayer);
    }

    // Add heatmap layer
    window.runsHeatmapLayer = L.heatLayer(points, { radius: 15, blur: 20, maxZoom: 12 }).addTo(window.runsHeatmapMap);

    // Fit map to points
    if (points.length > 0) {
        window.runsHeatmapMap.fitBounds(points);
    }
}

function rollingMean(arr, windowSize) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = arr.slice(start, i + 1);
        result.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    return result;
}

function plotDistanceCharts(distanceStream, timeStream) {
    // distanceStream: array de metros, timeStream: array de segundos desde inicio
    const accumulated = distanceStream.map((d, i) => d / 1000); // km
    const timeLabels = timeStream.map(t => (t / 60).toFixed(1)); // minutes

    // Rolling mean (ventana de 10 puntos, puedes ajustar)
    const rolling = rollingMean(accumulated, 10);

    // Acumulado vs tiempo
    if (charts['accumulated-distance-chart']) charts['accumulated-distance-chart'].destroy();
    charts['accumulated-distance-chart'] = new Chart(document.getElementById('accumulated-distance-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Accumulated Distance (km)',
                data: accumulated,
                borderColor: 'rgba(54,162,235,1)',
                backgroundColor: 'rgba(54,162,235,0.1)',
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            plugins: { title: { display: true, text: 'Accumulated Distance vs Time' } },
            scales: {
                x: { title: { display: true, text: 'Time (min)' } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });

    // Rolling mean vs tiempo
    if (charts['rolling-mean-distance-chart']) charts['rolling-mean-distance-chart'].destroy();
    charts['rolling-mean-distance-chart'] = new Chart(document.getElementById('rolling-mean-distance-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Rolling Mean Distance (km)',
                data: rolling,
                borderColor: 'rgba(255,99,132,1)',
                backgroundColor: 'rgba(255,99,132,0.1)',
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            plugins: { title: { display: true, text: 'Rolling Mean Distance vs Time' } },
            scales: {
                x: { title: { display: true, text: 'Time (min)' } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}

// Por ejemplo, después de cargar los streams:
plotDistanceCharts(distanceStream, timeStream);

function plotDistanceByDateCharts(activities, windowSize = 10) {
    // Ordena por fecha
    const sorted = [...activities]
        .filter(a => a.type && a.type.includes('Run') && a.distance > 0)
        .sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));

    const labels = sorted.map(a => a.start_date_local.substring(0, 10));
    const distances = sorted.map(a => a.distance / 1000); // km

    // Acumulado
    const accumulated = [];
    distances.reduce((acc, d, i) => accumulated[i] = acc + d, 0);

    // Rolling mean
    function rollingMean(arr, windowSize) {
        return arr.map((_, i, a) => {
            const start = Math.max(0, i - windowSize + 1);
            const window = a.slice(start, i + 1);
            return window.reduce((s, v) => s + v, 0) / window.length;
        });
    }
    const rolling = rollingMean(distances, windowSize);

    // Acumulado vs fecha
    if (charts['accumulated-distance-chart']) charts['accumulated-distance-chart'].destroy();
    charts['accumulated-distance-chart'] = new Chart(document.getElementById('accumulated-distance-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Accumulated Distance (km)',
                data: accumulated,
                borderColor: 'rgba(54,162,235,1)',
                backgroundColor: 'rgba(54,162,235,0.1)',
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            plugins: { title: { display: true, text: 'Accumulated Distance vs Date' } },
            scales: {
                x: { title: { display: true, text: 'Date' } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });

    // Rolling mean vs fecha
    if (charts['rolling-mean-distance-chart']) charts['rolling-mean-distance-chart'].destroy();
    charts['rolling-mean-distance-chart'] = new Chart(document.getElementById('rolling-mean-distance-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `Rolling Mean Distance (window ${windowSize})`,
                data: rolling,
                borderColor: 'rgba(255,99,132,1)',
                backgroundColor: 'rgba(255,99,132,0.1)',
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            plugins: { title: { display: true, text: 'Rolling Mean Distance vs Date' } },
            scales: {
                x: { title: { display: true, text: 'Date' } },
                y: { title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}

function plotScatterChart({ canvasId, data, xLabel, yLabel, title, color }) {
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(document.getElementById(canvasId), {
        type: 'scatter',
        data: {
            datasets: [{
                label: title,
                data,
                backgroundColor: color
            }]
        },
        options: {
            plugins: { title: { display: true, text: title } },
            scales: {
                x: { title: { display: true, text: xLabel } },
                y: { title: { display: true, text: yLabel } }
            }
        }
    });
}

function plotHistogram({ canvasId, values, binSize, xLabel, yLabel, title, color }) {
    if (charts[canvasId]) charts[canvasId].destroy();
    const maxVal = Math.max(...values, 0);
    const binCount = Math.ceil(maxVal / binSize);
    const bins = Array(binCount).fill(0);
    values.forEach(v => {
        const idx = Math.floor(v / binSize);
        if (idx < binCount) bins[idx]++;
    });
    const labels = bins.map((_, i) => `${i * binSize}-${(i + 1) * binSize}`);
    charts[canvasId] = new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: yLabel,
                data: bins,
                backgroundColor: color
            }]
        },
        options: {
            plugins: { title: { display: true, text: title } },
            scales: {
                x: { title: { display: true, text: xLabel } },
                y: { title: { display: true, text: yLabel } }
            }
        }
    });
}

function plotGearGanttChart(runs) {
    // 1. Agrupa por mes y gear
    const gearMonthKm = {};
    runs.forEach(a => {
        if (!a.gear_id) return;
        const gear = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!gearMonthKm[month]) gearMonthKm[month] = {};
        gearMonthKm[month][gear] = (gearMonthKm[month][gear] || 0) + a.distance / 1000;
    });

    // 2. Saca todos los meses y gears únicos
    const allMonths = Object.keys(gearMonthKm).sort();
    const allGears = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    // 3. Prepara los datasets para Chart.js
    const datasets = allGears.map((gear, idx) => ({
        label: gear,
        data: allMonths.map(month => gearMonthKm[month]?.[gear] || 0),
        backgroundColor: `hsl(${(idx * 360) / allGears.length}, 70%, 60%)`
    }));

    // 4. Dibuja el gráfico
    if (charts['gear-gantt-chart']) charts['gear-gantt-chart'].destroy();
    charts['gear-gantt-chart'] = new Chart(document.getElementById('gear-gantt-chart'), {
        type: 'bar',
        data: {
            labels: allMonths,
            datasets: datasets
        },
        options: {
            indexAxis: 'y',
            plugins: { title: { display: true, text: 'Gear Usage per Month (km)' } },
            responsive: true,
            scales: {
                x: { stacked: true, title: { display: true, text: 'Distance (km)' } },
                y: { stacked: true, title: { display: true, text: 'Year-Month' } }
            }
        }
    });
}

function plotStackedAreaGearChart(runs) {
    // Agrupa por mes y gear
    const gearMonthKm = {};
    runs.forEach(a => {
        if (!a.gear_id) return;
        const gear = a.gear?.name || a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!gearMonthKm[month]) gearMonthKm[month] = {};
        gearMonthKm[month][gear] = (gearMonthKm[month][gear] || 0) + a.distance / 1000;
    });

    const allMonths = Object.keys(gearMonthKm).sort();
    const allGears = Array.from(
        new Set(runs.map(a => a.gear?.name || a.gear_id).filter(Boolean))
    );

    const datasets = allGears.map((gear, idx) => ({
        label: gear,
        data: allMonths.map(month => gearMonthKm[month]?.[gear] || 0),
        backgroundColor: `hsl(${(idx * 360) / allGears.length}, 70%, 60%)`,
        fill: true,
        borderWidth: 1,
        tension: 0.2
    }));

    if (charts['stacked-area-chart']) charts['stacked-area-chart'].destroy();
    charts['stacked-area-chart'] = new Chart(document.getElementById('stacked-area-chart'), {
        type: 'line',
        data: {
            labels: allMonths,
            datasets: datasets
        },
        options: {
            plugins: { title: { display: true, text: 'Gear Usage by Month (Stacked Area)' } },
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            stacked: true,
            scales: {
                x: { stacked: true, title: { display: true, text: 'Year-Month' } },
                y: { stacked: true, title: { display: true, text: 'Distance (km)' } }
            }
        }
    });
}