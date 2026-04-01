import * as utils from './utils.js';

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const SWIM_TYPES = new Set(['Swim', 'OpenWaterSwim']);
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'GravelBikeRide', 'MountainBikeRide', 'EBikeRide']);
const GYM_TYPES = new Set(['Workout', 'WeightTraining', 'Crossfit', 'Yoga']);

const CATEGORY_ORDER = ['Run', 'Ride', 'Swim', 'Gym', 'Other'];
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let reportCharts = {};

const SPORT_PALETTE = {
    Run: [16, 90], TrailRun: [25, 85], VirtualRun: [12, 80],
    Ride: [215, 80], VirtualRide: [210, 70], GravelRide: [200, 75],
    MountainBikeRide: [190, 80], EBikeRide: [205, 65],
    Swim: [185, 85], OpenWaterSwim: [195, 80],
    Walk: [142, 65], Hike: [130, 60],
    Workout: [270, 70], WeightTraining: [280, 65], Yoga: [310, 60],
    AlpineSki: [240, 75], NordicSki: [230, 70], Snowboard: [245, 80],
    Rowing: [165, 75], Kayaking: [175, 70],
    Crossfit: [0, 75], IceSkate: [220, 60]
};

function getType(activity) {
    return (activity?.sport_type || activity?.type || 'Unknown').trim();
}

function getCategory(type) {
    if (RUN_TYPES.has(type)) return 'Run';
    if (BIKE_TYPES.has(type)) return 'Ride';
    if (SWIM_TYPES.has(type)) return 'Swim';
    if (GYM_TYPES.has(type)) return 'Gym';
    return 'Other';
}

function parseLocalDate(dateLike) {
    if (!dateLike) return new Date('Invalid Date');
    const raw = String(dateLike).substring(0, 10);
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function dateKey(dateLike) {
    const date = dateLike instanceof Date ? dateLike : parseLocalDate(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function sum(items, selector) {
    return items.reduce((acc, item) => acc + (Number(selector(item)) || 0), 0);
}

function avg(values) {
    const filtered = values.filter(v => Number.isFinite(v));
    if (!filtered.length) return null;
    return filtered.reduce((acc, value) => acc + value, 0) / filtered.length;
}

function pctChange(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    return ((current - previous) / previous) * 100;
}

function formatChange(change, lowerIsBetter = false) {
    if (!Number.isFinite(change)) {
        return '<span style="color:#888;">• N/A</span>';
    }

    const improved = lowerIsBetter ? change < 0 : change > 0;
    const color = improved ? '#10b981' : '#ef4444';
    const arrow = improved ? '▲' : '▼';
    const value = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
    return `<span style="color:${color};font-weight:700;">${arrow} ${value}</span>`;
}

function formatHours(seconds) {
    const hours = (Number(seconds) || 0) / 3600;
    return `${hours.toFixed(1)} h`;
}

function destroyReportCharts() {
    Object.values(reportCharts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    reportCharts = {};
}

function createReportChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    if (reportCharts[canvasId]) {
        reportCharts[canvasId].destroy();
    }

    const chart = new Chart(canvas.getContext('2d'), config);
    reportCharts[canvasId] = chart;
    return chart;
}

function monthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en', { month: 'short' });
}

function isoWeekStart(dateLike) {
    const d = parseLocalDate(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const weekStart = new Date(d);
    const daysSinceMonday = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - daysSinceMonday);
    return dateKey(weekStart);
}

function computeStreaks(activities) {
    if (!activities.length) return { current: 0, longest: 0 };

    const keys = Array.from(new Set(activities.map(a => dateKey(a.start_date_local || a.start_date)).filter(Boolean))).sort();
    if (!keys.length) return { current: 0, longest: 0 };

    let longest = 0;
    let running = 0;
    let prev = null;

    keys.forEach(key => {
        const current = parseLocalDate(key);
        if (!prev) {
            running = 1;
        } else {
            const diffDays = Math.round((current - prev) / 86400000);
            running = diffDays === 1 ? running + 1 : 1;
        }
        longest = Math.max(longest, running);
        prev = current;
    });

    let current = 1;
    for (let i = keys.length - 1; i > 0; i--) {
        const now = parseLocalDate(keys[i]);
        const before = parseLocalDate(keys[i - 1]);
        const diffDays = Math.round((now - before) / 86400000);
        if (diffDays === 1) current += 1;
        else break;
    }

    return { current, longest };
}

function buildYearlyData(allActivities) {
    const getYear = activity => parseLocalDate(activity.start_date_local || activity.start_date).getFullYear();
    return Array.from(new Set(allActivities.map(getYear).filter(Number.isFinite))).sort((a, b) => b - a);
}

function filterByYear(activities, year) {
    return activities.filter(activity => parseLocalDate(activity.start_date_local || activity.start_date).getFullYear() === year);
}

function summarizeByCategory(activities) {
    const map = { Run: 0, Ride: 0, Swim: 0, Gym: 0, Other: 0 };
    activities.forEach(activity => {
        const type = getType(activity);
        const category = getCategory(type);
        map[category] += Number(activity.moving_time) || 0;
    });
    return map;
}

function summarizeByType(activities) {
    const map = {};
    activities.forEach(activity => {
        const type = getType(activity);
        if (!map[type]) map[type] = { moving_time: 0, distance: 0, count: 0, elevation: 0 };
        map[type].moving_time += Number(activity.moving_time) || 0;
        map[type].distance += Number(activity.distance) || 0;
        map[type].elevation += Number(activity.total_elevation_gain) || 0;
        map[type].count += 1;
    });

    return Object.entries(map)
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.moving_time - a.moving_time);
}

function groupMonthlyHours(activities, year) {
    const map = {};
    for (let month = 1; month <= 12; month++) {
        map[`${year}-${String(month).padStart(2, '0')}`] = 0;
    }

    activities.forEach(activity => {
        const date = parseLocalDate(activity.start_date_local || activity.start_date);
        if (Number.isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (map[key] == null) return;
        map[key] += (Number(activity.moving_time) || 0) / 3600;
    });

    return Object.entries(map)
        .map(([month, hours]) => ({ month, hours }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

function groupWeekdayHours(activities) {
    const weekdaySundayFirst = Array(7).fill(0);
    activities.forEach(activity => {
        const date = parseLocalDate(activity.start_date_local || activity.start_date);
        if (Number.isNaN(date.getTime())) return;
        weekdaySundayFirst[date.getDay()] += (Number(activity.moving_time) || 0) / 3600;
    });
    return [
        weekdaySundayFirst[1],
        weekdaySundayFirst[2],
        weekdaySundayFirst[3],
        weekdaySundayFirst[4],
        weekdaySundayFirst[5],
        weekdaySundayFirst[6],
        weekdaySundayFirst[0]
    ];
}

function drawAnnualCharts(current, previous, selectedYear, previousYear) {
    const monthlyCurrent = groupMonthlyHours(current, selectedYear);
    const monthlyPrevious = previousYear ? groupMonthlyHours(previous, previousYear) : [];

    createReportChart('annual-monthly-hours-chart', {
        type: 'line',
        data: {
            labels: monthlyCurrent.map(item => monthLabel(item.month)),
            datasets: [
                {
                    label: `${selectedYear} monthly hours`,
                    data: monthlyCurrent.map(item => +item.hours.toFixed(1)),
                    borderColor: 'rgba(244,114,182,1)',
                    backgroundColor: 'rgba(244,114,182,0.14)',
                    tension: 0.3,
                    pointRadius: 2,
                    fill: true
                },
                {
                    label: previousYear ? `${previousYear} monthly hours` : 'Previous year',
                    data: monthlyPrevious.map(item => +item.hours.toFixed(1)),
                    borderColor: 'rgba(148,163,184,1)',
                    backgroundColor: 'rgba(148,163,184,0.12)',
                    borderDash: [6, 4],
                    tension: 0.25,
                    pointRadius: 0,
                    fill: false,
                    hidden: !previousYear
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } }
        }
    });

    createReportChart('annual-weekday-hours-chart', {
        type: 'bar',
        data: {
            labels: WEEKDAY_NAMES,
            datasets: [{
                label: `${selectedYear} weekday hours`,
                data: groupWeekdayHours(current).map(value => +value.toFixed(1)),
                backgroundColor: 'rgba(16,185,129,0.75)',
                borderColor: 'rgba(16,185,129,1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } }
        }
    });
}

function ensureExportControls(selectedYear, current, previousYear) {
    const controlsHost = document.getElementById('wrapped-year-selector');
    if (!controlsHost) return;

    let wrap = document.getElementById('annual-report-export-controls');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'annual-report-export-controls';
        wrap.style.display = 'flex';
        wrap.style.gap = '0.6rem';
        wrap.style.marginTop = '0.75rem';
        wrap.innerHTML = `
            <button id="annual-report-export-image" type="button">Export Image</button>
            <button id="annual-report-export-pdf" type="button">Export PDF</button>
        `;
        controlsHost.appendChild(wrap);
    }

    const exportImageBtn = document.getElementById('annual-report-export-image');
    const exportPdfBtn = document.getElementById('annual-report-export-pdf');

    if (exportImageBtn) {
        exportImageBtn.onclick = async () => {
            if (typeof html2canvas === 'undefined') {
                alert('html2canvas is not available.');
                return;
            }

            const reportEl = document.getElementById('wrapped-tab');
            if (!reportEl) return;

            const canvas = await html2canvas(reportEl, { scale: 2, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `annual-report-${selectedYear}.png`;
            link.click();
        };
    }

    if (exportPdfBtn) {
        exportPdfBtn.onclick = async () => {
            if (typeof html2canvas === 'undefined') {
                alert('html2canvas is not available.');
                return;
            }

            if (!window.jspdf || !window.jspdf.jsPDF) {
                alert('jsPDF library is not available.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const reportEl = document.getElementById('wrapped-tab');
            if (!reportEl) return;

            const pdf = new jsPDF('p', 'mm', 'a4');
            const totalDistance = sum(current, activity => Number(activity.distance) || 0);
            const totalTime = sum(current, activity => Number(activity.moving_time) || 0);
            const totalElevation = sum(current, activity => Number(activity.total_elevation_gain) || 0);

            pdf.setFillColor(15, 23, 42);
            pdf.rect(0, 0, 210, 297, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(28);
            pdf.text('Annual Report', 18, 42);
            pdf.setFontSize(18);
            pdf.text(String(selectedYear), 18, 56);
            pdf.setFontSize(12);
            pdf.text(`Activities: ${current.length}`, 18, 80);
            pdf.text(`Distance: ${utils.formatDistance(totalDistance)}`, 18, 90);
            pdf.text(`Moving time: ${utils.formatTime(totalTime)}`, 18, 100);
            pdf.text(`Elevation: ${Math.round(totalElevation).toLocaleString()} m`, 18, 110);
            pdf.text(`YoY baseline: ${previousYear || 'N/A'}`, 18, 120);
            pdf.text(`Generated: ${new Date().toLocaleString()}`, 18, 130);

            const canvas = await html2canvas(reportEl, { scale: 2, backgroundColor: '#ffffff' });
            const imageData = canvas.toDataURL('image/png');
            const pageWidth = 190;
            const pageHeight = 277;
            const imageHeight = (canvas.height * pageWidth) / canvas.width;

            let heightLeft = imageHeight;
            let position = 0;

            pdf.addPage();
            pdf.addImage(imageData, 'PNG', 10, 10 + position, pageWidth, imageHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imageData, 'PNG', 10, 10 + position, pageWidth, imageHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`annual-report-${selectedYear}.pdf`);
        };
    }
}

function findRecords(currentYearActivities) {
    const runs = currentYearActivities.filter(activity => RUN_TYPES.has(getType(activity)));
    const rides = currentYearActivities.filter(activity => BIKE_TYPES.has(getType(activity)));
    const swims = currentYearActivities.filter(activity => SWIM_TYPES.has(getType(activity)));

    const longest = currentYearActivities.slice().sort((a, b) => (b.distance || 0) - (a.distance || 0))[0] || null;
    const mostElevation = currentYearActivities.slice().sort((a, b) => (b.total_elevation_gain || 0) - (a.total_elevation_gain || 0))[0] || null;
    const highestTSS = currentYearActivities.slice().filter(a => Number.isFinite(a.tss)).sort((a, b) => (b.tss || 0) - (a.tss || 0))[0] || null;

    const fastestRunPace = runs
        .filter(run => (run.distance || 0) >= 3000 && (run.moving_time || 0) > 0)
        .map(run => ({
            ...run,
            paceSecPerKm: run.moving_time / ((run.distance || 0) / 1000)
        }))
        .sort((a, b) => a.paceSecPerKm - b.paceSecPerKm)[0] || null;

    const longestRun = runs.slice().sort((a, b) => (b.distance || 0) - (a.distance || 0))[0] || null;
    const longestRide = rides.slice().sort((a, b) => (b.distance || 0) - (a.distance || 0))[0] || null;
    const longestSwim = swims.slice().sort((a, b) => (b.distance || 0) - (a.distance || 0))[0] || null;

    return { longest, mostElevation, highestTSS, fastestRunPace, longestRun, longestRide, longestSwim };
}

function bestWeekAndMonth(activities) {
    const byWeek = {};
    const byMonth = {};

    activities.forEach(activity => {
        const week = isoWeekStart(activity.start_date_local || activity.start_date);
        const month = dateKey(activity.start_date_local || activity.start_date).slice(0, 7);
        const km = (Number(activity.distance) || 0) / 1000;
        const hours = (Number(activity.moving_time) || 0) / 3600;

        if (week) {
            if (!byWeek[week]) byWeek[week] = { km: 0, hours: 0 };
            byWeek[week].km += km;
            byWeek[week].hours += hours;
        }

        if (month) {
            if (!byMonth[month]) byMonth[month] = { km: 0, hours: 0 };
            byMonth[month].km += km;
            byMonth[month].hours += hours;
        }
    });

    const topWeek = Object.entries(byWeek)
        .map(([week, values]) => ({ week, ...values }))
        .sort((a, b) => b.km - a.km)[0] || null;

    const topMonth = Object.entries(byMonth)
        .map(([month, values]) => ({ month, ...values }))
        .sort((a, b) => b.km - a.km)[0] || null;

    return { topWeek, topMonth };
}

function activityLink(activity, label) {
    if (!activity?.id) return label;
    return `<a href="html/activity-router.html?id=${activity.id}" target="_blank">${label}</a>`;
}

function renderSummarySection(container, year, current, previous) {
    const totalDistance = sum(current, a => Number(a.distance) || 0);
    const totalTime = sum(current, a => Number(a.moving_time) || 0);
    const totalElevation = sum(current, a => Number(a.total_elevation_gain) || 0);

    const prevDistance = sum(previous, a => Number(a.distance) || 0);
    const prevTime = sum(previous, a => Number(a.moving_time) || 0);
    const prevElevation = sum(previous, a => Number(a.total_elevation_gain) || 0);

    const activeDays = new Set(current.map(a => dateKey(a.start_date_local || a.start_date)).filter(Boolean)).size;
    const { current: currentStreak, longest: longestStreak } = computeStreaks(current);
    const { topWeek, topMonth } = bestWeekAndMonth(current);

    container.innerHTML = `
        <div class="stats-year-header">
            <h2>${year} Annual Report</h2>
            <p>Your full season summary, trends and records.</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card fade-in-up" style="animation-delay:0.05s">
                <div class="stat-value" style="white-space:nowrap;font-size:clamp(1.2rem,2.4vw,2rem);">${current.length}</div>
                <div class="stat-label">Activities</div>
            </div>
            <div class="stat-card fade-in-up" style="animation-delay:0.1s">
                <div class="stat-value" style="white-space:nowrap;font-size:clamp(1.2rem,2.4vw,2rem);">${utils.formatDistance(totalDistance)}</div>
                <div class="stat-label">Distance</div>
                <div style="font-size:.85rem;">${formatChange(pctChange(totalDistance, prevDistance))}</div>
            </div>
            <div class="stat-card fade-in-up" style="animation-delay:0.15s">
                <div class="stat-value" style="white-space:nowrap;font-size:clamp(1.2rem,2.4vw,2rem);">${utils.formatTime(totalTime)}</div>
                <div class="stat-label">Moving Time</div>
                <div style="font-size:.85rem;">${formatChange(pctChange(totalTime, prevTime))}</div>
            </div>
            <div class="stat-card fade-in-up" style="animation-delay:0.2s">
                <div class="stat-value" style="white-space:nowrap;font-size:clamp(1.2rem,2.4vw,2rem);">${Math.round(totalElevation).toLocaleString()} m</div>
                <div class="stat-label">Elevation Gain</div>
                <div style="font-size:.85rem;">${formatChange(pctChange(totalElevation, prevElevation))}</div>
            </div>
            <div class="stat-card fade-in-up" style="animation-delay:0.25s">
                <div class="stat-value" style="white-space:nowrap;font-size:clamp(1.2rem,2.4vw,2rem);">${activeDays}</div>
                <div class="stat-label">Active Days</div>
            </div>
            <div class="stat-card fade-in-up" style="animation-delay:0.3s">
                <div class="stat-value" style="white-space:nowrap;font-size:clamp(1.2rem,2.4vw,2rem);">${longestStreak}d</div>
                <div class="stat-label">Longest Streak</div>
            </div>
        </div>

        <div class="insights-grid">
            <div class="insight-card">
                <div class="insight-icon">🔥</div>
                <div class="insight-content">
                    <div class="insight-label">Current Streak</div>
                    <div class="insight-value">${currentStreak} days</div>
                </div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">📆</div>
                <div class="insight-content">
                    <div class="insight-label">Best Week</div>
                    <div class="insight-value">${topWeek ? `${topWeek.km.toFixed(1)} km` : 'N/A'}</div>
                    <div class="insight-detail">${topWeek ? `${topWeek.hours.toFixed(1)} h · ${topWeek.week}` : ''}</div>
                </div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">🗓️</div>
                <div class="insight-content">
                    <div class="insight-label">Best Month</div>
                    <div class="insight-value">${topMonth ? `${topMonth.km.toFixed(1)} km` : 'N/A'}</div>
                    <div class="insight-detail">${topMonth ? `${topMonth.hours.toFixed(1)} h · ${monthLabel(topMonth.month)} ${topMonth.month.slice(0, 4)}` : ''}</div>
                </div>
            </div>
        </div>
    `;
}

function renderSportsSection(container, current, previous) {
    const byTypeCurrent = summarizeByType(current);
    const byTypePrevious = summarizeByType(previous);
    const previousMap = new Map(byTypePrevious.map(item => [item.type, item]));

    const categoryCards = byTypeCurrent
        .filter(sport => (sport.moving_time / 3600) >= 1)
        .map(sport => {
            const currentHours = sport.moving_time / 3600;
            const currentKm = (sport.distance || 0) / 1000;
            const currentElevation = sport.elevation || 0;
            const prevHours = (previousMap.get(sport.type)?.moving_time || 0) / 3600;
            const change = pctChange(currentHours, prevHours);
            const icon = typeof utils.sportEmoji === 'function' ? utils.sportEmoji(sport.type) : '🏅';

            return `
                <div class="sport-card fade-in-up">
                    <div class="sport-card-header">
                        <div class="sport-icon">${icon}</div>
                        <div class="sport-title">
                            <h4>${sport.type}</h4>
                            <span class="sport-count">${currentHours.toFixed(1)} h</span>
                        </div>
                    </div>
                    <div class="sport-metrics">
                        <div class="metric">
                            <div class="metric-label">Distance</div>
                            <div class="metric-value">${currentKm.toFixed(1)} km</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Elevation</div>
                            <div class="metric-value">${Math.round(currentElevation)} m</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Sessions</div>
                            <div class="metric-value">${sport.count}</div>
                        </div>
                    </div>
                    <div class="metric-change">${formatChange(change)}</div>
                </div>
            `;
        })
        .join('');

    const topTypes = byTypeCurrent.slice(0, 12).map((sport, index) => {
        const previousSport = previousMap.get(sport.type);
        const currentHours = sport.moving_time / 3600;
        const prevHours = (previousSport?.moving_time || 0) / 3600;
        const change = pctChange(currentHours, prevHours);
        const hueSat = SPORT_PALETTE[sport.type] || [210, 60];
        const accent = `hsl(${hueSat[0]} ${hueSat[1]}% 46%)`;

        return `
            <div class="chart-row fade-in-up" style="animation-delay:${Math.min(index * 0.03, 0.35)}s; align-items:center;">
                <div style="width:170px; font-weight:600; color:#1f2937;">${sport.type}</div>
                <div class="chart-bar-container chart-bar-container-sm" style="flex:1; display:flex; align-items:center;">
                    <div class="chart-bar" style="width:${Math.min(100, currentHours)}%; background:${accent}; height:12px; border-radius:999px;"></div>
                </div>
                <div style="width:84px; text-align:right; font-weight:700;">${currentHours.toFixed(1)} h</div>
                <div style="width:96px; text-align:right; font-size:.85rem;">${formatChange(change)}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="section-header">
            <h3>⏱️ Hours by Sport</h3>
            <p class="section-subtitle">Same sport groups as Calendar and Activities tabs, with year-over-year change.</p>
        </div>

        <div class="sport-breakdown">${categoryCards || '<p>No sports over 1 hour in this year.</p>'}</div>

        <div class="chart-section">
            <h4 class="chart-title">Detailed Sport Types</h4>
            <div class="chart-container-compact">${topTypes || '<p>No sport data.</p>'}</div>
        </div>
    `;
}

function renderTemporalSection(container, current) {
    const monthly = {};
    const weekday = Array(7).fill(0); // Monday-first
    const hourBuckets = Array(24).fill(0); // hours by start hour

    current.forEach(activity => {
        const date = parseLocalDate(activity.start_date_local || activity.start_date);
        if (Number.isNaN(date.getTime())) return;

        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthly[month] = (monthly[month] || 0) + ((Number(activity.moving_time) || 0) / 3600);
        const movingHours = (Number(activity.moving_time) || 0) / 3600;
        const dayIdxSundayFirst = date.getDay();
        const dayIdxMondayFirst = dayIdxSundayFirst === 0 ? 6 : dayIdxSundayFirst - 1;
        weekday[dayIdxMondayFirst] += movingHours;
        hourBuckets[date.getHours()] += movingHours;
    });

    const monthlyRows = Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, hours], index, list) => {
            const max = Math.max(...list.map(([, h]) => h), 1);
            const width = (hours / max) * 100;
            return `
                <div class="chart-row fade-in-up" style="animation-delay:${Math.min(index * 0.03, 0.3)}s">
                    <div class="chart-label-sm" style="width:54px;">${monthLabel(month)}</div>
                    <div class="chart-bar-container chart-bar-container-sm" style="flex:1;">
                        <div class="chart-bar" style="width:${width}%;"></div>
                    </div>
                    <span class="chart-value-sm">${hours.toFixed(1)} h</span>
                </div>
            `;
        }).join('');

    const maxWeekday = Math.max(...weekday, 1);
    const weekdayRows = weekday.map((hours, i) => `
        <div class="chart-row fade-in-up" style="animation-delay:${Math.min(i * 0.03, 0.2)}s">
            <div class="chart-label-sm" style="width:54px;">${WEEKDAY_NAMES[i]}</div>
            <div class="chart-bar-container chart-bar-container-sm" style="flex:1;">
                <div class="chart-bar" style="width:${(hours / maxWeekday) * 100}%;"></div>
            </div>
            <span class="chart-value-sm">${hours.toFixed(1)} h</span>
        </div>
    `).join('');

    const periodBuckets = [
        { label: 'Night', start: 0, end: 5 },
        { label: 'Morning', start: 6, end: 11 },
        { label: 'Afternoon', start: 12, end: 17 },
        { label: 'Evening', start: 18, end: 23 }
    ];

    const periodCounts = periodBuckets.map(bucket => {
        const count = hourBuckets
            .map((value, hour) => (hour >= bucket.start && hour <= bucket.end ? value : 0))
            .reduce((acc, value) => acc + value, 0);
        return { label: bucket.label, count };
    });

    const maxPeriod = Math.max(...periodCounts.map(period => period.count), 1);
    const periodRows = periodCounts.map((period, i) => `
        <div class="chart-row fade-in-up" style="animation-delay:${Math.min(i * 0.03, 0.15)}s">
            <div class="chart-label-sm" style="width:76px;">${period.label}</div>
            <div class="chart-bar-container chart-bar-container-sm" style="flex:1;">
                <div class="chart-bar" style="width:${(period.count / maxPeriod) * 100}%;"></div>
            </div>
            <span class="chart-value-sm">${period.count.toFixed(1)} h</span>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="section-header">
            <h3>📈 Trends and Habits</h3>
            <p class="section-subtitle">Monthly volume, weekday preference and training time profile.</p>
        </div>

        <div class="charts-grid" style="margin-bottom:1rem;">
            <div class="chart-section">
                <h4 class="chart-title">Monthly Hours Trend</h4>
                <canvas id="annual-monthly-hours-chart" height="120"></canvas>
            </div>
            <div class="chart-section">
                <h4 class="chart-title">Weekday Hours</h4>
                <canvas id="annual-weekday-hours-chart" height="120"></canvas>
            </div>
        </div>

        <div class="temporal-charts-combined">
            <div class="chart-section chart-section-monthly">
                <h4 class="chart-title-sm">Monthly Hours</h4>
                <div class="chart-container-compact">${monthlyRows || '<p>No monthly data.</p>'}</div>
            </div>
            <div class="chart-section chart-section-weekly">
                <h4 class="chart-title-sm">Weekday Distribution</h4>
                <div class="chart-container-compact">${weekdayRows}</div>
            </div>
            <div class="chart-section chart-section-hourly">
                <h4 class="chart-title-sm">Time of Day</h4>
                <div class="chart-container-compact">${periodRows}</div>
            </div>
        </div>
    `;
}

function renderRecordsSection(container, current) {
    const records = findRecords(current);

    const cards = [
        {
            title: 'Longest Activity',
            value: records.longest ? utils.formatDistance(records.longest.distance || 0) : 'N/A',
            detail: records.longest ? activityLink(records.longest, records.longest.name || 'View activity') : ''
        },
        {
            title: 'Longest Run',
            value: records.longestRun ? utils.formatDistance(records.longestRun.distance || 0) : 'N/A',
            detail: records.longestRun ? activityLink(records.longestRun, records.longestRun.name || 'View activity') : ''
        },
        {
            title: 'Longest Ride',
            value: records.longestRide ? utils.formatDistance(records.longestRide.distance || 0) : 'N/A',
            detail: records.longestRide ? activityLink(records.longestRide, records.longestRide.name || 'View activity') : ''
        },
        {
            title: 'Longest Swim',
            value: records.longestSwim ? utils.formatDistance(records.longestSwim.distance || 0) : 'N/A',
            detail: records.longestSwim ? activityLink(records.longestSwim, records.longestSwim.name || 'View activity') : ''
        },
        {
            title: 'Most Elevation',
            value: records.mostElevation ? `${Math.round(records.mostElevation.total_elevation_gain || 0)} m` : 'N/A',
            detail: records.mostElevation ? activityLink(records.mostElevation, records.mostElevation.name || 'View activity') : ''
        },
        {
            title: 'Fastest Run Pace',
            value: records.fastestRunPace ? utils.formatPace(records.fastestRunPace.moving_time || 0, (records.fastestRunPace.distance || 0) / 1000) : 'N/A',
            detail: records.fastestRunPace ? activityLink(records.fastestRunPace, records.fastestRunPace.name || 'View activity') : ''
        },
        {
            title: 'Highest TSS',
            value: records.highestTSS ? `${Math.round(records.highestTSS.tss || 0)} TSS` : 'N/A',
            detail: records.highestTSS ? activityLink(records.highestTSS, records.highestTSS.name || 'View activity') : ''
        }
    ];

    container.innerHTML = `
        <div class="section-header">
            <h3>🏆 Records and Highlights</h3>
            <p class="section-subtitle">Your standout sessions this year.</p>
        </div>

        <div class="insights-grid">
            ${cards.map((card, i) => `
                <div class="insight-card fade-in-up" style="animation-delay:${Math.min(i * 0.04, 0.25)}s">
                    <div class="insight-content">
                        <div class="insight-label">${card.title}</div>
                        <div class="insight-value">${card.value}</div>
                        <div class="insight-detail">${card.detail}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTopActivitiesSection(container, current) {
    const scored = current
        .filter(activity => Number.isFinite(activity.tss))
        .sort((a, b) => (Number(b.tss) || 0) - (Number(a.tss) || 0))
        .slice(0, 10);

    container.innerHTML = `
        <div class="section-header">
            <h3>🔥 Top 10 Sessions</h3>
            <p class="section-subtitle">Ranked by TSS.</p>
        </div>

        <div class="efforts-list efforts-list-compact">
            ${scored.map((activity, i) => `
                <div class="effort-card effort-card-compact fade-in-up" style="animation-delay:${Math.min(i * 0.03, 0.25)}s">
                    <div class="effort-rank">#${i + 1}</div>
                    <div class="effort-content-compact">
                        <h4 class="effort-title-compact">${activityLink(activity, activity.name || 'Untitled')}</h4>
                        <div class="effort-meta-compact">${getType(activity)} · ${utils.formatDate(activity.start_date_local || activity.start_date)}</div>
                    </div>
                    <div class="effort-score-compact">${Math.round(Number(activity.tss) || 0)}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderActivitiesTable(container, current, year) {
    const sorted = current.slice().sort((a, b) => parseLocalDate(b.start_date_local || b.start_date) - parseLocalDate(a.start_date_local || a.start_date));

    container.innerHTML = `
        <div class="section-header">
            <h3>📋 All Activities</h3>
            <p class="section-subtitle">${sorted.length} activities in ${year}.</p>
        </div>

        <div class="activities-table-container">
            <table class="activities-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Distance</th>
                        <th>Time</th>
                        <th>Elevation</th>
                        <th>TSS</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(activity => `
                        <tr>
                            <td class="table-date">${utils.formatDate(activity.start_date_local || activity.start_date)}</td>
                            <td class="table-name">${activityLink(activity, activity.name || 'Untitled')}</td>
                            <td class="table-type"><span class="type-badge">${getType(activity)}</span></td>
                            <td class="table-distance">${utils.formatDistance(Number(activity.distance) || 0)}</td>
                            <td class="table-time">${utils.formatTime(Number(activity.moving_time) || 0)}</td>
                            <td>${Math.round(Number(activity.total_elevation_gain) || 0)} m</td>
                            <td>${Number.isFinite(activity.tss) ? Math.round(activity.tss) : '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderSoloVsGroupSection(current) {
    const withAthleteCount = current.filter(activity => Number.isFinite(Number(activity.athlete_count)));
    const solo = withAthleteCount.filter(activity => Number(activity.athlete_count) === 1);
    const group = withAthleteCount.filter(activity => Number(activity.athlete_count) > 1);

    if (!withAthleteCount.length) {
        return `
            <div class="insight-card">
                <div class="insight-content">
                    <div class="insight-label">Solo vs Group</div>
                    <div class="insight-value">N/A</div>
                    <div class="insight-detail">No athlete_count data available.</div>
                </div>
            </div>
        `;
    }

    const soloPct = (solo.length / withAthleteCount.length) * 100;
    const groupPct = 100 - soloPct;

    return `
        <div class="insight-card">
            <div class="insight-content">
                <div class="insight-label">Solo vs Group</div>
                <div class="insight-value">${soloPct.toFixed(1)}% solo</div>
                <div class="insight-detail">${solo.length} solo · ${group.length} group (${groupPct.toFixed(1)}%)</div>
            </div>
        </div>
    `;
}

export async function renderWrappedTab(allActivities, options = {}) {
    const activities = options.fullActivities || allActivities || [];
    destroyReportCharts();

    const ids = {
        summary: 'wrapped-summary',
        personalBests: 'wrapped-personal-bests',
        sportComparison: 'wrapped-sport-comparison',
        temporalStats: 'wrapped-temporal-stats',
        motivation: 'wrapped-motivation',
        extremeStats: 'wrapped-extreme-stats',
        allActivities: 'wrapped-all-activities'
    };

    const summaryEl = document.getElementById(ids.summary);
    const personalBestsEl = document.getElementById(ids.personalBests);
    const sportEl = document.getElementById(ids.sportComparison);
    const temporalEl = document.getElementById(ids.temporalStats);
    const motivationEl = document.getElementById(ids.motivation);
    const extremeEl = document.getElementById(ids.extremeStats);
    const allEl = document.getElementById(ids.allActivities);

    if (!summaryEl || !personalBestsEl || !sportEl || !temporalEl || !motivationEl || !extremeEl || !allEl) {
        return;
    }

    if (!activities.length) {
        summaryEl.innerHTML = `
            <div style="text-align:center;padding:3rem;color:#666;">
                <div style="font-size:3rem;margin-bottom:1rem;">📊</div>
                <h3>No activity data available</h3>
            </div>
        `;
        personalBestsEl.innerHTML = '';
        sportEl.innerHTML = '';
        temporalEl.innerHTML = '';
        motivationEl.innerHTML = '';
        extremeEl.innerHTML = '';
        allEl.innerHTML = '';
        return;
    }

    const years = buildYearlyData(activities);
    const selectedYear = Number(options.selectedYear) || years[0];
    const selectedIndex = years.indexOf(selectedYear);
    const previousYear = selectedIndex >= 0 ? years[selectedIndex + 1] : null;

    const yearSelect = document.getElementById('wrapped-year');
    if (yearSelect) {
        yearSelect.innerHTML = years
            .map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`)
            .join('');
        yearSelect.onchange = () => renderWrappedTab(activities, { fullActivities: activities, selectedYear: Number(yearSelect.value) });
    }

    const current = filterByYear(activities, selectedYear);
    const previous = previousYear ? filterByYear(activities, previousYear) : [];

    renderSummarySection(summaryEl, selectedYear, current, previous);
    renderSportsSection(sportEl, current, previous);
    renderTemporalSection(temporalEl, current);
    renderRecordsSection(personalBestsEl, current);
    renderTopActivitiesSection(motivationEl, current);

    extremeEl.innerHTML = `
        <div class="section-header">
            <h3>🧠 Year Intelligence</h3>
            <p class="section-subtitle">A compact executive view for ${selectedYear}.</p>
        </div>
        <div class="insights-grid">
            ${renderSoloVsGroupSection(current)}
            <div class="insight-card">
                <div class="insight-content">
                    <div class="insight-label">Sport Types Used</div>
                    <div class="insight-value">${summarizeByType(current).length}</div>
                    <div class="insight-detail">Including all raw Strava sport types.</div>
                </div>
            </div>
            <div class="insight-card">
                <div class="insight-content">
                    <div class="insight-label">Run Share</div>
                    <div class="insight-value">${(() => {
            const cat = summarizeByCategory(current);
            const total = CATEGORY_ORDER.reduce((acc, key) => acc + cat[key], 0);
            return total > 0 ? `${((cat.Run / total) * 100).toFixed(1)}%` : '0%';
        })()}</div>
                    <div class="insight-detail">Share of moving time by primary category.</div>
                </div>
            </div>
            <div class="insight-card">
                <div class="insight-content">
                    <div class="insight-label">YoY Coverage</div>
                    <div class="insight-value">${previousYear ? `${previousYear} vs ${selectedYear}` : 'Single Year'}</div>
                    <div class="insight-detail">Percent changes shown when previous data exists.</div>
                </div>
            </div>
        </div>
    `;

    renderActivitiesTable(allEl, current, selectedYear);
    drawAnnualCharts(current, previous, selectedYear, previousYear);
    ensureExportControls(selectedYear, current, previousYear);
}
