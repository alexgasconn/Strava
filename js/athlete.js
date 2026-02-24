// js/athlete.js - Updated: 2026-02-23 to fix runs reference error
import * as utils from './utils.js';

export function renderAthleteTab(allActivities, dateFilterFrom, dateFilterTo, sportFilter = 'all', dataType = 'count') {
    console.log("🎽 renderAthleteTab: Initializing Athlete Tab with sportFilter:", sportFilter);

    // Add filters UI
    addAthleteFilters();

    // Filter activities
    const filteredActivities = filterActivities(allActivities, dateFilterFrom, dateFilterTo, sportFilter);
    console.log("🎽 renderAthleteTab: Filtered activities:", filteredActivities.length);

    // For stats, use the filtered activities, but for runs-specific stats, filter to runs
    const runs = filteredActivities.filter(a => a.type && a.type.includes('Run'));
    console.log("🎽 renderAthleteTab: Runs in filtered activities:", runs.length);

    const athleteData = JSON.parse(localStorage.getItem('strava_athlete_data'));
    const zonesData = JSON.parse(localStorage.getItem('strava_training_zones'));

    // Renderizar componentes
    if (athleteData) renderAthleteProfile(athleteData);
    if (zonesData) renderTrainingZones(zonesData);

    renderAllTimeStats(filteredActivities); // Use filtered activities for general stats
    renderRecordStats(runs); // Keep runs for record stats
    renderStartTimeHistogram(filteredActivities, dataType);
    renderYearlyComparison(filteredActivities, dataType);
    renderWeeklyMixChart(filteredActivities, dataType);
    renderMonthlyMixChart(filteredActivities, dataType);
    renderHourMatrix(filteredActivities, dataType);
    renderYearMonthMatrix(filteredActivities, dataType);
    renderMonthWeekdayMatrix(filteredActivities, dataType);
    renderMonthDayMatrix(filteredActivities, dataType);
    renderMonthHourMatrix(filteredActivities, dataType);
    renderYearHourMatrix(filteredActivities, dataType);
    renderYearWeekdayMatrix(filteredActivities, dataType);
    renderInteractiveMatrix(filteredActivities, dataType);

    console.log("🎽 renderAthleteTab: Athlete tab rendered");
}




function renderAllTimeStats(activities) {
    const container = document.getElementById('all-time-stats-cards');
    if (!container) return;
    const totalDist = (activities.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(0);
    const totalTime = (activities.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1);
    const totalElev = activities.reduce((s, a) => s + a.total_elevation_gain, 0).toLocaleString();
    container.innerHTML = `
        <div class="card"><h3>Total Activities</h3><p>${activities.length}</p></div>
        <div class="card"><h3>Total Distance</h3><p>${totalDist} km</p></div>
        <div class="card"><h3>Total Time</h3><p>${totalTime} h</p></div>
        <div class="card"><h3>Total Elevation</h3><p>${totalElev} m</p></div>
    `;
}

function renderRecordStats(runs) {
    const container = document.getElementById('record-stats');
    if (!container || runs.length === 0) return;

    const longestRun = [...runs].sort((a, b) => b.distance - a.distance)[0];

    const fastestRun = [...runs].filter(r => r.distance > 1000).sort((a, b) => a.average_speed - b.average_speed).reverse()[0];
    const paceMin = fastestRun.average_speed > 0 ? (1000 / fastestRun.average_speed) / 60 : 0;
    const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';

    const mostElev = [...runs].sort((a, b) => b.total_elevation_gain - a.total_elevation_gain)[0];

    const oldestRun = [...runs].sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local))[0];
    const newestRun = [...runs].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))[0];
    const timeDiffMs = new Date(newestRun.start_date_local) - new Date(oldestRun.start_date_local);
    const timeDiffDays = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24));

    const hourCounts = Array(24).fill(0);
    runs.forEach(run => {
        let hour = new Date(run.start_date_local).getHours();
        hour = (hour - 2 + 24) % 24;
        hourCounts[hour]++;
    });
    const favHour = hourCounts.indexOf(Math.max(...hourCounts));

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

    // Solo vs Group workouts
    const soloCount = runs.filter(r => Number(r.athlete_count) === 1).length;
    const groupCount = runs.length - soloCount;
    const soloPct = runs.length ? ((soloCount / runs.length) * 100).toFixed(1) : 0;
    const groupPct = runs.length ? ((groupCount / runs.length) * 100).toFixed(1) : 0;

    container.innerHTML = `
            <ul style="list-style: none; padding-left: 0; line-height: 1.8;">
                <li><strong>Longest Run:</strong> ${(longestRun.distance / 1000).toFixed(2)} km (<a href="html/activity.html?id=${longestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Fastest Run (Pace):</strong> ${paceStr} /km over ${(fastestRun.distance / 1000).toFixed(1)}k (<a href="html/activity.html?id=${fastestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Most Elevation:</strong> ${Math.round(mostElev.total_elevation_gain)} m (<a href="html/activity.html?id=${mostElev.id}" target="_blank">View</a>)</li>
                <li><strong>Time Span:</strong> ${timeDiffDays} days (${oldestRun.start_date_local.substring(0, 10)} to ${newestRun.start_date_local.substring(0, 10)})</li>
                <li><strong>Favourite Hour:</strong> ${favHour}:00</li>
                <li><strong>Favourite Day:</strong> ${favDay}</li>
                <li><strong>Average Distance:</strong> ${avgDist} km</li>
                <li><strong>Average Pace:</strong> ${avgPaceStr} /km</li>
                <li><strong>Solo Workouts:</strong> ${soloCount} (${soloPct}%)</li>
                <li><strong>Group Workouts:</strong> ${groupCount} (${groupPct}%)</li>
            </ul>
        `;
}

function renderStartTimeHistogram(runs, dataType = 'count') {
    const values = Array(24).fill(0);
    runs.forEach(run => {
        let hour = new Date(run.start_date_local).getHours();
        hour = (hour - 2 + 24) % 24;
        switch (dataType) {
            case 'count':
                values[hour]++;
                break;
            case 'time':
                values[hour] += run.moving_time / 3600;
                break;
            case 'distance':
                values[hour] += run.distance / 1000;
                break;
        }
    });
    const labels = values.map((_, i) => `${i}:00`);
    const labelMap = {
        count: '# of Activities',
        time: 'Time (hours)',
        distance: 'Distance (km)'
    };
    createUiChart('start-time-histogram', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: labelMap[dataType],
                data: values,
                backgroundColor: 'rgba(252, 82, 0, 0.7)'
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, title: { display: true, text: labelMap[dataType] } } }
        }
    });
}



function renderYearlyComparison(runs, dataType = 'count') {
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
                        label: function (context) {
                            const dataset = context.dataset;
                            const yearIdx = context.dataIndex;
                            let label = dataset.label.replace(' (scaled)', '');
                            let value = dataset.realData ? dataset.realData[yearIdx] : context.parsed.y;
                            // Format value depending on dataset
                            if (label === 'Total Distance') {
                                return `${label}: ${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
                            }
                            if (label === 'Number of Runs') {
                                return `${label}: ${value}`;
                            }
                            if (label === 'Total Elevation Gain') {
                                return `${label}: ${value.toLocaleString()} m`;
                            }
                            if (label === 'Total Moving Time') {
                                return `${label}: ${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
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


function renderWeeklyMixChart(runs, dataType = 'count') {
    // Prepare data for each day of the week (Monday-Sunday)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayData = Array(7).fill(0);

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
        let dayIdx = date.getDay();
        // Shift so Monday=0, Sunday=6
        dayIdx = (dayIdx + 6) % 7;
        switch (dataType) {
            case 'count':
                dayData[dayIdx]++;
                break;
            case 'time':
                dayData[dayIdx] += run.moving_time / 3600; // hours
                break;
            case 'distance':
                dayData[dayIdx] += run.distance / 1000; // km
                break;
        }
    });

    const labelMap = {
        count: 'Number of Activities',
        time: 'Time (hours)',
        distance: 'Distance (km)'
    };

    createUiChart('weekly-mix-chart', {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [{
                label: labelMap[dataType],
                data: dayData,
                backgroundColor: 'rgba(252, 82, 0, 0.7)',
            }]
        },
        options: {
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: labelMap[dataType] }
                }
            }
        }
    });
}


function renderMonthlyMixChart(runs, dataType = 'count') {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthData = Array(12).fill(0);

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const monthIdx = date.getMonth(); // 0–11
        switch (dataType) {
            case 'count':
                monthData[monthIdx]++;
                break;
            case 'time':
                monthData[monthIdx] += run.moving_time / 3600; // hours
                break;
            case 'distance':
                monthData[monthIdx] += run.distance / 1000; // km
                break;
        }
    });

    const labelMap = {
        count: 'Number of Activities',
        time: 'Time (hours)',
        distance: 'Distance (km)'
    };

    createUiChart('monthly-mix-chart', {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [{
                label: labelMap[dataType],
                data: monthData,
                backgroundColor: 'rgba(252, 82, 0, 0.7)',
            }]
        },
        options: {
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: labelMap[dataType] }
                }
            }
        }
    });
}






function renderHourMatrix(runs, dataType = 'count') {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hourLabels = Array.from({ length: 24 }, (_, i) => i);

    // Inicializar matriz de valores [7 días x 24 horas]
    const values = Array.from({ length: 7 }, () => Array(24).fill(0));

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        const dayIdx = (date.getDay() + 6) % 7; // Monday=0
        const hour = (date.getHours() - 2 + 24) % 24;
        switch (dataType) {
            case 'count':
                values[dayIdx][hour]++;
                break;
            case 'time':
                values[dayIdx][hour] += run.moving_time / 3600;
                break;
            case 'distance':
                values[dayIdx][hour] += run.distance / 1000;
                break;
        }
    });

    const data = [];
    const maxVal = Math.max(...values.flat());

    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            data.push({ x: hour, y: day, v: values[day][hour] });
        }
    }

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.2 + 0.8 * (v / maxVal);
        return `rgba(252,82,0,${alpha.toFixed(2)})`;
    }

    const labelMap = {
        count: 'Runs',
        time: 'Time (h)',
        distance: 'Distance (km)'
    };

    createUiChart('hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: labelMap[dataType],
                data: data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: item => {
                            const d = item[0].raw;
                            return `${dayLabels[d.y]} - ${d.x}:00`;
                        },
                        label: item => `${labelMap[dataType]}: ${item.raw.v.toFixed(1)}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 24,
                    ticks: {
                        stepSize: 1,
                        callback: val => `${val}:00`,
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Hour of Day', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: 0 - 0.5,
                    max: 7,
                    ticks: {
                        stepSize: 1,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Weekday', font: { weight: 'bold' } }
                }
            }
        }
    });
}




function renderYearMonthMatrix(runs, dataType = 'count') {
    const stats = {}; // { [year]: { [month]: value } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const year = date.getFullYear();
        const month = date.getMonth(); // 0–11

        if (!stats[year]) stats[year] = {};
        if (!stats[year][month]) stats[year][month] = 0;

        switch (dataType) {
            case 'count':
                stats[year][month]++;
                break;
            case 'time':
                stats[year][month] += run.moving_time / 3600;
                break;
            case 'distance':
                stats[year][month] += run.distance / 1000;
                break;
        }
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const data = [];
    let maxVal = 0;
    years.forEach((year, yIdx) => {
        months.forEach(month => {
            const val = stats[year]?.[month] || 0;
            maxVal = Math.max(maxVal, val);
            data.push({ x: month, y: yIdx, v: val });
        });
    });

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (v / maxVal);
        return `rgba(0,128,255,${alpha.toFixed(2)})`;
    }

    const labelMap = {
        count: 'Activities',
        time: 'Time (h)',
        distance: 'Distance (km)'
    };

    createUiChart('year-month-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: labelMap[dataType],
                data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${years[d.y]} - ${monthLabels[d.x]}`;
                        },
                        label: item => `${labelMap[dataType]}: ${item.raw.v.toFixed(1)}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 12,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Month',
                        font: { weight: 'bold' }
                    }
                },
                y: {
                    type: 'linear',
                    min: 0 - 0.5,
                    max: years.length,
                    ticks: {
                        stepSize: 1,
                        callback: val => years[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Year',
                        font: { weight: 'bold' }
                    }
                }
            },
            layout: {
                padding: 10
            }
        }
    });
}



function renderMonthWeekdayMatrix(runs, dataType = 'count') {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // stats[month][weekday] = { count, distance }
    const stats = Array.from({ length: 12 }, () =>
        Array.from({ length: 7 }, () => ({ count: 0, distance: 0 }))
    );

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const month = date.getMonth();           // 0–11
        const dayIdx = (date.getDay() + 6) % 7;  // Monday = 0
        const distKm = run.distance / 1000;

        stats[month][dayIdx].count++;
        stats[month][dayIdx].distance += distKm;
    });

    const data = [];
    let maxKm = 0;
    for (let m = 0; m < 12; m++) {
        for (let d = 0; d < 7; d++) {
            const entry = stats[m][d];
            maxKm = Math.max(maxKm, entry.distance);
            data.push({
                x: m,
                y: d,
                km: entry.distance,
                count: entry.count
            });
        }
    }

    function getColor(km) {
        if (km === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(0,200,120,${alpha.toFixed(2)})`;
    }

    createUiChart('month-weekday-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Distance (km)',
                data,
                backgroundColor: data.map(d => getColor(d.km))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${dayLabels[d.y]} - ${monthLabels[d.x]}`;
                        },
                        label: item => {
                            const d = item.raw;
                            return [
                                `Runs: ${d.count}`,
                                `Distance: ${d.km.toFixed(1)} km`
                            ];
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 12,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Month',
                        font: { weight: 'bold' }
                    }
                },
                y: {
                    type: 'linear',
                    min: 0,
                    max: 6,
                    ticks: {
                        stepSize: 1,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: {
                        display: true,
                        text: 'Weekday',
                        font: { weight: 'bold' }
                    }
                }
            },
            layout: { padding: 10 }
        }
    });
}



function renderMonthDayMatrix(runs, dataType = 'count') {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = Array.from({ length: 31 }, (_, i) => i + 1);

    // stats[day][month] = value
    const stats = Array.from({ length: 31 }, () =>
        Array.from({ length: 12 }, () => 0)
    );

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const month = date.getMonth();      // 0–11
        const day = date.getDate() - 1;     // 0–30

        switch (dataType) {
            case 'count':
                stats[day][month]++;
                break;
            case 'time':
                stats[day][month] += run.moving_time / 3600;
                break;
            case 'distance':
                stats[day][month] += run.distance / 1000;
                break;
        }
    });

    const data = [];
    let maxVal = 0;
    for (let d = 0; d < 31; d++) {
        for (let m = 0; m < 12; m++) {
            const val = stats[d][m];
            maxVal = Math.max(maxVal, val);
            data.push({
                x: d,   // day
                y: m,   // month
                v: val
            });
        }
    }

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (v / maxVal);
        return `rgba(255,140,0,${alpha.toFixed(2)})`;
    }

    const labelMap = {
        count: 'Activities',
        time: 'Time (h)',
        distance: 'Distance (km)'
    };

    createUiChart('month-day-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: labelMap[dataType],
                data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${monthLabels[d.y]} ${d.x + 1}`;
                        },
                        label: item => `${labelMap[dataType]}: ${item.raw.v.toFixed(1)}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 31,
                    ticks: {
                        stepSize: 1,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Day of Month', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: 1 - 2,
                    max: 12,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Month', font: { weight: 'bold' } }
                }
            },
            layout: { padding: 10 }
        }
    });
}


function renderMonthHourMatrix(runs, dataType = 'count') {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hourLabels = Array.from({ length: 24 }, (_, i) => i); // 0–23

    // stats[hour][month] = { count, distance }
    const stats = Array.from({ length: 24 }, () =>
        Array.from({ length: 12 }, () => ({ count: 0, distance: 0 }))
    );

    // Aggregate
    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const month = date.getMonth(); // 0–11
        let hour = date.getHours();    // 0–23

        // Subtract 2 hours and wrap around 0–23
        hour = (hour - 2 + 24) % 24;

        const km = (run.distance || 0) / 1000;

        stats[hour][month].count++;
        stats[hour][month].distance += km;
    });

    // Flatten into dataset compatible with matrix chart
    const data = [];
    let maxVal = 0;
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 12; m++) {
            const val = stats[h][m];
            maxVal = Math.max(maxVal, val);
            data.push({
                x: h,         // hour index (x-axis)
                y: m,         // month index (y-axis)
                v: val
            });
        }
    }

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (v / maxVal);
        return `rgba(252,82,0,${alpha.toFixed(2)})`;
    }

    const labelMap = {
        count: 'Activities',
        time: 'Time (h)',
        distance: 'Distance (km)'
    };

    createUiChart('month-hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: labelMap[dataType],
                data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${monthLabels[d.y]} - ${d.x}:00`;
                        },
                        label: item => `${labelMap[dataType]}: ${item.raw.v.toFixed(1)}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: 24,
                    ticks: {
                        stepSize: 2,
                        callback: val => (val % 1 === 0 ? `${val}:00` : ''),
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Hour of Day', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: -1.5,
                    max: 12,
                    ticks: {
                        stepSize: 1,
                        callback: val => monthLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Month', font: { weight: 'bold' } }
                }
            },
            layout: { padding: 10 }
        }
    });
}



function renderYearWeekdayMatrix(runs, dataType = 'count') {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const stats = {}; // { [year]: { [weekday]: value } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;
        const year = date.getFullYear();
        const weekday = (date.getDay() + 6) % 7; // Monday = 0

        if (!stats[year]) stats[year] = {};
        if (!stats[year][weekday]) stats[year][weekday] = 0;

        switch (dataType) {
            case 'count':
                stats[year][weekday]++;
                break;
            case 'time':
                stats[year][weekday] += run.moving_time / 3600;
                break;
            case 'distance':
                stats[year][weekday] += run.distance / 1000;
                break;
        }
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const data = [];
    let maxVal = 0;

    years.forEach((year, yIdx) => {
        for (let d = 0; d < 7; d++) {
            const val = stats[year]?.[d] || 0;
            maxVal = Math.max(maxVal, val);
            data.push({ x: d, y: yIdx, v: val });
        }
    });

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (v / maxVal);
        return `rgba(0,180,200,${alpha.toFixed(2)})`;
    }

    const labelMap = {
        count: 'Activities',
        time: 'Time (h)',
        distance: 'Distance (km)'
    };

    createUiChart('year-weekday-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: labelMap[dataType],
                data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${years[d.y]} - ${dayLabels[d.x]}`;
                        },
                        label: item => `${labelMap[dataType]}: ${item.raw.v.toFixed(1)}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: 7,
                    ticks: {
                        stepSize: 1,
                        callback: val => dayLabels[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Weekday', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: -0.5,
                    max: years.length,
                    ticks: {
                        stepSize: 1,
                        callback: val => years[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Year', font: { weight: 'bold' } }
                }
            },
            layout: { padding: 10 }
        }
    });
}


function renderYearHourMatrix(runs, dataType = 'count') {
    const stats = {}; // { [year]: { [hour]: value } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;
        const year = date.getFullYear();
        let hour = (date.getHours() - 2 + 24) % 24;

        if (!stats[year]) stats[year] = {};
        if (!stats[year][hour]) stats[year][hour] = 0;

        switch (dataType) {
            case 'count':
                stats[year][hour]++;
                break;
            case 'time':
                stats[year][hour] += run.moving_time / 3600;
                break;
            case 'distance':
                stats[year][hour] += run.distance / 1000;
                break;
        }
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const data = [];
    let maxVal = 0;

    years.forEach((year, yIdx) => {
        for (let h = 0; h < 24; h++) {
            const val = stats[year]?.[h] || 0;
            maxVal = Math.max(maxVal, val);
            data.push({ x: h, y: yIdx, v: val });
        }
    });

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (v / maxVal);
        return `rgba(255,100,0,${alpha.toFixed(2)})`;
    }

    const labelMap = {
        count: 'Activities',
        time: 'Time (h)',
        distance: 'Distance (km)'
    };

    createUiChart('year-hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: labelMap[dataType],
                data,
                backgroundColor: data.map(d => getColor(d.v))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: items => {
                            const d = items[0].raw;
                            return `${years[d.y]} - ${d.x}:00`;
                        },
                        label: item => `${labelMap[dataType]}: ${item.raw.v.toFixed(1)}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: 24,
                    ticks: {
                        stepSize: 2,
                        callback: val => (val % 1 === 0 ? `${val}:00` : ''),
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Hour of Day', font: { weight: 'bold' } }
                },
                y: {
                    type: 'linear',
                    min: -0.5,
                    max: years.length,
                    ticks: {
                        stepSize: 1,
                        callback: val => years[val] || '',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    grid: { color: '#eee' },
                    title: { display: true, text: 'Year', font: { weight: 'bold' } }
                }
            },
            layout: { padding: 10 }
        }
    });
}



let interactiveMatrixChart;

function renderInteractiveMatrix(runs, dataType = 'count') {
    const ctx = document.getElementById("interactiveMatrix");

    const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const monthLabels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function getValue(run, key) {
        const date = new Date(run.start_date_local);
        switch (key) {
            case "year": return date.getFullYear();
            case "month": return date.getMonth(); // 0-11
            case "weekday": return (date.getDay() + 6) % 7; // Monday=0
            case "hour": return (date.getHours() - 2 + 24) % 24;
            case "season":
                const m = date.getMonth();
                return [11, 0, 1].includes(m) ? 0 : [2, 3, 4].includes(m) ? 1 : [5, 6, 7].includes(m) ? 2 : 3;
            default: return 0;
        }
    }

    function getLabel(key, value) {
        switch (key) {
            case "weekday": return weekdayLabels[value];
            case "month": return monthLabels[value];
            default: return value.toString();
        }
    }

    function updateMatrix() {
        const xKey = document.getElementById("matrix-x-axis").value;
        const yKey = document.getElementById("matrix-y-axis").value;

        const matrix = {};
        runs.forEach(run => {
            const xVal = getValue(run, xKey);
            const yVal = getValue(run, yKey);
            matrix[yVal] ??= {};
            matrix[yVal][xVal] ??= 0;
            switch (dataType) {
                case "count":
                    matrix[yVal][xVal] += 1;
                    break;
                case "time":
                    matrix[yVal][xVal] += run.moving_time / 3600; // to hours
                    break;
                case "distance":
                    matrix[yVal][xVal] += run.distance / 1000; // to km
                    break;
            }
        });

        const xLabels = [...new Set(runs.map(r => getValue(r, xKey)))].sort((a, b) => a - b);
        const yLabels = [...new Set(runs.map(r => getValue(r, yKey)))].sort((a, b) => a - b);

        const points = [];
        let maxVal = 0;
        yLabels.forEach((y, yi) => {
            xLabels.forEach((x, xi) => {
                const v = matrix[y]?.[x] ?? 0;
                maxVal = Math.max(maxVal, v);
                points.push({ x: x, y: y, v });
            });
        });

        function getColor(v) {
            if (v === 0) return 'rgba(255,255,255,0)';
            return `rgba(0,128,255,${0.15 + 0.85 * (v / maxVal)})`;
        }

        if (interactiveMatrixChart) interactiveMatrixChart.destroy();

        interactiveMatrixChart = new Chart(ctx, {
            type: 'matrix',
            data: {
                datasets: [{
                    label: 'Activity Matrix',
                    data: points,
                    backgroundColor: points.map(d => getColor(d.v)),
                    width: 20,   // tamaño fijo por celda
                    height: 20,  // tamaño fijo por celda
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: items => `X: ${getLabel(xKey, items[0].raw.x)}, Y: ${getLabel(yKey, items[0].raw.y)}`,
                            label: items => {
                                const dataTypeLabel = dataType === 'count' ? 'Count' : dataType === 'time' ? 'Time (h)' : 'Distance (km)';
                                return `${dataTypeLabel}: ${items[0].raw.v.toFixed(1)}`;
                            }
                        }
                    },
                    legend: { display: false }
                },
                scales: {
                    x: { type: 'category', labels: xLabels.map(x => getLabel(xKey, x)), title: { display: true, text: xKey } },
                    y: { type: 'category', labels: yLabels.map(y => getLabel(yKey, y)), title: { display: true, text: yKey } }
                }
            }
        });
    }

    document.getElementById("matrix-x-axis").addEventListener("change", updateMatrix);
    document.getElementById("matrix-y-axis").addEventListener("change", updateMatrix);

    updateMatrix(); // Inicial
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

function addAthleteFilters() {
    const container = document.getElementById('athlete-tab');
    if (!container) return;

    // Check if filters already exist
    if (document.getElementById('athlete-filters')) return;

    const filterDiv = document.createElement('div');
    filterDiv.id = 'athlete-filters';
    filterDiv.style = 'display:flex; gap:1rem; margin-bottom:1rem; align-items:center;';

    // Get all activities to determine most practiced sports
    const allActivities = JSON.parse(localStorage.getItem('strava_activities') || '[]');

    // Count sport occurrences
    const sportCounts = {};
    allActivities.forEach(activity => {
        const sport = activity.type || 'Unknown';
        sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    });

    // Sort sports by count (descending) and take top 10
    const topSports = Object.entries(sportCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([sport]) => sport);

    const dataTypeSelect = document.createElement('select');
    dataTypeSelect.id = 'athlete-data-type';
    dataTypeSelect.innerHTML = `
        <option value="count">Number of Activities</option>
        <option value="time">Time (hours)</option>
        <option value="distance">Distance (km)</option>
    `;

    const sportSelect = document.createElement('select');
    sportSelect.id = 'athlete-sport-filter';

    // Build options HTML
    let optionsHtml = '<option value="all">All Sports</option>';
    topSports.forEach(sport => {
        const count = sportCounts[sport];
        optionsHtml += `<option value="${sport}">${sport} (${count})</option>`;
    });

    sportSelect.innerHTML = optionsHtml;

    const dateFromInput = document.createElement('input');
    dateFromInput.type = 'date';
    dateFromInput.id = 'athlete-date-from';
    dateFromInput.placeholder = 'From date';

    const dateToInput = document.createElement('input');
    dateToInput.type = 'date';
    dateToInput.id = 'athlete-date-to';
    dateToInput.placeholder = 'To date';

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply Filters';
    applyButton.onclick = () => {
        const dataType = dataTypeSelect.value;
        const sport = sportSelect.value;
        const from = dateFromInput.value;
        const to = dateToInput.value;
        // Re-render with filters
        const allActivities = JSON.parse(localStorage.getItem('strava_activities') || '[]');
        renderAthleteTab(allActivities, from, to, sport, dataType);
    };

    filterDiv.appendChild(dataTypeSelect);
    filterDiv.appendChild(sportSelect);
    filterDiv.appendChild(dateFromInput);
    filterDiv.appendChild(dateToInput);
    filterDiv.appendChild(applyButton);

    container.insertBefore(filterDiv, container.firstChild);
}

function filterActivities(allActivities, dateFilterFrom, dateFilterTo, sportFilter = 'all') {
    let filtered = allActivities;

    if (dateFilterFrom || dateFilterTo) {
        filtered = utils.filterActivitiesByDate(filtered, dateFilterFrom, dateFilterTo);
    }

    if (sportFilter !== 'all') {
        filtered = filtered.filter(a => a.type === sportFilter);
    }

    return filtered;
}