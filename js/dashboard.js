import * as utils from './utils.js';

let selectedRangeDays = 30; // rango inicial

export function renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo) {
    const container = document.getElementById('dashboard-tab');
    if (container && !document.getElementById('range-selector')) {
        const rangeDiv = document.createElement('div');
        rangeDiv.id = 'range-selector';
        rangeDiv.style = 'display:flex;gap:.5rem;margin-bottom:1rem;';
        container.prepend(rangeDiv);
    }

    renderRangeSelector(allActivities, dateFilterFrom, dateFilterTo);
}

function renderRangeSelector(allActivities, dateFilterFrom, dateFilterTo) {
    const container = document.getElementById('range-selector');
    if (!container) return;

    const ranges = [
        { label: 'This Week', type: 'week' },
        { label: 'Last 7 Days', type: 'last7' },
        { label: 'This Month', type: 'month' },
        { label: 'Last 30 Days', type: 'last30' },
        { label: 'Last 90 Days', type: 'last90' },
        { label: 'This Year', type: 'year' }
    ];

    container.innerHTML = ranges.map(r => `
        <button 
            class="range-btn ${r.type === selectedRangeDays ? 'active' : ''}" 
            data-type="${r.type}">
            ${r.label}
        </button>
    `).join('');

    container.querySelectorAll('.range-btn').forEach(btn => {
        btn.onclick = () => {
            selectedRangeDays = btn.dataset.type;
            renderDashboardContent(allActivities, dateFilterFrom, dateFilterTo);
            renderRangeSelector(allActivities, dateFilterFrom, dateFilterTo);
        };
    });

    renderDashboardContent(allActivities, dateFilterFrom, dateFilterTo);
}


function renderDashboardContent(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));
    runs.sort((a, b) => new Date(a.start_date_local || 0) - new Date(b.start_date_local || 0));

    const now = new Date();
    let startDate;

    switch (selectedRangeDays) {
        case 'week': {
            const day = now.getDay(); // 0=Sunday
            const diff = (day === 0 ? 6 : day - 1); // start Monday
            startDate = new Date(now);
            startDate.setDate(now.getDate() - diff);
            break;
        }
        case 'month': {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        }
        case 'year': {
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        }
        case 'last7': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        }
        case 'last30': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            break;
        }
        case 'last90': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 90);
            break;
        }
        default: {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
        }
    }

    const recentRuns = runs.filter(r => new Date(r.start_date_local) >= startDate);
    const midRecentRuns = runs.filter(r => {
        const d = new Date(r.start_date_local);
        return d < startDate && d >= new Date(startDate.getTime() - 30 * 24 * 3600 * 1000);
    });


    console.log(`Rendering dashboard (${selectedRangeDays} días) con ${recentRuns.length} runs`);

    renderVO2maxEvolution(recentRuns, midRecentRuns);
    renderTrainingLoadMetrics(recentRuns, midRecentRuns);
    renderDashboardSummary(recentRuns, midRecentRuns);
    renderRecentMetrics(recentRuns);
    renderTimeDistribution(recentRuns);
    renderPaceProgression(recentRuns);
    renderHeartRateZones(recentRuns);
    renderRecentActivitiesList(recentRuns);
    renderRecentRunsWithMapsAndVO2max(recentRuns);
}

let dashboardCharts = {};
function createDashboardChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found.`);
        return;
    }
    if (dashboardCharts[canvasId]) {
        dashboardCharts[canvasId].destroy();
    }
    dashboardCharts[canvasId] = new Chart(canvas, config);
}



function renderDashboardSummary(lastRuns, previousLastRuns) {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;
    if (!lastRuns.length) {
        container.innerHTML = "<p>No hay datos suficientes.</p>";
        return;
    }

    // --- Helpers ---
    const km = r => r.distance / 1000;
    const h = r => r.moving_time / 3600;
    const sum = (arr, fn) => arr.reduce((s, r) => s + fn(r), 0);
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const calcChange = (curr, prev) => prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : 0;

    // --- Métricas actuales ---
    const totalDistance = sum(lastRuns, km);
    const totalTime = sum(lastRuns, h);
    const totalElevation = sum(lastRuns, r => r.total_elevation_gain || 0);
    const avgHR = avg(lastRuns.filter(r => r.average_heartrate).map(r => r.average_heartrate));
    const avgVO2 = avg(lastRuns.filter(r => r.vo2max).map(r => r.vo2max));
    const avgPace = avg(lastRuns.map(r => (r.moving_time / 60) / (r.distance / 1000)));
    const avgDistance = totalDistance / lastRuns.length || 0;

    // --- Métricas previas ---
    const prevDistance = sum(previousLastRuns, km);
    const prevTime = sum(previousLastRuns, h);
    const prevElevation = sum(previousLastRuns, r => r.total_elevation_gain || 0);
    const prevHR = avg(previousLastRuns.filter(r => r.average_heartrate).map(r => r.average_heartrate));
    const prevVO2 = avg(previousLastRuns.filter(r => r.vo2max).map(r => r.vo2max));
    const prevPace = avg(previousLastRuns.map(r => (r.moving_time / 60) / (r.distance / 1000)));
    const prevAvgDistance = prevDistance / previousLastRuns.length || 0;

    // --- Cambios porcentuales ---
    const distChange = calcChange(totalDistance, prevDistance);
    const timeChange = calcChange(totalTime, prevTime);
    const elevChange = calcChange(totalElevation, prevElevation);
    const paceChange = calcChange(avgPace, prevPace);
    const hrChange = calcChange(avgHR, prevHR);
    const vo2Change = calcChange(avgVO2, prevVO2);
    const avgDistChange = calcChange(avgDistance, prevAvgDistance);

    // --- Renderizado ---
    container.innerHTML = `
        <div class="card">
            <h3>📏 Total Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${totalDistance.toFixed(1)} km</p>
            <small><span style="color:${metricColor('distance', distChange)};">${metricIcon('distance', distChange)} ${distChange}%</span></small>
        </div>

        <div class="card">
            <h3>🕒 Total Time</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${totalTime.toFixed(1)} h</p>
            <small><span style="color:${metricColor('time', timeChange)};">${metricIcon('time', timeChange)} ${timeChange}%</span></small>
        </div>

        <div class="card">
            <h3>⛰️ Elevationn</h3>
            <p style="font-size:2rem;font-weight:bold;color:#2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small><span style="color:${metricColor('elevation', elevChange)};">${metricIcon('elevation', elevChange)} ${elevChange}%</span></small>
        </div>

        <div class="card">
            <h3>⚡ Average Pace</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${utils.formatPace(avgPace)}</p>
            <small><span style="color:${metricColor('pace', paceChange)};">${metricIcon('pace', paceChange)} ${paceChange}%</span></small>
        </div>

        <div class="card">
            <h3>❤️ Average HR</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${avgHR ? avgHR.toFixed(0) : '–'} bpm</p>
            <small><span style="color:${metricColor('hr', hrChange)};">${metricIcon('hr', hrChange)} ${hrChange}%</span></small>
        </div>

        <div class="card">
            <h3>🫁 VO₂max</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${avgVO2 ? avgVO2.toFixed(1) : '–'}</p>
            <small><span style="color:${metricColor('vo2', vo2Change)};">${metricIcon('vo2', vo2Change)} ${vo2Change}%</span></small>
        </div>
        <div class="card">

            <h3>🏃‍♂️ Average Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${avgDistance.toFixed(1)} km</p>
            <small><span style="color:${metricColor('distance', avgDistChange)};">${metricIcon('distance', avgDistChange)} ${avgDistChange}%</span></small>
        </div>
    `;

    // --- Colores e iconos por métrica ---
    function metricColor(metric, change) {
        if (change == 0) return '#888';

        // Menor es mejor → verde si baja
        if (['pace', 'hr'].includes(metric))
            return change < 0 ? '#2ECC40' : '#FF4136';

        // Mayor es mejor → verde si sube
        return change > 0 ? '#2ECC40' : '#FF4136';
    }

    function metricIcon(metric, change) {
        if (change == 0) return '•';

        if (['pace', 'hr'].includes(metric))
            return change < 0 ? '▼' : '▲'; // baja = mejora

        return change > 0 ? '▲' : '▼';
    }
}

// --- helpers de icono/color --- 
function trendColor(p) {
    return p > 0 ? '#2ECC40' : (p < 0 ? '#FF4136' : '#888');
}
function trendIcon(p) {
    return p > 0 ? '▲' : (p < 0 ? '▼' : '•');
}

function renderTrainingLoadMetrics(runs) {
    const container = document.getElementById('training-load-metrics');
    if (!container) return;

    const USER_MAX_HR = 195;
    const now = new Date();

    const tssData = runs.map(r => {
        const timeHours = r.moving_time / 3600;
        const intensity = r.average_heartrate ? (r.average_heartrate / USER_MAX_HR) : 0.7;
        const tss = timeHours * Math.pow(intensity, 4) * 100;
        return { date: new Date(r.start_date_local), tss };
    }).sort((a, b) => a.date - b.date);

    // --- Calculate CTL (42d) and ATL (7d) ---
    let ctl = 0, atl = 0;
    const ctlDays = 42, atlDays = 7;
    for (let i = 0; i < tssData.length; i++) {
        ctl = (tssData[i].tss + ctl * (ctlDays - 1)) / ctlDays;
        atl = (tssData[i].tss + atl * (atlDays - 1)) / atlDays;
    }

    const tsb = ctl - atl;
    const tsbColor = tsb > 0 ? '#2ECC40' : '#FF4136';
    const totalLoad = tssData.reduce((sum, t) => sum + t.tss, 0).toFixed(0);

    // --- Weekly load change ---
    const recent = tssData.filter(t => (now - t.date) / 86400000 <= 14);
    const week1 = recent.filter(t => (now - t.date) / 86400000 <= 7);
    const week2 = recent.filter(t => (now - t.date) / 86400000 > 7);
    const load1 = week1.reduce((a, b) => a + b.tss, 0);
    const load2 = week2.reduce((a, b) => a + b.tss, 0);
    const loadChange = load2 > 0 ? ((load1 - load2) / load2) * 100 : 0;
    const loadTrend = loadChange > 0 ? '↗' : '↘';

    // --- Days without recent activity ---
    const lastRunDate = tssData.length ? tssData[tssData.length - 1].date : null;
    const daysSinceLast = lastRunDate ? Math.floor((now - lastRunDate) / 86400000) : 999;

    // --- General load message ---
    let message = '';
    let color = '#333';
    let emoji = '';

    if (tsb < -15) { emoji = '⚠️'; message = 'High fatigue, rest needed'; color = '#FF4136'; }
    else if (tsb < -5) { emoji = '⚠️'; message = 'Moderate fatigue, maintain controlled load'; color = '#FF851B'; }
    else if (tsb <= 5) { emoji = '✅'; message = 'Optimal balance of load and recovery'; color = '#0074D9'; }
    else { emoji = '💪'; message = 'Ready for more intense load'; color = '#2ECC40'; }

    if (loadChange > 20) message += ', strong weekly increase';
    else if (loadChange > 5) message += ', load increasing';
    else if (loadChange < -10) message += ', possible detraining';

    // --- Realistic injury risk model ---
    // Based on: TSB (fatigue), load change, CTL/ATL ratio, and rest
    const fatigueFactor = Math.max(0, -tsb) * 2;              // more fatigue → more risk
    const loadFactor = Math.max(0, loadChange);               // sharp increases in load
    const ratioFactor = Math.abs(ctl - atl);                  // chronic-acute imbalance
    const restFactor = daysSinceLast > 3 ? (daysSinceLast - 3) * 3 : 0;  // excessive inactivity also penalizes

    let injuryScore = fatigueFactor + loadFactor * 0.6 + ratioFactor * 0.8 + restFactor;
    injuryScore = Math.min(100, Math.max(5, injuryScore / 2)); // normalized

    let injuryRisk = 'Low';
    if (injuryScore > 70) injuryRisk = 'Critical';
    else if (injuryScore > 50) injuryRisk = 'High';
    else if (injuryScore > 30) injuryRisk = 'Moderate';

    // --- Display ---
    container.innerHTML = `
        <div class="load-card" style="background:#f0f9ff;border-radius:8px;padding:1rem;margin:1rem 0;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            <h3>📊 Training Load</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem;">
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:#0074D9;">CTL: ${ctl.toFixed(1)}</p>
                    <small>Chronic load</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:#FF4136;">ATL: ${atl.toFixed(1)}</p>
                    <small>Acute load</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:${tsbColor};">TSB: ${tsb.toFixed(1)}</p>
                    <small>Balance</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:#FC5200;">${totalLoad}</p>
                    <small>Total load</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:${trendColor(loadChange)};">${loadTrend} ${loadChange.toFixed(1)}%</p>
                    <small>Weekly change</small>
                </div>
            </div>
            <p style="text-align:center;font-weight:bold;margin-top:0.5rem;color:${color};">${emoji} ${message}</p>
            <p style="text-align:center;font-weight:bold;margin-top:0.25rem;color:#FF4136;">
                ⚠️ Injury risk: ${injuryRisk} (~${injuryScore.toFixed(0)}%)
            </p>
            <small style="display:block;text-align:center;color:#666;">
                Last activity: ${daysSinceLast === 0 ? 'today' : daysSinceLast + ' days'}
            </small>
        </div>
    `;
}





function renderVO2maxEvolution(lastRuns, previousLastRuns) {
    const runs = lastRuns.concat(previousLastRuns);
    const USER_MAX_HR = 195;

    // Calcular VO₂max y añadirlo a cada run
    runs.forEach(r => {
        if (r.average_heartrate && r.moving_time > 0 && r.distance > 0) {
            const vel_m_min = (r.distance / r.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const vo2max = vo2_at_pace / (r.average_heartrate / USER_MAX_HR);
            r.vo2max = vo2max; // ← nueva propiedad añadida
        } else {
            r.vo2max = null;
        }
    });

    // Crear los datos para la gráfica
    let vo2maxData = lastRuns
        .filter(r => r.vo2max !== null)
        .map((r, idx) => ({
            run: `R${idx + 1}`,
            vo2max: r.vo2max,
            date: r.start_date_local.substring(0, 10)
        }));

    if (vo2maxData.length < 2) {
        const canvas = document.getElementById('dashboard-vo2max');
        if (canvas) canvas.innerHTML = '<p style="text-align:center; padding:2rem;">No datos FC para VO₂max</p>';
        return;
    }

    // Suavizado por ventana móvil
    const windowSize = 7;
    vo2maxData = vo2maxData.map((d, i, arr) => {
        const start = Math.max(0, i - windowSize + 1);
        const slice = arr.slice(start, i + 1);
        const avg = slice.reduce((sum, v) => sum + v.vo2max, 0) / slice.length;
        return { ...d, vo2max: avg };
    });

    // Calcular tendencia
    const vo2maxChange = ((vo2maxData.at(-1).vo2max - vo2maxData[0].vo2max) / vo2maxData[0].vo2max * 100);
    const changeColor = trendColor(vo2maxChange);
    const changeIcon = trendIcon(vo2maxChange);

    // Mostrar tendencia
    const container = document.getElementById('dashboard-vo2max').parentElement;
    const existingNote = container.querySelector('.vo2max-trend');
    if (existingNote) existingNote.remove();

    const trendDiv = document.createElement('div');
    trendDiv.className = 'vo2max-trend';
    trendDiv.innerHTML = `
        <p style="text-align: center; margin-top: 0.5rem; font-weight: bold; color: ${changeColor};">
            ${changeIcon} ${vo2maxChange >= 0 ? '+' : ''}${vo2maxChange.toFixed(1)}%
        </p>
    `;
    container.appendChild(trendDiv);

    // Crear la gráfica
    createDashboardChart('dashboard-vo2max', {
        type: 'line',
        data: {
            labels: vo2maxData.map(d => d.date),
            datasets: [{
                label: 'VO₂max',
                data: vo2maxData.map(d => d.vo2max),
                borderColor: '#0074D9',
                backgroundColor: 'rgba(0, 116, 217, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `VO₂max: ${ctx.parsed.y.toFixed(1)}`
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'ml/kg/min' },
                    beginAtZero: false
                }
            }
        }
    });
}



function renderRecentMetrics(runs) {
    const container = document.getElementById('dashboard-recent-metrics');
    if (!container) return;

    const metricsHtml = runs.slice(-5).reverse().map(r => {
        const pace = (r.moving_time / 60) / (r.distance / 1000);

        return `
            <div class="metric-row" style="display: flex; justify-content: space-between; padding: 0.8rem; border-bottom: 1px solid #eee;">
                <div style="flex: 1;">
                    <strong>${new Date(r.start_date_local).toLocaleDateString()}</strong>
                    <br>
                    <small style="color: #666;">${r.name || 'Run'}</small>
                </div>
                <div style="text-align: center; min-width: 80px;">
                    <div style="font-weight: bold; color: #FC5200;">${(r.distance / 1000).toFixed(2)} km</div>
                    <small style="color: #666;">${utils.formatPace(pace)}/km</small>
                </div>
                <div style="text-align: center; min-width: 80px;">
                    ${r.average_heartrate ? `
                        <div style="font-weight: bold; color: #FF4136;">${r.average_heartrate.toFixed(0)} bpm</div>
                        <small style="color: #666;">Avg HR</small>
                    ` : '<small style="color: #999;">No HR</small>'}
                </div>
                <div style="text-align: right; min-width: 80px;">
                    <a href="activity.html?id=${r.id}" target="_blank" style="font-size:0.9em; color:#0077cc; text-decoration:none;">
                        View →
                    </a>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = metricsHtml;
}

function renderTimeDistribution(runs) {
    const getTimeOfDay = (dateStr) => {
        const hour = new Date(dateStr).getHours();
        if (hour >= 5 && hour < 12) return 'Morning';
        if (hour >= 12 && hour < 17) return 'Afternoon';
        if (hour >= 17 && hour < 21) return 'Evening';
        return 'Night';
    };

    const distribution = runs.reduce((acc, r) => {
        const timeOfDay = getTimeOfDay(r.start_date_local);
        acc[timeOfDay] = (acc[timeOfDay] || 0) + 1;
        return acc;
    }, {});

    const colors = {
        'Morning': '#fbbf24',
        'Afternoon': '#f97316',
        'Evening': '#8b5cf6',
        'Night': '#3b82f6'
    };

    const labels = Object.keys(distribution);
    const data = Object.values(distribution);

    createDashboardChart('dashboard-time-dist', {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: labels.map(l => colors[l])
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}


function renderPaceProgression(runs) {
    const paceData = runs.map((r, idx) => {
        const pace = (r.moving_time / 60) / (r.distance / 1000);
        return {
            run: `R${idx + 1}`,
            pace: pace,
            date: r.start_date_local.substring(0, 10)
        };
    });

    createDashboardChart('dashboard-pace', {
        type: 'line',
        data: {
            labels: paceData.map(d => d.date),
            datasets: [{
                label: 'Pace (min/km)',
                data: paceData.map(d => d.pace),
                borderColor: '#B10DC9',
                backgroundColor: 'rgba(177, 13, 201, 0.1)',
                fill: true,
                tension: 0.2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Pace (min/km)' },
                    reverse: true // Lower is better
                }
            }
        }
    });
}

function renderHeartRateZones(runs) {
    const hrData = runs
        .filter(r => r.average_heartrate && r.max_heartrate)
        .map((r, idx) => ({
            run: `R${idx + 1}`,
            avg: r.average_heartrate,
            max: r.max_heartrate,
            date: r.start_date_local.substring(0, 10)
        }));

    if (hrData.length === 0) {
        const canvas = document.getElementById('dashboard-hr-zones');
        if (canvas) canvas.innerHTML = '<p style="text-align:center; padding:2rem;">No heart rate data available</p>';
        return;
    }

    createDashboardChart('dashboard-hr-zones', {
        type: 'bar',
        data: {
            labels: hrData.map(d => d.date),
            datasets: [
                {
                    label: 'Avg HR',
                    data: hrData.map(d => d.avg),
                    backgroundColor: 'rgba(255, 65, 54, 0.6)'
                },
                {
                    label: 'Max HR',
                    data: hrData.map(d => d.max),
                    backgroundColor: 'rgba(255, 133, 27, 0.4)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: { display: true, text: 'Heart Rate (bpm)' },
                    beginAtZero: false
                }
            }
        }
    });
}

function renderRecentActivitiesList(runs) {
    const container = document.getElementById('dashboard-activities-list');
    if (!container) return;

    if (runs.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:2rem; color:#666;">No recent activities</p>';
        return;
    }

    const activitiesHtml = runs.slice().reverse().map(r => {
        const date = new Date(r.start_date_local);
        const formatDuration = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        };

        return `
            <div class="activity-item" style="padding: 1rem; border-bottom: 1px solid #eee; display: flex; gap: 1rem; align-items: center;">
                <div style="flex: 0 0 60px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #FC5200;">
                        ${date.getDate()}
                    </div>
                    <div style="font-size: 0.8rem; color: #666;">
                        ${date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: bold; margin-bottom: 0.25rem;">
                        ${r.name || 'Run Activity'}
                    </div>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${(r.distance / 1000).toFixed(2)} km • ${formatDuration(r.moving_time)} • 
                        ${r.total_elevation_gain ? `${r.total_elevation_gain.toFixed(0)}m ↗` : 'Flat'}
                    </div>
                </div>
                <div style="flex: 0 0 100px; text-align: right;">
                    <a href="activity.html?id=${r.id}" target="_blank" 
                       style="display: inline-block; padding: 0.5rem 1rem; background: #FC5200; color: white; 
                              text-decoration: none; border-radius: 4px; font-size: 0.9rem;">
                        View
                    </a>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = activitiesHtml;
}

// === NUEVO: CARRERAS RECIENTES CON MAPAS Y VO2MAX ===
function renderRecentRunsWithMapsAndVO2max(runs) {
    const container = document.getElementById('recent-runs-maps');
    if (!container) return;

    if (runs.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:2rem;">No recent runs with maps</p>';
        return;
    }

    const USER_MAX_HR = 195;

    const runsWithMaps = runs.slice(-10).reverse().filter(r => r.map && r.map.summary_polyline);

    if (runsWithMaps.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:2rem;">No runs with map data</p>';
        return;
    }

    const mapsHtml = runsWithMaps.map(r => {
        const vo2max = r.average_heartrate && r.moving_time > 0 && r.distance > 0
            ? (() => {
                const vel_m_min = (r.distance / r.moving_time) * 60;
                const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
                return vo2_at_pace / (r.average_heartrate / USER_MAX_HR);
            })()
            : null;

        return `
            <div class="map-card" style="background: #fff; border-radius: 8px; padding: 1rem; margin: 1rem 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${r.name || 'Run'}</strong>
                        <div style="font-size: 0.9rem; color: #666;">
                            ${new Date(r.start_date_local).toLocaleDateString()} • 
                            ${(r.distance / 1000).toFixed(2)} km • 
                            ${utils.formatTime(r.moving_time)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        ${vo2max ? `
                            <div style="font-size: 1.2rem; font-weight: bold; color: #0074D9;">
                                VO₂max: ${vo2max.toFixed(1)}
                            </div>
                            <small style="color: #666;">ml/kg/min</small>
                        ` : ''}
                    </div>
                </div>
                <div id="map-${r.id}" style="width: 100%; height: 200px; border-radius: 4px; background: #f0f0f0;"></div>
                <div style="margin-top: 0.5rem; text-align: right;">
                    <a href="activity.html?id=${r.id}" target="_blank" style="font-size:0.9em; color:#0077cc; text-decoration:none;">
                        View activity →
                    </a>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = mapsHtml;

    // Render mini maps
    runsWithMaps.forEach(r => {
        renderMiniMap(r.id, r.map.summary_polyline);
    });
}

function renderMiniMap(runId, polyline) {
    const mapDiv = document.getElementById(`map-${runId}`);
    if (!mapDiv || !polyline) return;

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        mapDiv.innerHTML = '<p style="text-align:center; padding:2rem; font-size:0.8rem; color:#999;">Leaflet not loaded</p>';
        return;
    }

    try {
        // Decode polyline
        const coordinates = decodePolyline(polyline);

        if (coordinates.length === 0) {
            mapDiv.innerHTML = '<p style="text-align:center; padding:2rem; font-size:0.8rem; color:#999;">No coordinates</p>';
            return;
        }

        // Create map
        const map = L.map(mapDiv, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false
        });

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Add polyline
        const polylineLayer = L.polyline(coordinates, {
            color: '#FC5200',
            weight: 3,
            opacity: 0.8
        }).addTo(map);

        // Fit bounds
        map.fitBounds(polylineLayer.getBounds(), { padding: [10, 10] });

        // Add start/end markers
        if (coordinates.length > 0) {
            L.circleMarker(coordinates[0], {
                radius: 5,
                color: '#2ECC40',
                fillColor: '#2ECC40',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(map).bindPopup('Start');

            L.circleMarker(coordinates[coordinates.length - 1], {
                radius: 5,
                color: '#FF4136',
                fillColor: '#FF4136',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(map).bindPopup('End');
        }
    } catch (error) {
        console.error('Error rendering mini map:', error);
        mapDiv.innerHTML = '<p style="text-align:center; padding:2rem; font-size:0.8rem; color:#999;">Error loading map</p>';
    }
}

// Polyline decoder (Google Encoded Polyline Algorithm Format)
function decodePolyline(encoded) {
    if (!encoded) return [];

    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
        let b;
        let shift = 0;
        let result = 0;

        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);

        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;

        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);

        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        poly.push([lat / 1e5, lng / 1e5]);
    }

    return poly;
}
