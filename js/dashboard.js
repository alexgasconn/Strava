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
    renderPaceProgression(recentRuns);
    renderHeartRateZones(recentRuns);
    renderRecentActivitiesList(recentRuns);
    renderRecentRunsWithMapsAndVO2max(recentRuns);
    renderRunsHeatmap(recentRuns);
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
// === RESUMEN GENERAL COMPLETO ===
function renderDashboardSummary(runs) {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;
    if (!runs.length) {
        container.innerHTML = "<p>No hay datos suficientes.</p>";
        return;
    }

    // --- Calcular métricas base ---
    const totalDistance = runs.reduce((sum, r) => sum + (r.distance / 1000), 0);
    const totalTime = runs.reduce((sum, r) => sum + (r.moving_time / 3600), 0);
    const totalElevation = runs.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0);
    const avgHR = runs.filter(r => r.average_heartrate)
        .reduce((sum, r) => sum + r.average_heartrate, 0) / (runs.filter(r => r.average_heartrate).length || 1);
    const avgPace = runs.reduce((sum, r) => {
        const pace = (r.moving_time / 60) / (r.distance / 1000);
        return sum + pace;
    }, 0) / runs.length || 0;
    const avgDistance = totalDistance / runs.length || 0;
    const avgVO2 = runs.filter(r => r.vo2max_estimate)
        .reduce((s, r) => s + r.vo2max_estimate, 0) / (runs.filter(r => r.vo2max_estimate).length || 1);

    // --- Particiones por semanas (lunes a domingo) ---
    const getWeek = d => {
        const date = new Date(d);
        const day = (date.getDay() + 6) % 7; // Lunes=0
        const monday = new Date(date);
        monday.setDate(date.getDate() - day);
        monday.setHours(0, 0, 0, 0);
        return monday.getTime();
    };

    const grouped = {};
    runs.forEach(r => {
        const week = getWeek(r.start_date_local);
        grouped[week] = grouped[week] || [];
        grouped[week].push(r);
    });
    const weeks = Object.keys(grouped).sort((a, b) => a - b);
    const thisWeek = grouped[weeks.at(-1)] || [];
    const prevWeek = grouped[weeks.at(-2)] || [];

    // --- Cambios porcentuales ---
    const calcChange = (curr, prev) => prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : 0;
    const distChange = calcChange(sumDist(thisWeek), sumDist(prevWeek));
    const elevChange = calcChange(sumElev(thisWeek), sumElev(prevWeek));
    const paceChange = calcChange(avgPaceWeek(thisWeek), avgPaceWeek(prevWeek));
    const vo2Change = calcChange(avgVO2Week(thisWeek), avgVO2Week(prevWeek));

    // --- Carga de entrenamiento (TSS simplificado) ---
    const USER_MAX_HR = 195;
    const tssData = runs.map(r => {
        const timeH = r.moving_time / 3600;
        const intensity = r.average_heartrate ? (r.average_heartrate / USER_MAX_HR) : 0.7;
        return timeH * Math.pow(intensity, 4) * 100;
    });
    const ctl = expAvg(tssData, 42);
    const atl = expAvg(tssData, 7);
    const tsb = ctl - atl;
    const loadChange = calcChange(sumTss(thisWeek), sumTss(prevWeek));

    // --- Riesgo de lesión dinámico ---
    let injuryPercent = Math.min(
        Math.max(
            10 + ((atl - ctl) * 2) + (loadChange / 4) - (tsb / 3),
            0
        ),
        100
    );
    injuryPercent = Math.round(injuryPercent);
    let injuryRisk = injuryPercent > 70 ? "Crítico" :
                     injuryPercent > 50 ? "Alto" :
                     injuryPercent > 25 ? "Medio" : "Bajo";

    // --- Renderizado ---
    container.innerHTML = `
        <div class="card" style="background:linear-gradient(135deg,#fff,#f9f9f9)">
            <h3>🏃 Actividades</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FC5200;">${runs.length}</p>
            <small>Últimos 30 días</small>
        </div>

        <div class="card">
            <h3>📏 Distancia Total</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${totalDistance.toFixed(1)} km</p>
            <small>Media: ${avgDistance.toFixed(1)} km <span style="color:${trendColor(distChange)};">${trendIcon(distChange)} ${distChange}%</span></small>
        </div>

        <div class="card">
            <h3>🕒 Tiempo Total</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${totalTime.toFixed(1)} h</p>
            <small>Semana vs anterior: <span style="color:${trendColor(loadChange)};">${trendIcon(loadChange)} ${loadChange}%</span></small>
        </div>

        <div class="card">
            <h3>⛰️ Elevación</h3>
            <p style="font-size:2rem;font-weight:bold;color:#2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small><span style="color:${trendColor(elevChange)};">${trendIcon(elevChange)} ${elevChange}%</span></small>
        </div>

        <div class="card">
            <h3>❤️ FC Media</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${avgHR.toFixed(0)} bpm</p>
            <small>vs prev: <span style="color:${trendColor(paceChange)};">${trendIcon(paceChange)} ${paceChange}%</span></small>
        </div>

        <div class="card">
            <h3>⚡ Ritmo Medio</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${formatPace(avgPace)}</p>
            <small><span style="color:${trendColor(paceChange)};">${trendIcon(paceChange)} ${paceChange}%</span></small>
        </div>

        <div class="card">
            <h3>🫁 VO₂max</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${avgVO2 ? avgVO2.toFixed(1) : '–'}</p>
            <small><span style="color:${trendColor(vo2Change)};">${trendIcon(vo2Change)} ${vo2Change}%</span></small>
        </div>

        <div class="card" style="background:#fff4f4;">
            <h3>⚠️ Riesgo Lesión</h3>
            <p style="font-size:2rem;font-weight:bold;color:${injuryColor(injuryPercent)};">${injuryRisk}</p>
            <small>Prob: ${injuryPercent}%</small>
        </div>
    `;

    // --- helpers internos ---
    function sumDist(arr) { return arr.reduce((s, r) => s + (r.distance / 1000), 0); }
    function sumElev(arr) { return arr.reduce((s, r) => s + (r.total_elevation_gain || 0), 0); }
    function avgPaceWeek(arr) {
        if (!arr.length) return 0;
        return arr.reduce((s, r) => s + ((r.moving_time / 60) / (r.distance / 1000)), 0) / arr.length;
    }
    function avgVO2Week(arr) {
        const vals = arr.filter(r => r.vo2max_estimate);
        if (!vals.length) return 0;
        return vals.reduce((s, r) => s + r.vo2max_estimate, 0) / vals.length;
    }
    function sumTss(arr) {
        return arr.reduce((s, r) => {
            const timeH = r.moving_time / 3600;
            const intensity = r.average_heartrate ? (r.average_heartrate / USER_MAX_HR) : 0.7;
            return s + timeH * Math.pow(intensity, 4) * 100;
        }, 0);
    }
    function expAvg(data, n) {
        let avg = 0;
        for (let i = 0; i < data.length; i++) avg = (data[i] + avg * (n - 1)) / n;
        return avg;
    }
    function injuryColor(p) {
        if (p > 70) return '#FF0000';
        if (p > 50) return '#FF6600';
        if (p > 25) return '#FFCC00';
        return '#2ECC40';
    }
}




function renderTrainingLoadMetrics(runs) {
    const container = document.getElementById('training-load-metrics');
    if (!container) return;

    const USER_MAX_HR = 195;
    const now = new Date();

    // --- Calcular TSS para cada actividad ---
    const tssData = runs.map(r => {
        const timeHours = r.moving_time / 3600;
        const intensity = r.average_heartrate ? (r.average_heartrate / USER_MAX_HR) : 0.7;
        const tss = timeHours * Math.pow(intensity, 4) * 100;
        return { date: new Date(r.start_date_local), tss };
    }).sort((a, b) => a.date - b.date);

    // --- Calcular CTL (42d) y ATL (7d) ---
    let ctl = 0, atl = 0;
    const ctlDays = 42, atlDays = 7;
    for (let i = 0; i < tssData.length; i++) {
        ctl = (tssData[i].tss + ctl * (ctlDays - 1)) / ctlDays;
        atl = (tssData[i].tss + atl * (atlDays - 1)) / atlDays;
    }

    const tsb = ctl - atl;
    const tsbColor = tsb > 0 ? '#2ECC40' : '#FF4136';
    const totalLoad = tssData.reduce((sum, t) => sum + t.tss, 0).toFixed(0);

    // --- Cambio de carga semanal ---
    const recent = tssData.filter(t => (now - t.date) / 86400000 <= 14);
    const week1 = recent.filter(t => (now - t.date) / 86400000 <= 7);
    const week2 = recent.filter(t => (now - t.date) / 86400000 > 7);
    const load1 = week1.reduce((a, b) => a + b.tss, 0);
    const load2 = week2.reduce((a, b) => a + b.tss, 0);
    const loadChange = load2 > 0 ? ((load1 - load2) / load2) * 100 : 0;
    const loadTrend = loadChange > 0 ? '↗' : '↘';

    // --- Días sin actividad reciente ---
    const lastRunDate = tssData.length ? tssData[tssData.length - 1].date : null;
    const daysSinceLast = lastRunDate ? Math.floor((now - lastRunDate) / 86400000) : 999;

    // --- Mensaje general de carga ---
    let message = '';
    let color = '#333';
    let emoji = '';

    if (tsb < -15) { emoji = '⚠️'; message = 'Fatiga alta, descanso necesario'; color = '#FF4136'; }
    else if (tsb < -5) { emoji = '⚠️'; message = 'Fatiga moderada, mantener carga controlada'; color = '#FF851B'; }
    else if (tsb <= 5) { emoji = '✅'; message = 'Equilibrio óptimo de carga y recuperación'; color = '#0074D9'; }
    else { emoji = '💪'; message = 'Listo para carga más intensa'; color = '#2ECC40'; }

    if (loadChange > 20) message += ', incremento fuerte semanal';
    else if (loadChange > 5) message += ', carga en aumento';
    else if (loadChange < -10) message += ', posible desentrenamiento';

    // --- Modelo de riesgo de lesión realista ---
    // Basado en: TSB (fatiga), cambio de carga, CTL/ATL ratio y descanso
    const fatigueFactor = Math.max(0, -tsb) * 2;              // más fatiga → más riesgo
    const loadFactor = Math.max(0, loadChange);               // subidas bruscas de carga
    const ratioFactor = Math.abs(ctl - atl);                  // desequilibrio crónico-agudo
    const restFactor = daysSinceLast > 3 ? (daysSinceLast - 3) * 3 : 0;  // inactividad excesiva también penaliza

    let injuryScore = fatigueFactor + loadFactor * 0.6 + ratioFactor * 0.8 + restFactor;
    injuryScore = Math.min(100, Math.max(5, injuryScore / 2)); // normalizado

    let injuryRisk = 'Bajo';
    if (injuryScore > 70) injuryRisk = 'Crítico';
    else if (injuryScore > 50) injuryRisk = 'Alto';
    else if (injuryScore > 30) injuryRisk = 'Moderado';

    // --- Mostrar ---
    container.innerHTML = `
        <div class="load-card" style="background:#f0f9ff;border-radius:8px;padding:1rem;margin:1rem 0;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            <h3>📊 Carga de Entrenamiento</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem;">
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:#0074D9;">CTL: ${ctl.toFixed(1)}</p>
                    <small>Carga crónica</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:#FF4136;">ATL: ${atl.toFixed(1)}</p>
                    <small>Carga aguda</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:${tsbColor};">TSB: ${tsb.toFixed(1)}</p>
                    <small>Balance</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:#FC5200;">${totalLoad}</p>
                    <small>Carga total</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:bold;color:${trendColor(loadChange)};">${loadTrend} ${loadChange.toFixed(1)}%</p>
                    <small>Cambio semanal</small>
                </div>
            </div>
            <p style="text-align:center;font-weight:bold;margin-top:0.5rem;color:${color};">${emoji} ${message}</p>
            <p style="text-align:center;font-weight:bold;margin-top:0.25rem;color:#FF4136;">
                ⚠️ Riesgo de lesión: ${injuryRisk} (~${injuryScore.toFixed(0)}%)
            </p>
            <small style="display:block;text-align:center;color:#666;">
                Última actividad: ${daysSinceLast === 0 ? 'hoy' : daysSinceLast + ' días'}
            </small>
        </div>
    `;
}





// === NUEVO: DÍAS DESCANSO + ACUMULADOS (MEJORADO) ===
function renderRestDaysAndAccumulated(runs) {
    const container = document.getElementById('rest-accumulated');
    if (!container) return;

    // Últimos 30 días
    const today = new Date();
    const last30 = new Date(today);
    last30.setDate(today.getDate() - 30);

    const recentRuns = runs.filter(r => new Date(r.start_date_local) >= last30);
    const runDays = new Set(recentRuns.map(r => new Date(r.start_date_local).toDateString()));
    const restDays = 30 - runDays.size;

    // Métricas acumuladas
    const totalKm = recentRuns.reduce((sum, r) => sum + r.distance / 1000, 0);
    const totalElev = recentRuns.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0);
    const totalTime = recentRuns.reduce((sum, r) => sum + (r.moving_time || 0), 0) / 3600; // h

    // Objetivos mensuales (pueden adaptarse dinámicamente)
    const goalKm = 200;
    const goalElev = 2000;
    const kmProgress = Math.min(totalKm / goalKm * 100, 100).toFixed(1);
    const elevProgress = Math.min(totalElev / goalElev * 100, 100).toFixed(1);

    // Promedios útiles
    const avgKmPerRun = totalKm / recentRuns.length || 0;
    const avgPace = (() => {
        const totalSec = recentRuns.reduce((sum, r) => sum + r.moving_time, 0);
        const totalDist = recentRuns.reduce((sum, r) => sum + r.distance / 1000, 0);
        if (totalDist === 0) return '-';
        const paceSec = totalSec / totalDist;
        const min = Math.floor(paceSec / 60);
        const sec = Math.round(paceSec % 60).toString().padStart(2, '0');
        return `${min}:${sec}/km`;
    })();

    container.innerHTML = `
        <div class="accum-card" style="background:#fff;border-radius:12px;padding:1.2rem;margin:1rem 0;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
            <h3 style="margin-bottom:.8rem;">📅 Últimos 30 días</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem;text-align:center;">
                <div>
                    <p style="font-size:1.4rem;font-weight:700;color:#FF851B;">${restDays}</p>
                    <small>Días de descanso</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:700;color:#0074D9;">${totalKm.toFixed(1)} km</p>
                    <small>Distancia acumulada</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:700;color:#2ECC40;">${totalElev.toFixed(0)} m</p>
                    <small>Elevación ganada</small>
                </div>
                <div>
                    <p style="font-size:1.4rem;font-weight:700;color:#B10DC9;">${totalTime.toFixed(1)} h</p>
                    <small>Tiempo total</small>
                </div>
            </div>

            <div style="margin-top:1rem;">
                <div style="margin-bottom:.4rem;"><small>Progreso mensual: ${kmProgress}%</small></div>
                <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;">
                    <div style="width:${kmProgress}%;background:#0074D9;height:100%;"></div>
                </div>
                <div style="margin-top:.6rem;margin-bottom:.4rem;"><small>Elevación: ${elevProgress}%</small></div>
                <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;">
                    <div style="width:${elevProgress}%;background:#2ECC40;height:100%;"></div>
                </div>
            </div>

            <div style="margin-top:1rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
                <small>Media por salida: ${avgKmPerRun.toFixed(1)} km</small>
                <small>Paso medio: ${avgPace}</small>
                <small>Sesiones: ${recentRuns.length}</small>
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






function renderRunsHeatmap(runs) {
    const container = document.getElementById("runs-heatmap");
    if (!container) return;

    // --- Resetear mapa si ya existe ---
    if (window.runsMap) {
        window.runsMap.remove();
        window.runsMap = null;
    }

    // --- Crear mapa nuevo ---
    window.runsMap = L.map("runs-heatmap", {
        center: [41.3851, 2.1734], // BCN por defecto
        zoom: 12,
        scrollWheelZoom: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(window.runsMap);

    // --- Crear heatmap ---
    const heatPoints = [];
    runs.forEach(r => {
        if (r.map && r.map.summary_polyline) {
            const latlngs = L.Polyline.fromEncoded(r.map.summary_polyline).getLatLngs();
            latlngs.forEach(p => heatPoints.push([p.lat, p.lng, 0.6]));
        }
    });

    if (heatPoints.length) {
        L.heatLayer(heatPoints, {
            radius: 15,
            blur: 12,
            maxZoom: 15,
            minOpacity: 0.3,
        }).addTo(window.runsMap);
        window.runsMap.fitBounds(heatPoints.map(p => [p[0], p[1]]), { padding: [30, 30] });
    } else {
        container.innerHTML = "<p style='text-align:center; padding:1rem;'>No hay rutas con mapa disponibles.</p>";
    }
}


// === Helper: Decodificar polilínea de Strava ===
// function decodePolyline(encoded) {
//     let points = [];
//     let index = 0, lat = 0, lng = 0;

//     while (index < encoded.length) {
//         let b, shift = 0, result = 0;
//         do {
//             b = encoded.charCodeAt(index++) - 63;
//             result |= (b & 0x1f) << shift;
//             shift += 5;
//         } while (b >= 0x20);
//         const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
//         lat += dlat;

//         shift = 0;
//         result = 0;
//         do {
//             b = encoded.charCodeAt(index++) - 63;
//             result |= (b & 0x1f) << shift;
//             shift += 5;
//         } while (b >= 0x20);
//         const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
//         lng += dlng;

//         points.push([lat / 1e5, lng / 1e5]);
//     }

//     return points;
// }
