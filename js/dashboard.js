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
        { label: 'Last 3 Months', type: 'last3m' },
        { label: 'Last 6 Months', type: 'last6m' },
        { label: 'This Year', type: 'year' },
        { label: 'Last 365 Days', type: 'last365' }
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
            const day = now.getDay();
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
        case 'last3m': {
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 3);
            break;
        }
        case 'last6m': {
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 6);
            break;
        }
        case 'last365': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 365);
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

    renderTrainingLoadMetrics(recentRuns, allActivities);
    renderPMCChart(recentRuns, allActivities);
    renderRecentActivitiesPreview(recentRuns);
    renderDashboardSummary(recentRuns, midRecentRuns);
    renderTSSBarChart(recentRuns, selectedRangeDays);
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
        container.innerHTML = "<p>Not enough data.</p>";
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
    const injuryRisk = avg(lastRuns.map(r => r.injuryRisk || 0));

    // --- Métricas previas ---
    const prevDistance = sum(previousLastRuns, km);
    const prevTime = sum(previousLastRuns, h);
    const prevElevation = sum(previousLastRuns, r => r.total_elevation_gain || 0);
    const prevHR = avg(previousLastRuns.filter(r => r.average_heartrate).map(r => r.average_heartrate));
    const prevVO2 = avg(previousLastRuns.filter(r => r.vo2max).map(r => r.vo2max));
    const prevPace = avg(previousLastRuns.map(r => (r.moving_time / 60) / (r.distance / 1000)));
    const prevAvgDistance = prevDistance / previousLastRuns.length || 0;
    const prevInjuryRisk = avg(previousLastRuns.map(r => r.injuryRisk || 0));

    // --- Cambios porcentuales ---
    const distChange = calcChange(totalDistance, prevDistance);
    const timeChange = calcChange(totalTime, prevTime);
    const elevChange = calcChange(totalElevation, prevElevation);
    const paceChange = calcChange(avgPace, prevPace);
    const hrChange = calcChange(avgHR, prevHR);
    const vo2Change = calcChange(avgVO2, prevVO2);
    const avgDistChange = calcChange(avgDistance, prevAvgDistance);
    const injuryRiskChange = calcChange(injuryRisk, prevInjuryRisk);


    // --- Renderizado ---
    container.innerHTML = `
        <div class="card">
            <h3>📏 Total Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${totalDistance.toFixed(1)} km</p>
            <small><span style="color:${utils.metricColor('distance', distChange)};">${utils.metricIcon('distance', distChange)} ${distChange}%</span></small>
        </div>

        <div class="card">
            <h3>🕒 Total Time</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${totalTime.toFixed(1)} h</p>
            <small><span style="color:${utils.metricColor('time', timeChange)};">${utils.metricIcon('time', timeChange)} ${timeChange}%</span></small>
        </div>

        <div class="card">
            <h3>⛰️ Elevation</h3>
            <p style="font-size:2rem;font-weight:bold;color:#2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small><span style="color:${utils.metricColor('elevation', elevChange)};">${utils.metricIcon('elevation', elevChange)} ${elevChange}%</span></small>
        </div>

        <div class="card">
            <h3>🫁 VO₂max</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${avgVO2 ? avgVO2.toFixed(1) : '–'}</p>
            <small><span style="color:${utils.metricColor('vo2', vo2Change)};">${utils.metricIcon('vo2', vo2Change)} ${vo2Change}%</span></small>
        </div>

        <div class="card">
            <h3>⚠️ Injury Risk</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${injuryRisk.toFixed(1)}%</p>
            <small><span style="color:${utils.metricColor('injury', injuryRiskChange)};">${utils.metricIcon('injury', injuryRiskChange)} ${injuryRiskChange}%</span></small>
        </div>

        <div class="card">
            <h3>⚡ Average Pace</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;"> ${utils.paceDecimalToTime(avgPace)} </p>
            <small><span style="color:${utils.metricColor('pace', paceChange)};">${utils.metricIcon('pace', paceChange)} ${paceChange}%</small>
        </div>

        <div class="card">
            <h3>❤️ Average HR</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${avgHR ? avgHR.toFixed(0) : '–'} bpm</p>
            <small><span style="color:${utils.metricColor('hr', hrChange)};">${utils.metricIcon('hr', hrChange)} ${hrChange}%</span></small>
        </div>

        <div class="card">
            <h3>🏃‍♂️ Average Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${avgDistance.toFixed(1)} km</p>
            <small><span style="color:${utils.metricColor('distance', avgDistChange)};">${utils.metricIcon('distance', avgDistChange)} ${avgDistChange}%</span></small>
        </div>
        
    `;


}

/**
 * Renders Training Load Metrics (CTL, ATL, TSB, Injury Risk, Load)
 * Uses preprocessed activities with .tss, .atl, .ctl, .tsb, .injuryRisk
 */
function renderTrainingLoadMetrics(runs, allActivities) {
    const container = document.getElementById('training-load-metrics');
    if (!container) return;

    const now = new Date();
    const validRuns = runs.filter(r => 
        r.tss != null && 
        r.atl != null && 
        r.ctl != null && 
        r.tsb != null && 
        r.injuryRisk != null
    );

    if (validRuns.length === 0) {
        container.innerHTML = `<p style="color:#999;">No processed training load data.</p>`;
        return;
    }

    // Latest values
    const last = validRuns[validRuns.length - 1];
    const lastCTL = last.ctl;
    const lastATL = last.atl;
    const lastTSB = last.tsb;
    const lastInjuryRisk = last.injuryRisk;

    // Total load in visible range
    const totalLoad = validRuns.reduce((sum, r) => sum + r.tss, 0).toFixed(0);

    // Weekly load change (last 14 days)
    const recent = validRuns.filter(r => {
        const actDate = new Date(r.start_date_local);
        return (now - actDate) / 86400000 <= 14;
    });

    const week1 = recent.filter(r => (now - new Date(r.start_date_local)) / 86400000 <= 7);
    const week2 = recent.filter(r => (now - new Date(r.start_date_local)) / 86400000 > 7);

    const loadWeek1 = week1.reduce((a, b) => a + b.tss, 0);
    const loadWeek2 = week2.reduce((a, b) => a + b.tss, 0);
    const loadChangePct = loadWeek2 > 0 ? ((loadWeek1 - loadWeek2) / loadWeek2) * 100 : 0;
    const trend = loadChangePct > 0 ? 'Up' : 'Down';
    const tsbColor = lastTSB > 0 ? '#2ECC40' : '#FF4136';

    // Smart message
    let message = '';
    let color = '#333';
    let emoji = '';

    if (lastTSB < -15) {
        emoji = 'Warning';
        message = 'High fatigue — rest needed';
        color = '#FF4136';
    } else if (lastTSB < -5) {
        emoji = 'Warning';
        message = 'Moderate fatigue — monitor load';
        color = '#FF851B';
    } else if (lastTSB <= 5) {
        emoji = 'Checkmark';
        message = 'Optimal balance';
        color = '#0074D9';
    } else {
        emoji = 'Muscle';
        message = 'Ready for intensity';
        color = '#2ECC40';
    }

    if (loadChangePct > 20) message += ', strong weekly ramp';
    else if (loadChangePct > 5) message += ', load increasing';
    else if (loadChangePct < -10) message += ', possible form loss';

    // Render
    container.innerHTML = `
        <div class="load-card" style="background:#f8f9fa;border-radius:12px;padding:1.2rem;margin:1rem 0;box-shadow:0 4px 8px rgba(0,0,0,0.08);">
            <h3 style="margin:0 0 0.8rem;font-size:1.1rem;color:#1a1a1a;">Training Load</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:0.8rem;">
                <div>
                    <p style="margin:0;font-size:1.4rem;font-weight:bold;color:#0074D9;">${lastCTL.toFixed(1)}</p>
                    <small style="color:#666;">CTL (Chronic)</small>
                </div>
                <div>
                    <p style="margin:0;font-size:1.4rem;font-weight:bold;color:#FF4136;">${lastATL.toFixed(1)}</p>
                    <small style="color:#666;">ATL (Acute)</small>
                </div>
                <div>
                    <p style="margin:0;font-size:1.4rem;font-weight:bold;color:${tsbColor};">${lastTSB.toFixed(1)}</p>
                    <small style="color:#666;">TSB (Balance)</small>
                </div>
                <div>
                    <p style="margin:0;font-size:1.4rem;font-weight:bold;color:#8E44AD;">${totalLoad}</p>
                    <small style="color:#666;">Total Load</small>
                </div>
                <div>
                    <p style="margin:0;font-size:1.3rem;font-weight:bold;color:${getTrendColor(loadChangePct)};">
                        ${trend} ${Math.abs(loadChangePct).toFixed(0)}%
                    </p>
                    <small style="color:#666;">Weekly Δ</small>
                </div>
            </div>
            <p style="text-align:center;margin:0.8rem 0 0.4rem;font-weight:600;color:${color};">
                ${emoji} ${message}
            </p>
            <p style="text-align:center;margin:0;font-weight:600;color:#e74c3c;">
                Warning Injury Risk: ~${(lastInjuryRisk * 100).toFixed(0)}%
            </p>
        </div>
    `;
}

// Helper
function getTrendColor(pct) {
    if (pct > 15) return '#e74c3c';
    if (pct > 5) return '#f39c12';
    if (pct < -10) return '#e74c3c';
    if (pct < -5) return '#f39c12';
    return '#27ae60';
}



/**
 * Renders PMC Chart: CTL, ATL, TSB, Injury Risk + VO₂max (runs only)
 */
function renderPMCChart(runs, allActivities) {
    const canvas = document.getElementById('pmc-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (window.pmcChart) window.pmcChart.destroy();

    // Extract time series from preprocessed runs
    const sorted = runs
        .filter(r => r.atl != null && r.ctl != null && r.tsb != null && r.injuryRisk != null)
        .sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));

    if (sorted.length === 0) {
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('No data to display', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = sorted.map(r => {
        const d = new Date(r.start_date_local);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    const ctl = sorted.map(r => r.ctl);
    const atl = sorted.map(r => r.atl);
    const tsb = sorted.map(r => r.tsb);
    const injuryRisk = sorted.map(r => r.injuryRisk * 100); // %
    const vo2max = sorted.map(r => r.vo2max || null);

    window.pmcChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'CTL (Chronic)',
                    data: ctl,
                    borderColor: '#0074D9',
                    backgroundColor: 'rgba(0, 116, 217, 0.1)',
                    tension: 0.3,
                    yAxisID: 'y',
                    pointRadius: 0
                },
                {
                    label: 'ATL (Acute)',
                    data: atl,
                    borderColor: '#FF4136',
                    backgroundColor: 'rgba(255, 65, 54, 0.1)',
                    tension: 0.3,
                    yAxisID: 'y',
                    pointRadius: 0
                },
                {
                    label: 'TSB (Balance)',
                    data: tsb,
                    borderColor: '#2ECC40',
                    backgroundColor: 'rgba(46, 204, 64, 0.1)',
                    tension: 0.3,
                    yAxisID: 'y1',
                    pointRadius: 0
                },
                {
                    label: 'Injury Risk %',
                    data: injuryRisk,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.3,
                    yAxisID: 'y2',
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: 'VO₂max (ml/kg/min)',
                    data: vo2max,
                    borderColor: '#9B59B6',
                    backgroundColor: 'rgba(155, 89, 182, 0.1)',
                    tension: 0.3,
                    yAxisID: 'y3',
                    pointRadius: 3,
                    pointBackgroundColor: '#9B59B6',
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: 'Performance Management Chart', font: { size: 16 } },
                tooltip: { mode: 'index', intersect: false },
                legend: { position: 'top' }
            },
            scales: {
                x: { display: true, title: { display: true, text: 'Date' } },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'TSS' },
                    min: 0,
                    max: Math.max(...ctl, ...atl) * 1.2
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'TSB' },
                    grid: { drawOnChartArea: false },
                    min: -40,
                    max: 40
                },
                y2: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Risk %' },
                    grid: { drawOnChartArea: false },
                    min: 0,
                    max: 100,
                    display: false
                },
                y3: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'VO₂max' },
                    grid: { drawOnChartArea: false },
                    min: 20,
                    max: 80,
                    display: false
                }
            }
        }
    });
}




function renderRecentActivitiesPreview(runs) {
    const container = document.getElementById('recent-activities-preview');
    if (!container) return;

    const USER_MAX_HR = 195;

    if (!runs || runs.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:2rem; color:#666;">No recent activities</p>';
        return;
    }

    // Tomamos las 8 más recientes con mapa
    const recentRuns = runs.slice(-8).reverse().filter(r => r.map && r.map.summary_polyline);

    const html = recentRuns.map(r => {
        const date = new Date(r.start_date_local);
        const distKm = (r.distance / 1000).toFixed(2);
        const pace = (r.moving_time / 60) / (r.distance / 1000);
        const time = utils.formatTime(r.moving_time);
        const avgSpeed = ((r.distance / 1000) / (r.moving_time / 3600)).toFixed(1);

        // Calcular VO₂max si hay HR
        const vo2max = r.average_heartrate && r.moving_time > 0 && r.distance > 0
            ? (() => {
                const vel_m_min = (r.distance / r.moving_time) * 60;
                const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
                return vo2_at_pace / (r.average_heartrate / USER_MAX_HR);
            })()
            : null;

        // Calcular zona de HR si existe (basado en % de HR máxima)
        const hrZone = r.average_heartrate
            ? (() => {
                const hrPercent = (r.average_heartrate / USER_MAX_HR) * 100;
                if (hrPercent < 60) return 1;      // Z1: 50-60% (Recuperación)
                if (hrPercent < 70) return 2;      // Z2: 60-70% (Aeróbica)
                if (hrPercent < 80) return 3;      // Z3: 70-80% (Tempo)
                if (hrPercent < 90) return 4;      // Z4: 80-90% (Umbral)
                return 5;                          // Z5: 90-100% (Máximo)
            })()
            : null;

        const hrZoneColors = {
            1: '#4CAF50',  // Verde - Recuperación
            2: '#8BC34A',  // Verde claro - Aeróbica
            3: '#FFC107',  // Amarillo - Tempo
            4: '#FF9800',  // Naranja - Umbral
            5: '#F44336'   // Rojo - Máximo
        };

        return `
            <div class="activity-card" 
                 style="background:#fff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); 
                        margin:1.5rem 0; overflow:hidden; transition: transform 0.2s, box-shadow 0.2s;
                        border: 1px solid #f0f0f0;">
                
                <div style="display:flex; gap:1.25rem; padding:1.25rem;">
                    <!-- Mapa más grande y sin nada debajo -->
                    <div style="flex-shrink:0;">
                        <div style="width:200px; height:200px; background:#f8f9fa; border-radius:10px; 
                                    overflow:hidden; border:2px solid #e9ecef; box-shadow:0 2px 4px rgba(0,0,0,0.06);" 
                             id="map-${r.id}"></div>
                    </div>
                    
                    <!-- Contenido a la derecha -->
                    <div style="flex:1; display:flex; flex-direction:column; gap:1rem; min-width:0;">
                        <!-- Header -->
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div style="flex:1; min-width:0;">
                                <h3 style="margin:0; font-size:1.15rem; font-weight:600; color:#1a1a1a; 
                                           white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    ${r.name || 'Run'}
                                </h3>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.35rem;">
                                    <span style="font-size:0.85rem; color:#666;">
                                        ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    ${hrZone ? `
                                        <span style="background:${hrZoneColors[hrZone]}; color:#fff; 
                                                     padding:2px 7px; border-radius:4px; font-size:0.7rem; font-weight:600;">
                                            Z${hrZone}
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                            <a href="html/activity.html?id=${r.id}" target="_blank" 
                               style="font-size:0.85rem; color:#FC5200; text-decoration:none; font-weight:500;
                                      padding:5px 14px; border-radius:6px; background:#FFF5F0; 
                                      white-space:nowrap; margin-left:0.5rem; transition:background 0.2s;">
                                View →
                            </a>
                        </div>

                        <!-- Stats principales - más compactas -->
                        <div style="display:flex; gap:0.75rem;">
                            <div style="flex:1; background:linear-gradient(135deg, #FF6B35 0%, #FC5200 100%); 
                                        padding:0.65rem 0.8rem; border-radius:8px; color:#fff;">
                                <div style="font-size:1.5rem; font-weight:700; line-height:1;">
                                    ${distKm}
                                </div>
                                <div style="font-size:0.7rem; opacity:0.9; margin-top:3px; font-weight:500;">
                                    KILOMETERS
                                </div>
                            </div>
                            
                            <div style="flex:1; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                        padding:0.65rem 0.8rem; border-radius:8px; color:#fff;">
                                <div style="font-size:1.5rem; font-weight:700; line-height:1;">
                                    ${utils.paceDecimalToTime(pace)}
                                </div>
                                <div style="font-size:0.7rem; opacity:0.9; margin-top:3px; font-weight:500;">
                                    MIN/KM
                                </div>
                            </div>

                            <div style="flex:1; background:linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
                                        padding:0.65rem 0.8rem; border-radius:8px; color:#fff;">
                                <div style="font-size:1.5rem; font-weight:700; line-height:1;">
                                    ${time.split(':')[0]}:${time.split(':')[1]}
                                </div>
                                <div style="font-size:0.7rem; opacity:0.9; margin-top:3px; font-weight:500;">
                                    DURATION
                                </div>
                            </div>
                        </div>

                        <!-- Stats secundarias - más compactas y organizadas -->
                        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                            ${r.athlete_count && r.athlete_count > 1 ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">👥</span>
                                    <div>
                                        <div style="font-weight:600; color:#9b59b6; font-size:0.9rem; line-height:1.2;">
                                            ${r.athlete_count} athletes
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Group run
                                        </div>
                                    </div>
                                </div>
                            ` : `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">🏃</span>
                                    <div>
                                        <div style="font-weight:600; color:#7f8c8d; font-size:0.9rem; line-height:1.2;">
                                            Solo
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Training
                                        </div>
                                    </div>
                                </div>
                            `}

                            ${r.suffer_score ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">🔥</span>
                                    <div>
                                        <div style="font-weight:600; color:#e67e22; font-size:0.9rem; line-height:1.2;">
                                            ${r.suffer_score}
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Suffer
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${r.elapsed_time && r.moving_time ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">⏸️</span>
                                    <div>
                                        <div style="font-weight:600; color:#34495e; font-size:0.9rem; line-height:1.2;">
                                            ${((r.moving_time / r.elapsed_time) * 100).toFixed(0)}%
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Moving
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${r.average_heartrate ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">❤️</span>
                                    <div>
                                        <div style="font-weight:600; color:#e74c3c; font-size:0.9rem; line-height:1.2;">
                                            ${r.average_heartrate.toFixed(0)} bpm
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Avg HR
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${vo2max ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">💨</span>
                                    <div>
                                        <div style="font-weight:600; color:#3498db; font-size:0.9rem; line-height:1.2;">
                                            ${vo2max.toFixed(1)}
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            VO₂max
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${r.total_elevation_gain ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">⛰️</span>
                                    <div>
                                        <div style="font-weight:600; color:#16a085; font-size:0.9rem; line-height:1.2;">
                                            ${r.total_elevation_gain.toFixed(0)}m
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Elevation
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${r.average_cadence ? `
                                <div style="display:flex; align-items:center; gap:0.4rem;">
                                    <span style="font-size:1rem;">👟</span>
                                    <div>
                                        <div style="font-weight:600; color:#f39c12; font-size:0.9rem; line-height:1.2;">
                                            ${r.average_cadence.toFixed(0)} spm
                                        </div>
                                        <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:0.3px;">
                                            Cadence
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Renderizar los mini mapas
    recentRuns.forEach(r => {
        renderMiniMap(r.id, r.map.summary_polyline);
    });

    // Añadir estilos hover
    const style = document.createElement('style');
    style.textContent = `
        .activity-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
        }
        .activity-card a:hover {
            background: #FFE5DB !important;
        }
    `;
    document.head.appendChild(style);
}

function renderMiniMap(runId, polyline) {
    const mapDiv = document.getElementById(`map-${runId}`);
    if (!mapDiv || !polyline) return;

    // Si Leaflet no está cargado
    if (typeof L === 'undefined') {
        mapDiv.innerHTML = '<p style="text-align:center; padding:2rem; font-size:0.8rem; color:#999;">Leaflet not loaded</p>';
        return;
    }

    try {
        const coordinates = decodePolyline(polyline);
        if (coordinates.length === 0) {
            mapDiv.innerHTML = '<p style="text-align:center; padding:2rem; font-size:0.8rem; color:#999;">No coordinates</p>';
            return;
        }

        // Crear mapa sin controles
        const map = L.map(mapDiv, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false
        });

        // Capa base
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Trazado del recorrido
        const polylineLayer = L.polyline(coordinates, {
            color: '#FC5200',
            weight: 3,
            opacity: 0.8
        }).addTo(map);

        map.fitBounds(polylineLayer.getBounds(), { padding: [10, 10] });

        // Marcadores inicio y fin
        if (coordinates.length > 0) {
            L.circleMarker(coordinates[0], {
                radius: 5,
                color: '#2ECC40',
                fillColor: '#2ECC40',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(map);

            L.circleMarker(coordinates[coordinates.length - 1], {
                radius: 5,
                color: '#FF4136',
                fillColor: '#FF4136',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(map);
        }
    } catch (err) {
        console.error('Error rendering mini map:', err);
        mapDiv.innerHTML = '<p style="text-align:center; padding:2rem; font-size:0.8rem; color:#999;">Error loading map</p>';
    }
}


function decodePolyline(encoded) {
    if (!encoded) return [];

    const poly = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        poly.push([lat / 1e5, lng / 1e5]);
    }

    return poly;
}




/**
 * Renderiza una gráfica de barras: TSS por período
 */
function renderTSSBarChart(activities, rangeType) {
    const canvas = document.getElementById('tss-bar-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (window.tssBarChart) window.tssBarChart.destroy();

    // Calcular las fechas de inicio y fin del período seleccionado
    const now = new Date();
    let startDate, endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    switch (rangeType) {
        case 'week': {
            const day = now.getDay();
            const diff = (day === 0 ? 6 : day - 1); // start Monday
            startDate = new Date(now);
            startDate.setDate(now.getDate() - diff);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'month': {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'year': {
            startDate = new Date(now.getFullYear(), 0, 1);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'last7': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'last30': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'last3m': {
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 3);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'last6m': {
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 6);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'last365': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 365);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        default: {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
        }
    }

    const { labels, data } = groupTSSByPeriod(activities, rangeType, startDate, endDate);

    if (!labels.length || !data.length) {
        console.warn('No TSS data to render');
        return;
    }

    window.tssBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'TSS',
                data,
                backgroundColor: '#e74c3c',
                borderColor: '#fff',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'TSS por período',
                    font: { size: 16 }
                },
                tooltip: { mode: 'index', intersect: false },
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true
                    }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'TSS' },
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/**
 * Obtiene el lunes de la semana para una fecha dada
 */
function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
    const diff = day === 0 ? -6 : 1 - day; // Si es domingo, retroceder 6 días
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Obtiene el número de semana del año (ISO 8601)
 */
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

/**
 * Agrupa TSS por período (día, semana o mes) incluyendo períodos sin datos
 */
function groupTSSByPeriod(activities, rangeType, startDate, endDate) {
    // Usar las fechas del rango completo, no solo las de las actividades
    const minDate = new Date(startDate);
    const maxDate = new Date(endDate);

    const isDaily = ['week', 'last7', 'month', 'last30'].includes(rangeType);
    const isWeekly = ['last3m', 'last6m'].includes(rangeType);
    const isMonthly = ['last365', 'year'].includes(rangeType);

    const grouped = {};
    const curr = new Date(minDate);

    // Seguridad: límite máximo de iteraciones (por si hay error de rango)
    let guard = 0;

    // Crear todos los períodos del rango (incluso sin datos)
    while (curr <= maxDate && guard++ < 2000) {
        let key;
        if (isDaily) {
            key = curr.toISOString().split('T')[0];
            curr.setDate(curr.getDate() + 1);
        } else if (isWeekly) {
            const monday = getMondayOfWeek(curr);
            key = monday.toISOString().split('T')[0];
            curr.setDate(curr.getDate() + 7);
        } else if (isMonthly) {
            key = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
            curr.setMonth(curr.getMonth() + 1);
        } else {
            // fallback: evitar bucle infinito
            key = curr.toISOString().split('T')[0];
            curr.setDate(curr.getDate() + 1);
        }
        grouped[key] = 0;
    }

    // Añadir datos reales de actividades (solo si hay actividades)
    if (activities && activities.length > 0) {
        for (const a of activities) {
            if (!a.start_date_local) continue;
            const date = new Date(a.start_date_local);
            if (isNaN(date)) continue;

            // Solo procesar si está dentro del rango
            if (date < minDate || date > maxDate) continue;

            let key;
            if (isDaily) {
                key = date.toISOString().split('T')[0];
            } else if (isWeekly) {
                const monday = getMondayOfWeek(date);
                key = monday.toISOString().split('T')[0];
            } else if (isMonthly) {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = date.toISOString().split('T')[0];
            }

            const tss = a.tss ?? (a.suffer_score ? a.suffer_score * 1.05 : 0);
            if (grouped.hasOwnProperty(key)) {
                grouped[key] += tss;
            }
        }
    }

    const sortedKeys = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));

    const labels = sortedKeys.map(key => {
        if (isDaily) {
            const d = new Date(key);
            return d.toLocaleDateString('default', { day: '2-digit', month: 'short' });
        }
        if (isWeekly) {
            const d = new Date(key);
            return `Sem ${getWeekNumber(d)}`;
        }
        if (isMonthly) {
            const [y, m] = key.split('-');
            return `${new Date(y, m - 1).toLocaleString('default', { month: 'short' })} ${y.slice(2)}`;
        }
        return key;
    });

    const data = sortedKeys.map(k => Math.round(grouped[k]));
    return { labels, data };
}