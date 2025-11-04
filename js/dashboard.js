// js/dashboard.js
import * as utils from './utils.js';

export function renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo) {
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));

    // Get last 10 runs for recent analysis
    const recentRuns = runs.slice(-10);

    renderDashboardSummary(recentRuns);
    renderVO2maxEvolution(recentRuns);
    renderRecentMetrics(recentRuns);
    renderTimeDistribution(recentRuns);
    renderWeekdayActivity(runs); // Use all runs for better pattern analysis
    renderPaceProgression(recentRuns);
    renderHeartRateZones(recentRuns);
    renderRecentActivitiesList(recentRuns);
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

function renderDashboardSummary(runs) {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;

    const totalDistance = runs.reduce((sum, r) => sum + (r.distance / 1000), 0);
    const totalElevation = runs.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0);
    const avgHR = runs.filter(r => r.average_heartrate).reduce((sum, r) => sum + r.average_heartrate, 0) / 
                  runs.filter(r => r.average_heartrate).length || 0;
    const avgPace = runs.reduce((sum, r) => {
        const pace = (r.moving_time / 60) / (r.distance / 1000);
        return sum + pace;
    }, 0) / runs.length || 0;
    const avgDistance = totalDistance / runs.length || 0;

    const formatPace = (pace) => {
        const minutes = Math.floor(pace);
        const seconds = Math.round((pace - minutes) * 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    container.innerHTML = `
        <div class="card">
            <h3>🏃 Activities</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #FC5200;">${runs.length}</p>
            <small>Last 10 runs</small>
        </div>
        <div class="card">
            <h3>📏 Total Distance</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #0074D9;">${totalDistance.toFixed(1)} km</p>
            <small>Avg: ${avgDistance.toFixed(1)} km/run</small>
        </div>
        <div class="card">
            <h3>⛰️ Total Elevation</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small>Avg: ${(totalElevation / runs.length).toFixed(0)} m/run</small>
        </div>
        <div class="card">
            <h3>❤️ Avg Heart Rate</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #FF4136;">${avgHR.toFixed(0)} bpm</p>
            <small>Based on ${runs.filter(r => r.average_heartrate).length} runs with HR</small>
        </div>
        <div class="card">
            <h3>⚡ Avg Pace</h3>
            <p style="font-size: 2rem; font-weight: bold; color: #B10DC9;">${formatPace(avgPace)}</p>
            <small>min/km</small>
        </div>
    `;
}

function renderVO2maxEvolution(runs) {
    const USER_MAX_HR = 195;

    const vo2maxData = runs
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
        if (canvas) canvas.innerHTML = '<p style="text-align:center; padding:2rem;">Not enough data with HR for VO2max estimation</p>';
        return;
    }

    const vo2maxChange = ((vo2maxData[vo2maxData.length - 1].vo2max - vo2maxData[0].vo2max) / vo2maxData[0].vo2max * 100);
    
    // Add trend annotation
    const container = document.getElementById('dashboard-vo2max').parentElement;
    const existingNote = container.querySelector('.vo2max-trend');
    if (existingNote) existingNote.remove();
    
    const trendDiv = document.createElement('div');
    trendDiv.className = 'vo2max-trend';
    trendDiv.innerHTML = `
        <p style="text-align: center; margin-top: 0.5rem; font-weight: bold; color: ${vo2maxChange >= 0 ? '#2ECC40' : '#FF4136'};">
            ${vo2maxChange >= 0 ? '↗' : '↘'} ${vo2maxChange >= 0 ? '+' : ''}${vo2maxChange.toFixed(1)}% evolution
        </p>
    `;
    container.appendChild(trendDiv);

    createDashboardChart('dashboard-vo2max', {
        type: 'line',
        data: {
            labels: vo2maxData.map(d => d.date),
            datasets: [{
                label: 'VO₂max Evolution',
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
                    title: { display: true, text: 'VO₂max (ml/kg/min)' },
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
        const formatPace = (p) => {
            const minutes = Math.floor(p);
            const seconds = Math.round((p - minutes) * 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

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

// Optional: Load from Strava API
export async function loadRecentFromStrava(token, limit = 10) {
    try {
        const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch from Strava');

        const data = await response.json();
        return data.filter(a => a.type === 'Run');
    } catch (error) {
        console.error('Error loading from Strava:', error);
        throw error;
    }
}