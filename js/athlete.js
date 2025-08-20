// js/athlete.js
import { fetchAllActivities, fetchAthleteData, fetchTrainingZones } from './api.js';
import { showLoading, hideLoading, handleError, renderAthleteProfile, renderTrainingZones, renderPersonalBests, renderGearSection } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Referencias al DOM
    const athleteContent = document.getElementById('athlete-content');

    // Estado de la App
    let allActivities = [];
    let charts = {};

    // Helper para crear/destruir gráficos
    function createChart(canvasId, config) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        if (charts[canvasId]) charts[canvasId].destroy();
        charts[canvasId] = new Chart(canvas, config);
    }

    // --- Funciones de Renderizado Específicas de esta página ---

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

        const longestRun = [...runs].sort((a,b) => b.distance - a.distance)[0];
        const fastestRun = [...runs].filter(r => r.distance > 1000).sort((a,b) => a.average_speed - b.average_speed).reverse()[0];
        const mostElev = [...runs].sort((a,b) => b.total_elevation_gain - a.total_elevation_gain)[0];
        
        const paceMin = fastestRun.average_speed > 0 ? (1000 / fastestRun.average_speed) / 60 : 0;
        const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';

        container.innerHTML = `
            <ul style="list-style: none; padding-left: 0; line-height: 1.8;">
                <li><strong>Longest Run:</strong> ${(longestRun.distance / 1000).toFixed(2)} km (<a href="activity.html?id=${longestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Fastest Run (Pace):</strong> ${paceStr} /km over ${(fastestRun.distance / 1000).toFixed(1)}k (<a href="activity.html?id=${fastestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Most Elevation:</strong> ${Math.round(mostElev.total_elevation_gain)} m (<a href="activity.html?id=${mostElev.id}" target="_blank">View</a>)</li>
            </ul>
        `;
    }

    function renderStartTimeHistogram(runs) {
        const hours = Array(24).fill(0);
        runs.forEach(run => {
            const hour = new Date(run.start_date_local).getHours() - 2;
            hours[hour - 2]++;
        });
        const labels = hours.map((_, i) => `${i}:00`);
        createChart('start-time-histogram', {
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

    function renderPerformanceOverTime(runs) {
        const sortedRuns = [...runs].sort((a,b) => new Date(a.start_date_local) - new Date(b.start_date_local));
        const labels = sortedRuns.map(r => r.start_date_local.substring(0, 10));
        
        const paceData = sortedRuns.map(r => r.average_speed > 0 ? (1000 / r.average_speed) / 60 : null);
        const elevData = sortedRuns.map(r => r.distance > 0 ? r.total_elevation_gain / (r.distance / 1000) : null);

        function rollingMean(arr, window) {
            const result = [];
            for (let i = 0; i < arr.length; i++) {
                const slice = arr.slice(Math.max(0, i - window + 1), i + 1).filter(v => v !== null);
                result.push(slice.length ? slice.reduce((a,b) => a+b, 0) / slice.length : null);
            }
            return result;
        }

        createChart('performance-over-time-chart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Avg Pace (min/km, 10-run avg)',
                    data: rollingMean(paceData, 10),
                    borderColor: '#FC5200',
                    yAxisID: 'yPace',
                    tension: 0.2,
                    pointRadius: 0
                }, {
                    label: 'Avg Elevation (m/km, 10-run avg)',
                    data: rollingMean(elevData, 10),
                    borderColor: '#0074D9',
                    yAxisID: 'yElev',
                    tension: 0.2,
                    pointRadius: 0
                }]
            },
            options: {
                scales: {
                    yPace: { type: 'linear', position: 'left', reverse: true, title: { display: true, text: 'Pace (min/km)'}},
                    yElev: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Elevation (m/km)'}}
                }
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
        const distData = years.map(y => byYear[y].distance);
        const countData = years.map(y => byYear[y].count);
        const elevData = years.map(y => byYear[y].elevation);
        const timeData = years.map(y => byYear[y].movingTime);

        createChart('yearly-comparison-chart', {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'Total Distance (km)',
                        data: distData,
                        backgroundColor: 'rgba(0, 116, 217, 0.8)',
                        yAxisID: 'yDist'
                    },
                    {
                        label: 'Number of Runs',
                        data: countData,
                        backgroundColor: 'rgba(252, 82, 0, 0.8)',
                        yAxisID: 'yCount'
                    },
                    {
                        label: 'Total Elevation Gain (m)',
                        data: elevData,
                        backgroundColor: 'rgba(0, 200, 83, 0.7)',
                        yAxisID: 'yElev'
                    },
                    {
                        label: 'Total Moving Time (h)',
                        data: timeData,
                        backgroundColor: 'rgba(255, 193, 7, 0.7)',
                        yAxisID: 'yTime'
                    }
                ]
            },
            options: {
                scales: {
                    yDist: { position: 'left', title: { display: true, text: 'Distance (km)' } },
                    yCount: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '# of Runs' } },
                    yElev: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Elevation Gain (m)' } },
                    yTime: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Moving Time (h)' } }
                }
            }
        });
    }

    // --- Función Principal de Inicialización ---
    async function main() {
        const tokenData = localStorage.getItem('strava_tokens');
        if (!tokenData) {
            handleError("Not authenticated. Please log in from the main dashboard.", {});
            document.getElementById('loading-message').textContent = 'Please log in on the main page.';
            document.querySelector('#loading-overlay .spinner').style.display = 'none';
            return;
        }

        try {
            const [activities, athlete, zones] = await Promise.all([
                fetchAllActivities(),
                fetchAthleteData(),
                fetchTrainingZones()
            ]);
            
            allActivities = activities;
            const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

            // Render all components
            renderAthleteProfile(athlete);
            renderTrainingZones(zones);
            renderAllTimeStats(runs);
            renderPersonalBests(runs);
            renderRecordStats(runs);
            renderStartTimeHistogram(runs);
            renderPerformanceOverTime(runs);
            renderYearlyComparison(runs);
            renderGearSection(runs);
            
            athleteContent.classList.remove('hidden');

        } catch (error) {
            handleError("Could not load athlete data", error);
        } finally {
            hideLoading();
        }
    }

    main();
});