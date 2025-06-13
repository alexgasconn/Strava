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
                            <th>Elevation (m)</th>
                            <th>Type</th>
                            <th>Gear</th>
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
                const type = typeof act.workout_type === 'number'
                    ? (['Workout', 'Race', 'Long Run', 'Workout'][act.workout_type] || 'Other')
                    : (act.type || '');
                return `<tr>
                                <td>${act.id}</td>
                                <td>${act.start_date_local.substring(0, 10)}</td>
                                <td>${distKm}</td>
                                <td>${timeStr}</td>
                                <td>${paceStr}</td>
                                <td>${act.total_elevation_gain || 0}</td>
                                <td>${type}</td>
                                <td>${act.gear_id || ''}</td>
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
                    fill: false,
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
                        <th>Elevation (m)</th>
                        <th>Type</th>
                        <th>Gear</th>
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
                const type = typeof act.workout_type === 'number'
                    ? (['Workout', 'Race', 'Long Run', 'Workout'][act.workout_type] || 'Other')
                    : (act.type || '');
                return `<tr>
                    <td>${act.id}</td>
                    <td>${act.start_date_local.substring(0, 10)}</td>
                    <td>${distKm}</td>
                    <td>${timeStr}</td>
                    <td>${paceStr}</td>
                    <td>${act.total_elevation_gain || 0}</td>
                    <td>${type}</td>
                    <td>${act.gear_id || ''}</td>
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

    // --- Plot Location Bar Chart ---
    plotLocationBarChart(runs);
}

 // --- 6. INITIALIZATION AND AUTHENTICATION ---
async function initializeApp(accessToken) {
    try {
        let activities;
        const cachedActivities = localStorage.getItem(CACHE_KEY);
        if (cachedActivities) {
            activities = JSON.parse(cachedActivities);
        } else {
            showLoading('Fetching activity history...');
            const response = await fetch('/api/strava-activities', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!response.ok) throw new Error((await response.json()).error || 'API failure');
            activities = await response.json();
            localStorage.setItem(CACHE_KEY, JSON.stringify(activities));
        }

        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Athlete' };
        athleteName.textContent = `Dashboard for ${athleteInfo.firstname}`;

        allActivities = activities; // Save all for filtering
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
    let accessToken = localStorage.getItem('strava_access_token');
    if (code) {
        showLoading('Authenticating...');
        try {
            const response = await fetch('/api/strava-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
            if (!response.ok) throw new Error((await response.json()).error);
            const data = await response.json();
            accessToken = data.access_token;
            localStorage.setItem('strava_access_token', accessToken);
            window.history.replaceState({}, '', window.location.pathname);
        } catch (error) {
            return handleError('Authentication failed', error);
        }
    }
    if (accessToken) {
        initializeApp(accessToken);
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

// Helper: reverse geocode using Nominatim
async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'StravaDashboard/1.0' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.address.neighbourhood || data.address.suburb || data.address.city || data.address.town || data.address.village || data.address.state || data.address.country || "Unknown";
}

// Main function to process runs and plot
async function plotLocationBarChart(runs) {
    const locationCounts = {};
    for (const run of runs) {
        // Use start_latlng and end_latlng; if you have polyline, decode it for more points
        const coords = [];
        if (run.start_latlng) coords.push(run.start_latlng);
        if (run.end_latlng) coords.push(run.end_latlng);
        // If you have a decoded polyline, use it for midpoint
        let mid = null;
        if (run.decoded_polyline && run.decoded_polyline.length > 0) {
            mid = getMidpoint(run.decoded_polyline);
        } else if (coords.length === 2) {
            mid = getMidpoint(coords);
        }
        // Reverse geocode start, mid, finish (with 1s delay between requests)
        const points = [coords[0], mid, coords[coords.length - 1]].filter(Boolean);
        for (const pt of points) {
            if (!pt) continue;
            const loc = await reverseGeocode(pt[0], pt[1]);
            if (loc) locationCounts[loc] = (locationCounts[loc] || 0) + 1;
            await new Promise(res => setTimeout(res, 1100)); // 1.1s delay for Nominatim
        }
    }
    // Prepare data for Chart.js
    const sorted = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log('Top 20 Locations:', sorted);
    const ctx = document.getElementById('location-bar-chart').getContext('2d');
    if (charts['location-bar-chart']) {
        charts['location-bar-chart'].destroy();
        charts['location-bar-chart'] = null;
    }
    charts['location-bar-chart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(e => e[0]),
            datasets: [{
                label: 'Number of Runs',
                data: sorted.map(e => e[1]),
                backgroundColor: 'rgba(54, 162, 235, 0.7)'
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: { title: { display: true, text: 'Most Common Run Locations' } }
        }
    });
}

// Usage: call this after you have your runs array
plotLocationBarChart(runs);
