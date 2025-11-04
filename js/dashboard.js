// js/dashboard.js
import * as utils from './utils.js';

export function renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    // Ordenar runs por fecha ascendente (start_date_local)
    runs.sort((a, b) => {
        const da = a.start_date_local ? new Date(a.start_date_local) : new Date(0);
        const db = b.start_date_local ? new Date(b.start_date_local) : new Date(0);
        return da - db;
    });

    // Get last 30 runs for deeper analysis (for accumulations)
    const recentRuns = runs.slice(-30);

    console.log('Rendering dashboard with', recentRuns.length, 'recent runs');
    console.log('Recent runs:', recentRuns);

    renderDashboardSummary(recentRuns);
    renderVO2maxEvolution(recentRuns);
    renderTrainingLoadMetrics(recentRuns); // NUEVO: CTL, ATL, TSB, Carga
    renderRestDaysAndAccumulated(recentRuns); // NUEVO: Días descanso, acumulados
    renderRecentMetrics(recentRuns);
    renderTimeDistribution(recentRuns);
    renderWeekdayActivity(runs);
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

function trendColor(change) {
    return change > 0 ? '#2ECC40' : '#FF4136';
}

function trendIcon(change) {
    return change > 0 ? '↗' : '↘';
}

function formatPace(pace) {
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// === RESUMEN GENERAL (MEJORADO: +% CAMBIOS, COLORES, ICONOS) ===
function renderDashboardSummary(runs) {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;

    const totalDistance = runs.reduce((sum, r) => sum + (r.distance / 1000), 0);
    const totalTime = runs.reduce((sum, r) => sum + r.moving_time / 3600, 0); // Horas
    const totalElevation = runs.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0);
    const avgHR = runs.filter(r => r.average_heartrate).reduce((sum, r) => sum + r.average_heartrate, 0) / 
                  runs.filter(r => r.average_heartrate).length || 0;
    const avgPace = runs.reduce((sum, r) => {
        const pace = (r.moving_time / 60) / (r.distance / 1000);
        return sum + pace;
    }, 0) / runs.length || 0;
    const avgDistance = totalDistance / runs.length || 0;

    // Cambios % (últimos 7 vs previos)
    const last7 = runs.slice(-7);
    const prev7 = runs.slice(-14, -7);
    const distChange = last7.length && prev7.length ? ((last7.reduce((s, r) => s + r.distance/1000, 0) - prev7.reduce((s, r) => s + r.distance/1000, 0)) / prev7.reduce((s, r) => s + r.distance/1000, 0) * 100).toFixed(1) : 0;
    const elevChange = last7.length && prev7.length ? ((last7.reduce((s, r) => s + r.total_elevation_gain, 0) - prev7.reduce((s, r) => s + r.total_elevation_gain, 0)) / prev7.reduce((s, r) => s + r.total_elevation_gain, 0) * 100).toFixed(1) : 0;

    container.innerHTML = `
        <div class="card" style="background: linear-gradient(135deg, #fff, #f9f9f9);">
            <h3>🏃 Actividades</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #FC5200;">${runs.length}</p>
            <small>Últimas 30</small>
        </div>
        <div class="card">
            <h3>📏 Km Total</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #0074D9;">${totalDistance.toFixed(1)}</p>
            <small>Media: ${avgDistance.toFixed(1)} km <span style="color: ${trendColor(distChange)};">${trendIcon(distChange)} ${distChange}%</span></small>
        </div>
        <div class="card">
            <h3>🕒 Horas Total</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #B10DC9;">${totalTime.toFixed(1)}</p>
            <small>Acumulado</small>
        </div>
        <div class="card">
            <h3>⛰️ Elevación Total</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small>Media: ${(totalElevation / runs.length).toFixed(0)} m <span style="color: ${trendColor(elevChange)};">${trendIcon(elevChange)} ${elevChange}%</span></small>
        </div>
        <div class="card">
            <h3>❤️ FC Media</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #FF4136;">${avgHR.toFixed(0)} bpm</p>
            <small>En ${runs.filter(r => r.average_heartrate).length} carreras</small>
        </div>
        <div class="card">
            <h3>⚡ Ritmo Medio</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #B10DC9;">${formatPace(avgPace)}</p>
            <small>min/km</small>
        </div>
    `;
}


function renderTrainingLoadMetrics(runs) {
    const container = document.getElementById('training-load-metrics');
    if (!container) return;

    const USER_MAX_HR = 195;
    const tssData = runs.map(r => {
        const timeHours = r.moving_time / 3600;
        const intensity = r.average_heartrate ? (r.average_heartrate / USER_MAX_HR) : 0.7;
        return timeHours * Math.pow(intensity, 4) * 100;
    });

    // === CTL (≈ media 42 días) ===
    let ctl = 0;
    for (let i = 0; i < tssData.length; i++) ctl = (tssData[i] + ctl * 41) / 42;

    // === ATL (≈ media 7 días) ===
    let atl = 0;
    const last7Tss = tssData.slice(-7);
    for (let i = 0; i < last7Tss.length; i++) atl = (last7Tss[i] + atl * 6) / 7;

    const tsb = ctl - atl;
    const tsbColor = tsb > 0 ? '#2ECC40' : '#FF4136';
    const totalLoad = tssData.reduce((sum, t) => sum + t, 0).toFixed(0);

    // Cambio semanal
    const loadChange = tssData.length > 14 ? ((last7Tss.reduce((s, t) => s + t, 0) - tssData.slice(-14, -7).reduce((s, t) => s + t, 0)) / tssData.slice(-14, -7).reduce((s, t) => s + t, 0) * 100).toFixed(1) : 0;
    const loadTrend = loadChange > 0 ? '↗' : '↘';

    // === MENSAJE INTERPRETATIVO COMPLETO ===
    let message = '';
    let color = '#333';
    let emoji = '';

    // TSB principal
    if (tsb < -15) { emoji = '⚠️'; message = 'Overtraining, descanso necesario'; color = '#FF4136'; }
    else if (tsb >= -15 && tsb < -5) { emoji = '⚠️'; message = 'Fatiga acumulada, cuidado con intensidad'; color = '#FF851B'; }
    else if (tsb >= -5 && tsb <= 5) { emoji = '✅'; message = 'Entrenamiento equilibrado, buen ritmo'; color = '#0074D9'; }
    else if (tsb > 5 && tsb <= 15) { emoji = '💪'; message = 'Descansado, puedes aumentar intensidad'; color = '#2ECC40'; }
    else if (tsb > 15) { emoji = '💪'; message = 'Muy descansado, oportunidad de apretar entrenamiento'; color = '#2ECC40'; }

    // Ajuste según tendencia semanal
    if (loadChange > 20) message += ', incremento fuerte de carga esta semana';
    else if (loadChange > 5) message += ', carga semanal en aumento';
    else if (loadChange < -20) message += ', reducción fuerte de carga, cuidado';
    else if (loadChange < -5) message += ', carga semanal en disminución';

    // Ajuste según CTL vs ATL
    if (ctl > atl * 1.2) message += ', fatiga acumulada alta';
    else if (atl > ctl * 1.2) message += ', buena recuperación';
    
    // Render
    container.innerHTML = `
        <div class="load-card" style="background: #f0f9ff; border-radius: 8px; padding: 1rem; margin: 1rem 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3>📊 Carga de Entrenamiento</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem;">
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: #0074D9;">CTL: ${ctl.toFixed(1)}</p>
                    <small>Carga Crónica</small>
                </div>
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: #FF4136;">ATL: ${atl.toFixed(1)}</p>
                    <small>Carga Aguda</small>
                </div>
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: ${tsbColor};">TSB: ${tsb.toFixed(1)}</p>
                    <small>Balance ${tsb > 0 ? '(Listo)' : '(Fatiga)'}</small>
                </div>
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: #FC5200;">${totalLoad}</p>
                    <small>Carga Acumulada</small>
                </div>
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: ${trendColor(loadChange)};">${loadTrend} ${loadChange}%</p>
                    <small>Cambio Semanal</small>
                </div>
            </div>
            <p style="text-align:center; font-weight:bold; margin-top:0.5rem; color:${color};">${emoji} ${message}</p>
        </div>
    `;
}



// === NUEVO: DÍAS DESCANSO + ACUMULADOS (CON BARRAS PROGRESO) ===
function renderRestDaysAndAccumulated(runs) {
    const container = document.getElementById('rest-accumulated');
    if (!container) return;

    // Días descanso: Contar días sin runs en últimos 30 días
    const dates = runs.map(r => new Date(r.start_date_local).toDateString());
    const uniqueDays = new Set(dates);
    const totalDays = 30; // Asumir últimos 30
    const restDays = totalDays - uniqueDays.size;

    // Progreso: % de meta, asumir meta 200km/mes
    const goalKm = 200;
    const totalKm = runs.reduce((sum, r) => sum + r.distance / 1000, 0);
    const kmProgress = (totalKm / goalKm * 100).toFixed(1);

    // Elevación acumulada
    const totalElev = runs.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0);

    // Barra progreso
    container.innerHTML = `
        <div class="accum-card" style="background: #fff; border-radius: 8px; padding: 1rem; margin: 1rem 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3>📅 Acumulados & Descanso</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem;">
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: #2ECC40;">${restDays}</p>
                    <small>Días Descanso</small>
                </div>
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: #0074D9;">${totalKm.toFixed(1)} km</p>
                    <small>Acumulado</small>
                </div>
                <div>
                    <p style="font-size: 1.5rem; font-weight: bold; color: #FF4136;">${totalElev.toFixed(0)} m</p>
                    <small>Elev. Acumulada</small>
                </div>
            </div>
            <div style="margin-top: 1rem;">
                <small>Progreso Km: ${kmProgress}%</small>
                <div style="background: #eee; border-radius: 4px; height: 8px; overflow: hidden;">
                    <div style="width: ${Math.min(kmProgress, 100)}%; background: #2ECC40; height: 100%;"></div>
                </div>
            </div>
        </div>
    `;
}

function renderVO2maxEvolution(runs) {
    const USER_MAX_HR = 195;

    let vo2maxData = runs
        .filter(r => r.average_heartrate && r.moving_time > 0 && r.distance > 0)
        .map((r, idx) => {
            const vel_m_min = (r.distance / r.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const vo2max = vo2_at_pace / (r.average_heartrate / USER_MAX_HR);
            return {
                run: `R${idx + 1}`,
                vo2max: vo2max,
                date: r.start_date_local.substring(0, 10)
            };
        });

    if (vo2maxData.length < 2) {
        const canvas = document.getElementById('dashboard-vo2max');
        if (canvas) canvas.innerHTML = '<p style="text-align:center; padding:2rem;">No datos FC para VO₂max</p>';
        return;
    }

    const windowSize = 5; // pequeño para no sobre-suavizar
    vo2maxData = vo2maxData.map((d, i, arr) => {
        const start = Math.max(0, i - windowSize + 1);
        const slice = arr.slice(start, i + 1);
        const avg = slice.reduce((sum, v) => sum + v.vo2max, 0) / slice.length;
        return { ...d, vo2max: avg };
    });

    const vo2maxChange = ((vo2maxData[vo2maxData.length - 1].vo2max - vo2maxData[0].vo2max) / vo2maxData[0].vo2max * 100);
    const changeColor = trendColor(vo2maxChange);
    const changeIcon = trendIcon(vo2maxChange);

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
                        label: (context) => `VO₂max: ${context.parsed.y.toFixed(1)}`
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
                    <small style="color: #666;">${formatPace(pace)}/km</small>
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

function renderWeekdayActivity(runs) {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    const weekdayData = runs.reduce((acc, r) => {
        const day = new Date(r.start_date_local).toLocaleDateString('en-US', { weekday: 'long' });
        if (!acc[day]) acc[day] = { count: 0, distance: 0 };
        acc[day].count += 1;
        acc[day].distance += r.distance / 1000;
        return acc;
    }, {});

    const counts = weekdays.map(day => weekdayData[day]?.count || 0);
    const distances = weekdays.map(day => weekdayData[day]?.distance || 0);

    createDashboardChart('dashboard-weekday', {
        type: 'bar',
        data: {
            labels: weekdays.map(d => d.slice(0, 3)),
            datasets: [
                {
                    label: '# Runs',
                    data: counts,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                    yAxisID: 'y'
                },
                {
                    label: 'Distance (km)',
                    data: distances,
                    backgroundColor: 'rgba(0, 116, 217, 0.5)',
                    yAxisID: 'y1',
                    hidden: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: '# Runs' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Distance (km)' },
                    grid: { drawOnChartArea: false }
                }
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
                            ${formatTime(r.moving_time)}
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