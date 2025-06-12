// =================================================================
// script.js - VERSIÓN "TODO EN UNO" (COMPLETA Y CORREGIDA)
// =================================================================

// --- 1. CONFIGURACIÓN Y ESTADO GLOBAL ---
const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const CACHE_KEY = 'strava_dashboard_data_v1';
let charts = {};

// --- 2. REFERENCIAS AL DOM ---
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const athleteName = document.getElementById('athlete-name');

// --- 3. FUNCIONES DE UI ---
function showLoading(message) { loadingMessage.textContent = message; loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay.classList.add('hidden'); }
function handleError(message, error) { console.error(message, error); hideLoading(); alert(`Error: ${message}.`); }

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas, config);
}

// --- 4. LÓGICA DE AUTENTICACIÓN (LAS FUNCIONES QUE FALTABAN) ---

function redirectToStravaAuthorize() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

function logout() { 
    localStorage.clear(); 
    window.location.reload(); 
}

// --- 5. FUNCIONES DE RENDERIZADO ---

// REEMPLAZA ESTA FUNCIÓN ENTERA
function renderDashboard(activities) {
    // --- Filtrar solo actividades de running (incluye Trail Run, etc) ---
    const runs = activities.filter(a => a.type && a.type.includes('Run'));

    // 1. Get all distances
    const allDistances = runs.map(a => a.distance);
    // 2. Calculate 90th percentile
    const sortedDistances = [...allDistances].sort((a, b) => a - b);
    const p90Index = Math.floor(0.9 * sortedDistances.length);
    const p90Distance = sortedDistances[p90Index] || 0;

    // 3. Tag as Long Run if not a race and distance >= 90th percentile
    runs.forEach(a => {
        if (a.workout_type !== 1 && a.distance >= p90Distance) {
            a.workout_type = 2; // Long run
        }
    });

    // --- Tarjetas de Resumen ---
    const summaryContainer = document.getElementById('summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="card"><h3>Actividades</h3><p>${runs.length}</p></div>
            <div class="card"><h3>Distancia Total</h3><p>${(runs.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0)} km</p></div>
            <div class="card"><h3>Tiempo Total</h3><p>${(runs.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)} h</p></div>
            <div class="card"><h3>Desnivel Total</h3><p>${runs.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString()} m</p></div>
        `;
    }

    // --- Heatmap de Consistencia (CalHeatmap) ---
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

    // --- Gráfico de Barras: Tipos de Running (workout_type) ---
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
                    label: '# Actividades',
                    data: workoutTypeCounts,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)'
                }]
            },
            options: { indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    // --- Gráfico de Líneas: Distancia Mensual ---
    // Agrupa y suma la distancia de cada mes correctamente
    const monthlyDistanceMap = {};
    runs.forEach(act => {
        const month = act.start_date_local.substring(0, 7);
        monthlyDistanceMap[month] = (monthlyDistanceMap[month] || 0) + (act.distance / 1000);
    });
    const sortedMonths = Object.keys(monthlyDistanceMap).sort();
    const monthlyDistances = sortedMonths.map(month => monthlyDistanceMap[month]);
    const monthlyDistanceCanvas = document.getElementById('monthly-distance-chart');
    if (monthlyDistanceCanvas) {
        if (charts['monthly-distance-chart']) {
            charts['monthly-distance-chart'].destroy();
            charts['monthly-distance-chart'] = null;
        }
        charts['monthly-distance-chart'] = new Chart(monthlyDistanceCanvas, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [{
                    label: 'Distancia (km)',
                    data: monthlyDistances,
                    borderColor: '#FC5200',
                    fill: false,
                    tension: 0.1
                }]
            }
        });
    }

    // --- Scatter Plot: Ritmo vs Distancia (Running) ---
    const paceVsDistanceCanvas = document.getElementById('pace-vs-distance-chart');
    if (paceVsDistanceCanvas && !charts['pace-vs-distance-chart']) {
        charts['pace-vs-distance-chart'] = new Chart(paceVsDistanceCanvas, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Carreras',
                    data: runs.filter(r => r.distance > 0).map(r => ({ x: r.distance / 1000, y: r.moving_time / (r.distance / 1000) })),
                    backgroundColor: 'rgba(252, 82, 0, 0.7)'
                }]
            },
            options: { scales: { x: { title: { display: true, text: 'Distancia (km)' } }, y: { title: { display: true, text: 'Ritmo (seg/km)' } } } }
        });
    }

    // --- Histograma de distancias (bin size configurable por variable) ---
    const HISTOGRAM_BIN_SIZE_KM = 1; // <-- Cambia este valor para ajustar el tamaño del bin (en km)
    const histogramCanvas = document.getElementById('distance-histogram');
    if (histogramCanvas) {
        // Limpia el gráfico anterior si existe
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
                    label: '# Actividades',
                    data: bins,
                    backgroundColor: 'rgba(252, 82, 0, 0.5)'
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: `Distancia (bins de ${binSize} km)` } },
                    y: { title: { display: true, text: 'Cantidad' } }
                }
            }
        });
    }

    // --- VO2max estimado por actividad y gráfico temporal ---

    // Cambia este valor por el máximo real del usuario si lo sabes:
    const USER_MAX_HR = 195; // <-- Ajusta según tu perfil

    // 1. Calcular VO2max estimado por actividad
    const vo2maxData = runs
        .filter(act => act.average_heartrate && act.moving_time > 0 && act.distance > 0)
        .map(act => {
            const dist_km = act.distance / 1000;
            const time_hr = act.moving_time / 3600;
            const speed_kmh = dist_km / time_hr;
            // VO2 at pace (simplificado): 3.5 + 12 * velocidad_km_h / 60
            // O usa Daniels: VO2 = (vel_m_min * 0.2) + 3.5
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

    // 2. Agrupar por año-mes y calcular media mensual
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

    // 3. Calcular media móvil (rolling mean) sobre los valores mensuales
    function rollingMean(arr, windowSize) {
        const result = [];
        for (let i = 0; i < arr.length; i++) {
            const start = Math.max(0, i - windowSize + 1);
            const window = arr.slice(start, i + 1);
            result.push(window.reduce((a, b) => a + b, 0) / window.length);
        }
        return result;
    }
    const ROLLING_WINDOW = 1; // 3 meses
    const vo2maxRolling = rollingMean(vo2maxMonthlyAvg, ROLLING_WINDOW);

    // 4. Graficar
    createChart('vo2max-over-time', {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: `VO₂max estimado (media móvil ${ROLLING_WINDOW} meses)`,
                data: vo2maxRolling,
                fill: true,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                pointRadius: 2,
                tension: 0.2
            }]
        },
        options: {
            plugins: { title: { display: true, text: 'VO₂max estimado a lo largo del tiempo' } },
            scales: {
                x: { title: { display: true, text: 'Año-Mes' } },
                y: { title: { display: true, text: 'VO₂max' } }
            }
        }
    });

    // --- Lista de carreras (workout_type === 1) ---
    const raceListContainer = document.getElementById('race-list');
    if (raceListContainer) {
        const races = runs.filter(act => act.workout_type === 1);
        if (races.length === 0) {
            raceListContainer.innerHTML = "<p>No hay carreras registradas.</p>";
        } else {
            raceListContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Distancia (km)</th>
                            <th>Tiempo</th>
                            <th>Ritmo (min/km)</th>
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
                                <td>${act.start_date_local.substring(0,10)}</td>
                                <td>${distKm}</td>
                                <td>${timeStr}</td>
                                <td>${paceStr}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    // --- ATL, CTL y TSB usando esfuerzo ---

    // 1. Prepara los datos diarios de esfuerzo
    const effortByDay = {};
    runs.forEach(act => {
        const date = act.start_date_local.substring(0, 10);
        const effort = act.perceived_exertion ?? act.suffer_score ?? 0;
        effortByDay[date] = (effortByDay[date] || 0) + effort;
    });

    // 2. Genera el rango de fechas completo
    const allEffortDays = Object.keys(effortByDay).sort();
    if (allEffortDays.length === 0) return; // No hay datos

    const startDate = new Date(allEffortDays[0]);
    const endDate = new Date(allEffortDays[allEffortDays.length - 1]);
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
    }

    // 3. Vector de esfuerzo diario (rellena con 0 si no hay actividad)
    const dailyEffort = days.map(date => effortByDay[date] || 0);

    // 4. Función para media exponencial móvil
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

    // 5. Calcula ATL (7 días), CTL (42 días), TSB
    const atl = expMovingAvg(dailyEffort, 1/7);
    const ctl = expMovingAvg(dailyEffort, 1/42);
    const tsb = ctl.map((c, i) => c - atl[i]);

    // 6. Grafica los tres
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
                    tension: 0.2,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            plugins: { title: { display: true, text: 'ATL, CTL y TSB (Esfuerzo diario)' } },
            scales: {
                x: { title: { display: true, text: 'Fecha' } },
                y: { title: { display: true, text: 'Carga (ATL/CTL)' } },
                y2: {
                    position: 'right',
                    title: { display: true, text: 'TSB' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

// --- 6. LÓGICA PRINCIPAL DE INICIALIZACIÓN ---
async function initializeApp(accessToken) {
    try {
        let activities;
        const cachedActivities = localStorage.getItem(CACHE_KEY);
        if (cachedActivities) {
            activities = JSON.parse(cachedActivities);
        } else {
            showLoading('Obteniendo historial de actividades...');
            const response = await fetch('/api/strava-activities', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!response.ok) throw new Error((await response.json()).error || 'Fallo en API');
            activities = await response.json();
            localStorage.setItem(CACHE_KEY, JSON.stringify(activities));
        }

        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        const athleteInfo = activities.find(a => a.athlete)?.athlete || { firstname: 'Atleta' };
        athleteName.textContent = `Dashboard de ${athleteInfo.firstname}`;

        renderDashboard(activities);
    } catch (error) {
        handleError("Error al inicializar la aplicación", error);
    } finally {
        hideLoading();
    }
}

async function handleAuth() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    let accessToken = localStorage.getItem('strava_access_token');
    if (code) {
        showLoading('Autenticando...');
        try {
            const response = await fetch('/api/strava-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
            if (!response.ok) throw new Error((await response.json()).error);
            const data = await response.json();
            accessToken = data.access_token;
            localStorage.setItem('strava_access_token', accessToken);
            window.history.replaceState({}, '', window.location.pathname);
        } catch (error) {
            return handleError('Fallo en la autenticación', error);
        }
    }
    if (accessToken) {
        initializeApp(accessToken);
    } else {
        hideLoading();
    }
}

// --- PUNTO DE ENTRADA DE LA APP ---
loginButton.addEventListener('click', redirectToStravaAuthorize);
logoutButton.addEventListener('click', logout);
handleAuth();
