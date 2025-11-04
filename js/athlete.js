// js/athlete.js

export function renderAthleteTab(allActivities) {
    console.log("Initializing Athlete Tab...");
    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    const athleteData = JSON.parse(localStorage.getItem('strava_athlete_data'));
    const zonesData = JSON.parse(localStorage.getItem('strava_training_zones'));

    // Renderizar componentes
    if (athleteData) renderAthleteProfile(athleteData);
    if (zonesData) renderTrainingZones(zonesData);

    renderAllTimeStats(runs);
    renderRecordStats(runs);
    renderStartTimeHistogram(runs);
    renderYearlyComparison(runs);
    renderGearSection(runs);
    renderWeeklyMixChart(runs);
    renderMonthlyMixChart(runs);
    renderHourMatrix(runs);
    renderYearMonthMatrix(runs);
    renderMonthWeekdayMatrix(runs);
    renderMonthDayMatrix(runs);
    renderMonthHourMatrix(runs);
    renderYearHourMatrix(runs);
    renderYearWeekdayMatrix(runs);
    renderInteractiveMatrix(runs);
}



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

    // Longest run
    const longestRun = [...runs].sort((a, b) => b.distance - a.distance)[0];

    // Fastest run (pace)
    const fastestRun = [...runs].filter(r => r.distance > 1000).sort((a, b) => a.average_speed - b.average_speed).reverse()[0];
    const paceMin = fastestRun.average_speed > 0 ? (1000 / fastestRun.average_speed) / 60 : 0;
    const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';

    // Most elevation
    const mostElev = [...runs].sort((a, b) => b.total_elevation_gain - a.total_elevation_gain)[0];

    // More time transcurred (oldest to newest)
    const oldestRun = [...runs].sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local))[0];
    const newestRun = [...runs].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))[0];
    const timeDiffMs = new Date(newestRun.start_date_local) - new Date(oldestRun.start_date_local);
    const timeDiffDays = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24));

    // Favourite hour of the day
    const hourCounts = Array(24).fill(0);
    runs.forEach(run => {
        let hour = new Date(run.start_date_local).getHours();
        hour = (hour - 2 + 24) % 24; // adjust for timezone as in histogram
        hourCounts[hour]++;
    });
    const favHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Favourite day of the week
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

    container.innerHTML = `
            <ul style="list-style: none; padding-left: 0; line-height: 1.8;">
                <li><strong>Longest Run:</strong> ${(longestRun.distance / 1000).toFixed(2)} km (<a href="activity.html?id=${longestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Fastest Run (Pace):</strong> ${paceStr} /km over ${(fastestRun.distance / 1000).toFixed(1)}k (<a href="activity.html?id=${fastestRun.id}" target="_blank">View</a>)</li>
                <li><strong>Most Elevation:</strong> ${Math.round(mostElev.total_elevation_gain)} m (<a href="activity.html?id=${mostElev.id}" target="_blank">View</a>)</li>
                <li><strong>Time Span:</strong> ${timeDiffDays} days (${oldestRun.start_date_local.substring(0, 10)} to ${newestRun.start_date_local.substring(0, 10)})</li>
                <li><strong>Favourite Hour:</strong> ${favHour}:00</li>
                <li><strong>Favourite Day:</strong> ${favDay}</li>
                <li><strong>Average Distance:</strong> ${avgDist} km</li>
                <li><strong>Average Pace:</strong> ${avgPaceStr} /km</li>
            </ul>
        `;
}

function renderStartTimeHistogram(runs) {
    const hours = Array(24).fill(0);
    runs.forEach(run => {
        let hour = new Date(run.start_date_local).getHours();
        hour = (hour - 2 + 24) % 24;
        hours[hour]++;
    });
    const labels = hours.map((_, i) => `${i}:00`);
    createUiChart('start-time-histogram', {
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


function renderWeeklyMixChart(runs) {
    // Prepare data for each day of the week (Monday-Sunday)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayCounts = Array(7).fill(0);
    const dayKms = Array(7).fill(0);

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
        let dayIdx = date.getDay();
        // Shift so Monday=0, Sunday=6
        dayIdx = (dayIdx + 6) % 7;
        dayCounts[dayIdx]++;
        dayKms[dayIdx] += run.distance / 1000;
    });

    createUiChart('weekly-mix-chart', {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Total Trainings',
                    data: dayCounts,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                    yAxisID: 'y',
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Total Distance (km)',
                    data: dayKms,
                    fill: true,
                    backgroundColor: 'rgba(0, 116, 217, 0.2)',
                    borderColor: 'rgba(0, 116, 217, 1)',
                    pointBackgroundColor: 'rgba(0, 116, 217, 1)',
                    yAxisID: 'y1',
                    order: 2
                }
            ]
        },
        options: {
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Trainings' },
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}


function renderMonthlyMixChart(runs) {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthCounts = Array(12).fill(0);
    const monthKms = Array(12).fill(0);

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const monthIdx = date.getMonth(); // 0–11
        monthCounts[monthIdx]++;
        monthKms[monthIdx] += run.distance / 1000; // m → km
    });

    createUiChart('monthly-mix-chart', {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Total Trainings',
                    data: monthCounts,
                    backgroundColor: 'rgba(252, 82, 0, 0.7)',
                    yAxisID: 'y',
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Total Distance (km)',
                    data: monthKms,
                    fill: true,
                    backgroundColor: 'rgba(0, 116, 217, 0.2)',
                    borderColor: 'rgba(0, 116, 217, 1)',
                    pointBackgroundColor: 'rgba(0, 116, 217, 1)',
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 2
                }
            ]
        },
        options: {
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Trainings' },
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}






function renderHourMatrix(runs) {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hourLabels = Array.from({ length: 24 }, (_, i) => i);

    // Inicializar matriz de conteos [7 días x 24 horas]
    const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        const dayIdx = (date.getDay() + 6) % 7; // Monday=0
        const hour = (date.getHours() - 2 + 24) % 24;
        counts[dayIdx][hour]++;
    });

    const data = [];
    const maxCount = Math.max(...counts.flat());

    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            data.push({ x: hour, y: day, v: counts[day][hour] });
        }
    }

    function getColor(v) {
        if (v === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.2 + 0.8 * (v / maxCount);
        return `rgba(252,82,0,${alpha.toFixed(2)})`;
    }

    createUiChart('hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Runs',
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
                        label: item => `Runs: ${item.raw.v}`
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




function renderYearMonthMatrix(runs) {
    const stats = {}; // { [year]: { [month]: { count, distance } } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const year = date.getFullYear();
        const month = date.getMonth(); // 0–11

        if (!stats[year]) stats[year] = {};
        if (!stats[year][month]) stats[year][month] = { count: 0, distance: 0 };

        stats[year][month].count++;
        stats[year][month].distance += run.distance / 1000; // asumiendo metros → km
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const data = [];
    let maxKm = 0;
    years.forEach((year, yIdx) => {
        months.forEach(month => {
            const entry = stats[year]?.[month];
            const km = entry ? entry.distance : 0;
            const count = entry ? entry.count : 0;
            maxKm = Math.max(maxKm, km);
            data.push({ x: month, y: yIdx, km, count });
        });
    });

    function getColor(km) {
        if (km === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(0,128,255,${alpha.toFixed(2)})`;
    }

    createUiChart('year-month-matrix', {
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
                            return `${years[d.y]} - ${monthLabels[d.x]}`;
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



function renderMonthWeekdayMatrix(runs) {
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
                    min: 0 - 0.5,
                    max: 7,
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



function renderMonthDayMatrix(runs) {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = Array.from({ length: 31 }, (_, i) => i + 1);

    // stats[day][month] = { count, distance }
    const stats = Array.from({ length: 31 }, () =>
        Array.from({ length: 12 }, () => ({ count: 0, distance: 0 }))
    );

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;

        const month = date.getMonth();      // 0–11
        const day = date.getDate() - 1;     // 0–30
        const distKm = run.distance / 1000; // meters → km

        stats[day][month].count++;
        stats[day][month].distance += distKm;
    });

    const data = [];
    let maxKm = 0;
    for (let d = 0; d < 31; d++) {
        for (let m = 0; m < 12; m++) {
            const entry = stats[d][m];
            if (entry.distance > 0) maxKm = Math.max(maxKm, entry.distance);
            data.push({
                x: d,   // day
                y: m,   // month
                km: entry.distance,
                count: entry.count
            });
        }
    }

    function getColor(km) {
        if (km === 0) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(255,140,0,${alpha.toFixed(2)})`;
    }

    createUiChart('month-day-matrix', {
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
                            return `${monthLabels[d.y]} ${d.x + 1}`;
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


function renderMonthHourMatrix(runs) {
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
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 12; m++) {
            const entry = stats[h][m];
            maxCount = Math.max(maxCount, entry.count);
            data.push({
                x: h,         // hour index (x-axis)
                y: m,         // month index (y-axis)
                count: entry.count,
                km: entry.distance
            });
        }
    }

    function getColor(count) {
        if (!count) return 'rgba(255,255,255,0)';
        const alpha = maxCount ? (0.15 + 0.85 * (count / maxCount)) : 0.95;
        return `rgba(252,82,0,${alpha.toFixed(2)})`;
    }

    createUiChart('month-hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Trainings by Hour & Month',
                data,
                backgroundColor: data.map(d => getColor(d.count))
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



function renderYearWeekdayMatrix(runs) {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const stats = {}; // { [year]: { [weekday]: { count, distance } } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;
        const year = date.getFullYear();
        const weekday = (date.getDay() + 6) % 7; // Monday = 0
        const distKm = run.distance / 1000;

        if (!stats[year]) stats[year] = {};
        if (!stats[year][weekday]) stats[year][weekday] = { count: 0, distance: 0 };

        stats[year][weekday].count++;
        stats[year][weekday].distance += distKm;
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const data = [];
    let maxKm = 0;

    years.forEach((year, yIdx) => {
        for (let d = 0; d < 7; d++) {
            const entry = stats[year]?.[d] || { count: 0, distance: 0 };
            maxKm = Math.max(maxKm, entry.distance);
            data.push({ x: d, y: yIdx, km: entry.distance, count: entry.count });
        }
    });

    function getColor(km) {
        if (!km) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (km / maxKm);
        return `rgba(0,180,200,${alpha.toFixed(2)})`;
    }

    createUiChart('year-weekday-matrix', {
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
                            return `${years[d.y]} - ${dayLabels[d.x]}`;
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


function renderYearHourMatrix(runs) {
    const stats = {}; // { [year]: { [hour]: { count, distance } } }

    runs.forEach(run => {
        const date = new Date(run.start_date_local);
        if (isNaN(date)) return;
        const year = date.getFullYear();
        let hour = (date.getHours() - 2 + 24) % 24;
        const distKm = run.distance / 1000;

        if (!stats[year]) stats[year] = {};
        if (!stats[year][hour]) stats[year][hour] = { count: 0, distance: 0 };

        stats[year][hour].count++;
        stats[year][hour].distance += distKm;
    });

    const years = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const data = [];
    let maxCount = 0;

    years.forEach((year, yIdx) => {
        for (let h = 0; h < 24; h++) {
            const entry = stats[year]?.[h] || { count: 0, distance: 0 };
            maxCount = Math.max(maxCount, entry.count);
            data.push({ x: h, y: yIdx, count: entry.count, km: entry.distance });
        }
    });

    function getColor(count) {
        if (!count) return 'rgba(255,255,255,0)';
        const alpha = 0.15 + 0.85 * (count / maxCount);
        return `rgba(255,100,0,${alpha.toFixed(2)})`;
    }

    createUiChart('year-hour-matrix', {
        type: 'matrix',
        data: {
            datasets: [{
                label: 'Trainings by Hour & Year',
                data,
                backgroundColor: data.map(d => getColor(d.count))
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

function renderInteractiveMatrix(runs) {
    const ctx = document.getElementById("interactiveMatrix");

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

    function updateMatrix() {
        const xKey = document.getElementById("matrix-x-axis").value;
        const yKey = document.getElementById("matrix-y-axis").value;

        const matrix = {};
        runs.forEach(run => {
            const xVal = getValue(run, xKey);
            const yVal = getValue(run, yKey);
            matrix[yVal] ??= {};
            matrix[yVal][xVal] ??= 0;
            matrix[yVal][xVal] += 1; // O usar distancia: run.distance/1000
        });

        const xLabels = [...new Set(runs.map(r => getValue(r, xKey)))].sort((a, b) => a - b);
        const yLabels = [...new Set(runs.map(r => getValue(r, yKey)))].sort((a, b) => a - b);

        const points = [];
        let maxVal = 0;
        yLabels.forEach((y, yi) => {
            xLabels.forEach((x, xi) => {
                const v = matrix[y]?.[x] ?? 0;
                maxVal = Math.max(maxVal, v);
                points.push({ x, y, v });
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
                            title: items => `X: ${items[0].raw.x}, Y: ${items[0].raw.y}`,
                            label: items => `Count: ${items[0].raw.v}`
                        }
                    },
                    legend: { display: false }
                },
                scales: {
                    x: { type: 'category', labels: xLabels, title: { display: true, text: xKey } },
                    y: { type: 'category', labels: yLabels, title: { display: true, text: yKey } }
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