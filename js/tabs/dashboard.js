import * as utils from './utils.js';

let selectedRangeDays = 'last30'; // rango inicial
let acuteLoadBandMode = localStorage.getItem('dashboard_acute_load_mode') === 'conservative' ? 'conservative' : 'aggressive';
let dashboardRenderContext = {
    allActivities: [],
    dateFilterFrom: null,
    dateFilterTo: null
};

const RANGE_OPTIONS = [
    { label: 'This Week', type: 'week' },
    { label: 'Last 7 Days', type: 'last7' },
    { label: 'This Month', type: 'month' },
    { label: 'Last 30 Days', type: 'last30' },
    { label: 'Last 3 Months', type: 'last3m' },
    { label: 'Last 6 Months', type: 'last6m' },
    { label: 'This Year', type: 'year' },
    { label: 'Last 365 Days', type: 'last365' }
];

function toLocalYMD(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderHoursBySportChart(activities) {
    // Agrupar horas por día y por deporte
    const sports = ["Run", "Ride", "Swim", "Workout"]; // Gym = Workout en Strava
    const dataByDay = {};

    activities.forEach(act => {
        const date = act.start_date_local.split("T")[0];
        const sport = act.sport_type;
        const hours = act.moving_time / 3600;

        if (!sports.includes(sport)) return;

        if (!dataByDay[date]) {
            dataByDay[date] = { Run: 0, Ride: 0, Swim: 0, Workout: 0 };
        }

        dataByDay[date][sport] += hours;
    });

    // Ordenar fechas
    const labels = Object.keys(dataByDay).sort();

    // Construir datasets
    const datasets = [
        {
            label: "Run",
            data: labels.map(d => dataByDay[d].Run),
            borderColor: "#ff7f50",
            backgroundColor: "rgba(255,127,80,0.4)",
            fill: true
        },
        {
            label: "Ride",
            data: labels.map(d => dataByDay[d].Ride),
            borderColor: "#1e90ff",
            backgroundColor: "rgba(30,144,255,0.4)",
            fill: true
        },
        {
            label: "Swim",
            data: labels.map(d => dataByDay[d].Swim),
            borderColor: "#20b2aa",
            backgroundColor: "rgba(32,178,170,0.4)",
            fill: true
        },
        {
            label: "Gym",
            data: labels.map(d => dataByDay[d].Workout),
            borderColor: "#9370db",
            backgroundColor: "rgba(147,112,219,0.4)",
            fill: true
        }
    ];

    // Crear gráfico
    const ctx = document.getElementById("hoursBySportChart").getContext("2d");

    new Chart(ctx, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            interaction: { mode: "index", intersect: false },
            stacked: true,
            plugins: {
                title: {
                    display: true,
                    text: "Horas por deporte (stacked area)"
                }
            },
            scales: {
                y: {
                    stacked: true,
                    title: { display: true, text: "Horas" }
                },
                x: {
                    title: { display: true, text: "Fecha" }
                }
            }
        }
    });
}


function parseDateInput(value, endOfDay = false) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function getEffectiveDashboardWindow(dateFilterFrom, dateFilterTo) {
    const now = new Date();
    const startDate = getRangeStartDate(selectedRangeDays);
    const minDate = parseDateInput(dateFilterFrom);
    const maxDate = parseDateInput(dateFilterTo, true);
    let effectiveStart = new Date(startDate);
    let effectiveEnd = new Date(now);

    effectiveStart.setHours(0, 0, 0, 0);

    if (minDate && minDate > effectiveStart) {
        effectiveStart = minDate;
    }

    if (maxDate && maxDate < effectiveEnd) {
        effectiveEnd = maxDate;
    }

    if (effectiveStart > effectiveEnd) {
        effectiveStart = new Date(effectiveEnd);
        effectiveStart.setHours(0, 0, 0, 0);
    }

    return { startDate: effectiveStart, endDate: effectiveEnd };
}

function getRangeStartDate(rangeType) {
    const now = new Date();
    let startDate;

    switch (rangeType) {
        case 'week': {
            const currentDay = now.getDay();
            const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
            startDate = new Date(now);
            startDate.setDate(now.getDate() + diffToMonday);
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

    return startDate;
}

function getRangeLabel(rangeType) {
    return RANGE_OPTIONS.find(r => r.type === rangeType)?.label || 'Last 30 Days';
}

function getSportKey(type = '') {
    if (type.includes('Run')) return 'Run';
    if (type.includes('Ride')) return 'Ride';
    if (type.includes('Swim')) return 'Swim';
    if (type.includes('WeightTraining') || type.includes('Workout')) return 'Gym';
    return 'Other';
}

function getValidLoadActivities(activities) {
    return activities
        .filter(activity =>
            activity.tss != null &&
            activity.atl != null &&
            activity.ctl != null &&
            activity.tsb != null &&
            activity.injuryRisk != null
        )
        .sort((a, b) => new Date(a.start_date_local || 0) - new Date(b.start_date_local || 0));
}

function toDisplayTsb(rawTsb) {
    return rawTsb || 0;
}

function percentileRank(values, value) {
    const filtered = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!filtered.length) return 0.5;
    let count = 0;
    for (const current of filtered) {
        if (current <= value) count += 1;
    }
    return count / filtered.length;
}

function getPmcProfile(loadActivities) {
    const counts = loadActivities.reduce((acc, activity) => {
        const key = getSportKey(activity.type || '');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const total = loadActivities.length || 1;
    const sports = ['Run', 'Ride', 'Swim', 'Gym'];
    const rankedSports = sports
        .map(name => ({ name, count: counts[name] || 0, share: (counts[name] || 0) / total }))
        .sort((a, b) => b.count - a.count);

    const activeSports = rankedSports.filter(sport => sport.share >= 0.15);
    const dominantSport = rankedSports[0]?.name || 'Run';
    const gymShare = rankedSports.find(sport => sport.name === 'Gym')?.share || 0;

    let label = `${dominantSport}-focused endurance`;
    let thresholds = { deepFatigue: -18, fatigue: -8, balanced: 6, fresh: 18 };

    if (activeSports.length >= 3) {
        label = 'multisport endurance';
        thresholds = { deepFatigue: -20, fatigue: -10, balanced: 6, fresh: 18 };
    } else if (gymShare >= 0.25 && activeSports.length >= 2) {
        label = 'hybrid endurance + gym';
        thresholds = { deepFatigue: -14, fatigue: -6, balanced: 6, fresh: 16 };
    } else if (dominantSport === 'Ride') {
        thresholds = { deepFatigue: -24, fatigue: -12, balanced: 6, fresh: 20 };
    } else if (dominantSport === 'Swim') {
        thresholds = { deepFatigue: -16, fatigue: -8, balanced: 7, fresh: 16 };
    } else if (dominantSport === 'Run') {
        thresholds = { deepFatigue: -18, fatigue: -8, balanced: 5, fresh: 18 };
    }

    return { label, thresholds, dominantSport, rankedSports };
}

function renderDashboardTopline(filteredActivities, recentActivities, recentRuns, startDate, dateFilterFrom, dateFilterTo) {
    const container = document.getElementById('dashboard-topline');
    if (!container) return;

    const totalDistanceKm = recentActivities.reduce((sum, a) => sum + ((a.distance || 0) / 1000), 0);
    const totalMovingTime = recentActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
    const longestRunKm = recentRuns.reduce((max, run) => Math.max(max, (run.distance || 0) / 1000), 0);

    const sportCounts = recentActivities.reduce((acc, a) => {
        const key = getSportKey(a.type || '');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const sportMixText = ['Run', 'Ride', 'Swim', 'Gym']
        .filter(key => sportCounts[key])
        .map(key => `${key}: ${sportCounts[key]}`)
        .join(' · ') || 'No recent activities in this period';

    container.innerHTML = `
        <div class="dashboard-mini-card">
            <p class="dashboard-mini-label">Activities</p>
            <p class="dashboard-mini-value">${recentActivities.length}</p>
        </div>
        <div class="dashboard-mini-card">
            <p class="dashboard-mini-label">Volume</p>
            <p class="dashboard-mini-value">${totalDistanceKm.toFixed(1)} km</p>
            <p class="dashboard-mini-subvalue">${utils.formatTime(totalMovingTime)}</p>
        </div>
        <div class="dashboard-mini-card">
            <p class="dashboard-mini-label">Longest Run</p>
            <p class="dashboard-mini-value">${longestRunKm.toFixed(1)} km</p>
        </div>
        <div class="dashboard-mini-card dashboard-mini-card-wide">
            <p class="dashboard-mini-label">Sport Mix</p>
            <p class="dashboard-mini-value dashboard-mini-value-small">${sportMixText}</p>
        </div>
    `;
}

function describeCtl(value, context) {
    if (context.ctlPercentile >= 0.85) return `High for your recent ${context.profile.label} baseline. You are near the top of your own rolling fitness range.`;
    if (context.ctlPercentile >= 0.6) return `Solid for your recent ${context.profile.label} baseline. You are carrying a meaningful amount of accumulated work.`;
    if (context.ctlPercentile >= 0.35) return `Moderate for your recent ${context.profile.label} baseline. Fitness is building, but not near your recent ceiling.`;
    return `Low versus your recent ${context.profile.label} history. This usually means rebuilding, recovery, or lower training consistency.`;
}

function describeAtl(value, ctlValue, context) {
    const delta = value - ctlValue;
    if (delta >= 18 || context.atlPercentile >= 0.9) return `Acute load is very high for your ${context.profile.label} pattern. Short-term fatigue should be expected.`;
    if (delta >= 8 || context.atlPercentile >= 0.7) return `Acute load is meaningfully above base. This looks like a hard week or overload block.`;
    if (delta > -4) return 'Acute load is close to your base. That usually means manageable fatigue and normal training continuity.';
    return 'Acute load is below base. You are probably freshening up, tapering, or just carrying a lighter few days.';
}

function describeTsb(value, context) {
    const { deepFatigue, fatigue, balanced, fresh } = context.profile.thresholds;
    if (value <= deepFatigue) return `Deep fatigue for a ${context.profile.label} profile. This can be useful briefly, but recovery cost and injury exposure rise here.`;
    if (value <= fatigue) return `You are carrying notable fatigue for a ${context.profile.label} profile. Good for load accumulation, not ideal for peak performance.`;
    if (value <= balanced) return `This is a productive training zone for your current ${context.profile.label} mix: enough stress to adapt without looking excessively buried.`;
    if (value <= fresh) return `Fresh and usable. For your current profile this is the range where testing, intensity or racing tends to feel better.`;
    return `Very fresh for your recent profile. If it persists, it may reflect under-loading rather than ideal tapering.`;
}

function describeInjuryRisk(value, context) {
    if (value >= 0.75 || context.riskPercentile >= 0.9) return 'Very high estimated risk relative to your recent training history. More load here should be a conscious decision, not background noise.';
    if (value >= 0.5 || context.riskPercentile >= 0.7) return 'Elevated estimated risk. Recovery quality, sleep and spacing of hard sessions matter more than usual.';
    if (value >= 0.25) return 'Moderate estimated risk. Load is present, but still short of the zone where the model becomes strongly defensive.';
    return 'Low estimated risk relative to your recent pattern. Current load balance looks broadly manageable.';
}

function getCtlStatus(value, activities, profile) {
    const ctlValues = activities.map(activity => activity.ctl).filter(Number.isFinite);
    const ctlPercentile = percentileRank(ctlValues, value);

    if (ctlPercentile >= 0.9) {
        return { label: 'Peak fitness', color: '#1f9d55' };
    }
    if (ctlPercentile >= 0.7) {
        return { label: 'High fitness', color: '#27ae60' };
    }
    if (ctlPercentile >= 0.45) {
        return { label: 'Productive', color: '#0074D9' };
    }
    if (ctlPercentile >= 0.25) {
        return { label: 'Maintaining', color: '#f39c12' };
    }
    return { label: `Rebuilding (${profile.label})`, color: '#f39c12' };
}

function getAtlStatus(atlValue, ctlValue) {
    const delta = atlValue - ctlValue;

    if (delta >= 22) {
        return { label: 'Strained', color: '#e74c3c' };
    }
    if (delta >= 12) {
        return { label: 'Overload', color: '#FF851B' };
    }
    if (delta >= 4) {
        return { label: 'Build', color: '#f39c12' };
    }
    if (delta > -6) {
        return { label: 'Productive', color: '#27ae60' };
    }
    return { label: 'Recovery', color: '#0074D9' };
}

function getTsbStatus(tsbValue, profile) {
    const thresholds = profile.thresholds;

    if (tsbValue <= thresholds.deepFatigue) {
        return { label: 'Strained', color: '#e74c3c' };
    }
    if (tsbValue <= thresholds.fatigue) {
        return { label: 'Heavy load', color: '#FF851B' };
    }
    if (tsbValue <= thresholds.balanced) {
        return { label: 'Productive', color: '#27ae60' };
    }
    if (tsbValue <= thresholds.fresh) {
        return { label: 'Race-ready', color: '#0074D9' };
    }
    if (tsbValue <= thresholds.fresh + 8) {
        return { label: 'Recovery', color: '#6c757d' };
    }
    return { label: 'Underload', color: '#8e44ad' };
}

// Garmin-style acute load band:
// "Optimal" zone sits between ~80-120% of 42-day chronic weekly load.
// Conservative narrows the band; aggressive widens it.
function getAcuteLoadBand(profile, ctlValue, mode = acuteLoadBandMode) {
    const weeklyBase = Math.max(10, ctlValue * 7);

    // Garmin uses roughly 0.8×baseline – 1.3×baseline as the productive zone.
    // Conservative  →  0.85 – 1.10  (narrower, lower ceiling)
    // Aggressive    →  0.75 – 1.30  (wider, allows bigger overloads)
    const config = mode === 'aggressive'
        ? { lo: 0.75, hi: 1.30, minWidth: 30 }
        : { lo: 0.85, hi: 1.10, minWidth: 20 };

    let lower = weeklyBase * config.lo;
    let upper = weeklyBase * config.hi;

    // Guarantee a minimum visual width so the band doesn't collapse for low CTL
    if (upper - lower < config.minWidth) {
        const mid = (lower + upper) / 2;
        lower = mid - config.minWidth / 2;
        upper = mid + config.minWidth / 2;
    }
    lower = Math.max(0, lower);

    return {
        lower: +lower.toFixed(1),
        upper: +upper.toFixed(1)
    };
}

function getAcuteLoadStatus(loadValue, band) {
    const tolerance = Math.max(8, (band.upper - band.lower) * 0.08);

    if (loadValue < band.lower - tolerance) {
        return {
            label: 'Below range',
            color: '#0074D9',
            tone: 'low'
        };
    }

    if (loadValue > band.upper + tolerance) {
        return {
            label: 'Above range',
            color: '#e74c3c',
            tone: 'high'
        };
    }

    return {
        label: 'In range',
        color: '#1f9d55',
        tone: 'balanced'
    };
}

function describeAcuteLoadStatus(loadValue, band, profile, status) {
    if (status.tone === 'high') {
        return `Your rolling 7-day load is above the ideal band for a ${profile.label} profile. This is a legitimate overload block, but recovery cost will usually climb fast here.`;
    }

    if (status.tone === 'low') {
        return `Your rolling 7-day load is below the ideal band for a ${profile.label} profile. This normally reflects a recovery week, taper, or a lighter block than your current base could support.`;
    }

    return `Your rolling 7-day load is inside the ideal band for a ${profile.label} profile. This is the closest equivalent here to Garmin's productive acute-load zone.`;
}

function renderAcuteLoadModeSwitch() {
    const container = document.getElementById('acute-load-mode-switch');
    if (!container) return;

    container.querySelectorAll('.acute-load-mode-btn').forEach(button => {
        const isActive = button.dataset.mode === acuteLoadBandMode;
        button.classList.toggle('active', isActive);
        button.onclick = () => {
            const nextMode = button.dataset.mode === 'aggressive' ? 'aggressive' : 'conservative';
            if (nextMode === acuteLoadBandMode) return;

            acuteLoadBandMode = nextMode;
            localStorage.setItem('dashboard_acute_load_mode', acuteLoadBandMode);
            renderDashboardContent(
                dashboardRenderContext.allActivities,
                dashboardRenderContext.dateFilterFrom,
                dashboardRenderContext.dateFilterTo
            );
        };
    });
}

function buildRollingSevenDayLoad(activities, rangeStart, rangeEnd) {
    const sorted = getValidLoadActivities(activities);
    if (!sorted.length) return null;

    const tssByDay = new Map();
    const metricsByDay = new Map();
    let ctlSeed = sorted[0].ctl || 0;
    let atlSeed = sorted[0].atl || 0;
    let tsbSeed = sorted[0].tsb || 0;
    let riskSeed = sorted[0].injuryRisk || 0;

    sorted.forEach(activity => {
        const date = new Date(activity.start_date_local);
        const key = toLocalYMD(date);
        tssByDay.set(key, (tssByDay.get(key) || 0) + (activity.tss || 0));

        const existing = metricsByDay.get(key) || { ctlSum: 0, atlSum: 0, tsbSum: 0, riskSum: 0, count: 0 };
        existing.ctlSum += activity.ctl || 0;
        existing.atlSum += activity.atl || 0;
        existing.tsbSum += activity.tsb || 0;
        existing.riskSum += activity.injuryRisk || 0;
        existing.count += 1;
        metricsByDay.set(key, existing);

        if (date <= rangeStart) {
            if (Number.isFinite(activity.ctl)) ctlSeed = activity.ctl;
            if (Number.isFinite(activity.atl)) atlSeed = activity.atl;
            if (Number.isFinite(activity.tsb)) tsbSeed = activity.tsb;
            if (Number.isFinite(activity.injuryRisk)) riskSeed = activity.injuryRisk;
        }
    });

    const labels = [];
    const dailyTss = [];
    const ctlDaily = [];
    const atlDaily = [];
    const tsbDaily = [];
    const riskDaily = [];
    let cursor = new Date(rangeStart);
    let lastCtl = ctlSeed;
    let lastAtl = atlSeed;
    let lastTsb = tsbSeed;
    let lastRisk = riskSeed;
    const endCursor = new Date(rangeEnd);

    cursor.setHours(0, 0, 0, 0);
    endCursor.setHours(0, 0, 0, 0);

    while (cursor <= endCursor) {
        const key = toLocalYMD(cursor);
        const entry = metricsByDay.get(key);

        if (entry && entry.count) {
            lastCtl = entry.ctlSum / entry.count;
            lastAtl = entry.atlSum / entry.count;
            lastTsb = entry.tsbSum / entry.count;
            lastRisk = entry.riskSum / entry.count;
        }

        labels.push(key);
        dailyTss.push(tssByDay.get(key) || 0);
        ctlDaily.push(+lastCtl.toFixed(1));
        atlDaily.push(+lastAtl.toFixed(1));
        tsbDaily.push(+(toDisplayTsb(lastTsb)).toFixed(1));
        riskDaily.push(+lastRisk.toFixed(3));
        cursor = addDays(cursor, 1);
    }

    const load7d = dailyTss.map((_, index) => {
        let sum = 0;
        for (let offset = Math.max(0, index - 6); offset <= index; offset += 1) {
            sum += dailyTss[offset];
        }
        return +sum.toFixed(1);
    });

    return { labels, load7d, ctlDaily, atlDaily, tsbDaily, riskDaily, sorted };
}

function renderAcuteLoadExplanation(sortedActivities, profile, currentBand, currentStatus, currentLoad, currentCtl, currentAtl, currentTsb, currentRisk) {
    const container = document.getElementById('acute-load-explainer');
    if (!container) return;

    if (!sortedActivities.length) {
        container.innerHTML = '';
        return;
    }

    const deltaToTop = currentBand.upper - currentLoad;
    const deltaToBottom = currentLoad - currentBand.lower;
    const gapText = currentStatus.tone === 'high'
        ? `${(currentLoad - currentBand.upper).toFixed(1)} above the band`
        : currentStatus.tone === 'low'
            ? `${(currentBand.lower - currentLoad).toFixed(1)} below the band`
            : `${Math.min(deltaToTop, deltaToBottom).toFixed(1)} from edge`;

    const ctlStatus = getCtlStatus(currentCtl, sortedActivities, profile);
    const atlStatus = getAtlStatus(currentAtl, currentCtl);
    const tsbStatus = getTsbStatus(currentTsb, profile);
    const context = {
        profile,
        ctlPercentile: percentileRank(sortedActivities.map(a => a.ctl), currentCtl),
        atlPercentile: percentileRank(sortedActivities.map(a => a.atl), currentAtl),
        riskPercentile: percentileRank(sortedActivities.map(a => a.injuryRisk), currentRisk)
    };

    // Total load in range
    const totalLoad = sortedActivities.reduce((s, a) => s + (a.tss || 0), 0).toFixed(0);

    // Weekly delta (last 14 days)
    const now = new Date();
    const recent14 = sortedActivities.filter(a => (now - new Date(a.start_date_local)) / 86400000 <= 14);
    const week1Load = recent14.filter(a => (now - new Date(a.start_date_local)) / 86400000 <= 7).reduce((s, a) => s + (a.tss || 0), 0);
    const week2Load = recent14.filter(a => (now - new Date(a.start_date_local)) / 86400000 > 7).reduce((s, a) => s + (a.tss || 0), 0);
    const weekDeltaPct = week2Load > 0 ? ((week1Load - week2Load) / week2Load) * 100 : 0;
    const weekTrend = weekDeltaPct > 0 ? `▲ ${Math.abs(weekDeltaPct).toFixed(0)}%` : `▼ ${Math.abs(weekDeltaPct).toFixed(0)}%`;
    const weekTrendColor = getTrendColor(weekDeltaPct);

    // Ideal ranges
    const th = profile.thresholds;
    const ctlValues = sortedActivities.map(a => a.ctl).filter(Number.isFinite);
    const ctlMin = Math.min(...ctlValues);
    const ctlMax = Math.max(...ctlValues);
    const ctlIdealLow = (ctlMax * 0.6).toFixed(1);
    const ctlIdealHigh = ctlMax.toFixed(1);
    const atlIdealLow = (currentCtl * 0.8).toFixed(1);
    const atlIdealHigh = (currentCtl * 1.5).toFixed(1);
    const tsbIdealLow = th.fatigue.toFixed(0);
    const tsbIdealHigh = th.fresh.toFixed(0);

    container.innerHTML = `
        <div class="acute-load-summary-card">
            <div class="acute-load-summary-topline">
                <span class="acute-load-kicker">7-day load</span>
                <span class="acute-load-status" style="color:${currentStatus.color};border-color:${currentStatus.color}33;background:${currentStatus.color}12;">${currentStatus.label}</span>
            </div>
            <div class="acute-load-summary-metrics">
                <div>
                    <strong>${currentLoad.toFixed(1)}</strong>
                    <span>7d TSS</span>
                </div>
                <div>
                    <strong>${currentBand.lower.toFixed(1)} – ${currentBand.upper.toFixed(1)}</strong>
                    <span>Ideal range (${acuteLoadBandMode === 'aggressive' ? 'aggr.' : 'cons.'})</span>
                </div>
                <div>
                    <strong>${gapText}</strong>
                    <span>Gap</span>
                </div>
                <div>
                    <strong>${totalLoad}</strong>
                    <span>Period TSS</span>
                </div>
                <div>
                    <strong style="color:${weekTrendColor}">${weekTrend}</strong>
                    <span>Week ?</span>
                </div>
            </div>
            <p style="margin-bottom:.3rem;">${describeAcuteLoadStatus(currentLoad, currentBand, profile, currentStatus)}</p>
        </div>
        <div class="pmc-explainer-card pmc-explainer-ctl">
            <div class="pmc-explainer-header">
                <span class="pmc-dot"></span>
                <strong>CTL</strong> <small style="opacity:.65;">Fitness · ~42d</small>
                <span class="pmc-explainer-value" style="color:${ctlStatus.color};">${currentCtl.toFixed(1)} · ${ctlStatus.label}</span>
            </div>
            <small>${describeCtl(currentCtl, context)} <span style="opacity:.6;">Ideal: ${ctlIdealLow}–${ctlIdealHigh} (your recent range).</span></small>
        </div>
        <div class="pmc-explainer-card pmc-explainer-atl">
            <div class="pmc-explainer-header">
                <span class="pmc-dot"></span>
                <strong>ATL</strong> <small style="opacity:.65;">Fatigue · ~7d</small>
                <span class="pmc-explainer-value" style="color:${atlStatus.color};">${currentAtl.toFixed(1)} · ${atlStatus.label}</span>
            </div>
            <small>${describeAtl(currentAtl, currentCtl, context)} <span style="opacity:.6;">Productive range: ${atlIdealLow}–${atlIdealHigh} (0.8–1.5× CTL).</span></small>
        </div>
        <div class="pmc-explainer-card pmc-explainer-tsb">
            <div class="pmc-explainer-header">
                <span class="pmc-dot"></span>
                <strong>TSB</strong> <small style="opacity:.65;">Form · CTL−ATL</small>
                <span class="pmc-explainer-value" style="color:${tsbStatus.color};">${currentTsb.toFixed(1)} · ${tsbStatus.label}</span>
            </div>
            <small>${describeTsb(currentTsb, context)} <span style="opacity:.6;">Productive zone: ${tsbIdealLow} to ${tsbIdealHigh} for ${profile.label}.</span></small>
        </div>
        <div class="pmc-explainer-card pmc-explainer-risk">
            <div class="pmc-explainer-header">
                <span class="pmc-dot"></span>
                <strong>Injury Risk</strong>
                <span class="pmc-explainer-value">${currentRisk.toFixed(3)}</span>
            </div>
            <small>${describeInjuryRisk(currentRisk, context)} <span style="opacity:.6;">Ideal &lt; 0.25.</span></small>
        </div>
    `;
}

export function renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo) {
    dashboardRenderContext = { allActivities, dateFilterFrom, dateFilterTo };
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

    container.innerHTML = RANGE_OPTIONS.map(r => `
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
    dashboardRenderContext = { allActivities, dateFilterFrom, dateFilterTo };
    const filteredActivities = utils.filterActivitiesByDate(allActivities, dateFilterFrom, dateFilterTo);
    const runs = filteredActivities
        .filter(a => a.type && a.type.includes('Run'))
        .sort((a, b) => new Date(a.start_date_local || 0) - new Date(b.start_date_local || 0));

    const { startDate, endDate } = getEffectiveDashboardWindow(dateFilterFrom, dateFilterTo);
    const windowMs = Math.max(24 * 3600 * 1000, endDate.getTime() - startDate.getTime());
    const previousStartDate = new Date(startDate.getTime() - windowMs);
    const previousEndDate = new Date(startDate.getTime() - 1);

    const recentRuns = runs.filter(r => {
        const d = new Date(r.start_date_local);
        return d >= startDate && d <= endDate;
    });

    const previousRuns = runs.filter(r => {
        const d = new Date(r.start_date_local);
        return d >= previousStartDate && d <= previousEndDate;
    });

    const recentActivities = filteredActivities.filter(activity => {
        const d = new Date(activity.start_date_local);
        return d >= startDate && d <= endDate;
    });

    const previousActivities = filteredActivities.filter(activity => {
        const d = new Date(activity.start_date_local);
        return d >= previousStartDate && d <= previousEndDate;
    });

    renderDashboardTopline(filteredActivities, recentActivities, recentRuns, startDate, dateFilterFrom, dateFilterTo);

    renderAcuteLoadChart(recentActivities, startDate, endDate);
    renderDashboardSummary(recentActivities, previousActivities, recentRuns, previousRuns);
    renderTSSBarChart(recentActivities, selectedRangeDays);
    renderGoalsSectionAdvanced(allActivities);
    renderHoursBySportChart(allActivities);
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



function renderDashboardSummary(currentActivities, previousActivities, currentRuns, previousRuns) {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;
    if (!currentActivities.length) {
        container.innerHTML = "<p>Not enough data.</p>";
        return;
    }

    const safeDistanceKm = activity => (activity.distance || 0) / 1000;
    const safeHours = activity => (activity.moving_time || 0) / 3600;
    const sum = (arr, fn) => arr.reduce((acc, item) => acc + fn(item), 0);
    const avg = values => values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
    const numeric = values => values.filter(value => Number.isFinite(value));

    const calcChange = (current, previous) => {
        if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
        return ((current - previous) / previous) * 100;
    };

    const trendVisual = (metric, change) => {
        if (!Number.isFinite(change)) {
            return { icon: '•', color: '#888', label: 'N/A' };
        }

        const lowerIsBetter = ['pace', 'hr', 'injury'].includes(metric);
        const improved = lowerIsBetter ? change < 0 : change > 0;
        const icon = change === 0 ? '•' : (improved ? '▲' : '▼');
        const color = change === 0 ? '#888' : (improved ? '#2ECC40' : '#FF4136');
        return { icon, color, label: `${change > 0 ? '+' : ''}${change.toFixed(1)}%` };
    };

    const totalDistance = sum(currentActivities, safeDistanceKm);
    const totalTime = sum(currentActivities, safeHours);
    const totalElevation = sum(currentActivities, activity => activity.total_elevation_gain || 0);

    const prevDistance = sum(previousActivities, safeDistanceKm);
    const prevTime = sum(previousActivities, safeHours);
    const prevElevation = sum(previousActivities, activity => activity.total_elevation_gain || 0);

    const currentAvgHR = avg(numeric(currentActivities.map(activity => activity.average_heartrate)));
    const previousAvgHR = avg(numeric(previousActivities.map(activity => activity.average_heartrate)));

    const currentAvgVO2 = avg(numeric(currentActivities.map(activity => activity.vo2max)));
    const previousAvgVO2 = avg(numeric(previousActivities.map(activity => activity.vo2max)));

    const currentInjury = avg(numeric(currentActivities.map(activity => activity.injuryRisk)));
    const previousInjury = avg(numeric(previousActivities.map(activity => activity.injuryRisk)));

    const currentPaceValues = numeric(currentRuns.map(run => {
        const distanceKm = safeDistanceKm(run);
        return distanceKm > 0 && run.moving_time ? (run.moving_time / 60) / distanceKm : NaN;
    }));
    const previousPaceValues = numeric(previousRuns.map(run => {
        const distanceKm = safeDistanceKm(run);
        return distanceKm > 0 && run.moving_time ? (run.moving_time / 60) / distanceKm : NaN;
    }));
    const avgPace = avg(currentPaceValues);
    const prevPace = avg(previousPaceValues);

    const avgDistance = currentRuns.length ? sum(currentRuns, safeDistanceKm) / currentRuns.length : null;
    const prevAvgDistance = previousRuns.length ? sum(previousRuns, safeDistanceKm) / previousRuns.length : null;

    const distChange = calcChange(totalDistance, prevDistance);
    const timeChange = calcChange(totalTime, prevTime);
    const elevChange = calcChange(totalElevation, prevElevation);
    const paceChange = calcChange(avgPace, prevPace);
    const hrChange = calcChange(currentAvgHR, previousAvgHR);
    const vo2Change = calcChange(currentAvgVO2, previousAvgVO2);
    const avgDistChange = calcChange(avgDistance, prevAvgDistance);
    const injuryRiskChange = calcChange(currentInjury, previousInjury);

    const distTrend = trendVisual('distance', distChange);
    const timeTrend = trendVisual('time', timeChange);
    const elevTrend = trendVisual('elevation', elevChange);
    const vo2Trend = trendVisual('vo2', vo2Change);
    const injuryTrend = trendVisual('injury', injuryRiskChange);
    const paceTrend = trendVisual('pace', paceChange);
    const hrTrend = trendVisual('hr', hrChange);
    const avgDistTrend = trendVisual('distance', avgDistChange);


    // --- Renderizado ---
    container.innerHTML = `
        <div class="card">
            <h3>📏 Total Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${totalDistance.toFixed(1)} km</p>
            <small><span style="color:${distTrend.color};">${distTrend.icon} ${distTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>🕒 Total Time</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${totalTime.toFixed(1)} h</p>
            <small><span style="color:${timeTrend.color};">${timeTrend.icon} ${timeTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>⛰️ Elevation</h3>
            <p style="font-size:2rem;font-weight:bold;color:#2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small><span style="color:${elevTrend.color};">${elevTrend.icon} ${elevTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>🫁 VO₂max</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${Number.isFinite(currentAvgVO2) ? currentAvgVO2.toFixed(1) : '–'}</p>
            <small><span style="color:${vo2Trend.color};">${vo2Trend.icon} ${vo2Trend.label}</span></small>
        </div>

        <div class="card">
            <h3>⚠️ Injury Risk</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${Number.isFinite(currentInjury) ? currentInjury.toFixed(3) : '–'}</p>
            <small><span style="color:${injuryTrend.color};">${injuryTrend.icon} ${injuryTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>⚡ Average Pace</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;"> ${Number.isFinite(avgPace) ? utils.paceDecimalToTime(avgPace) : '–'} </p>
            <small><span style="color:${paceTrend.color};">${paceTrend.icon} ${paceTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>❤️ Average HR</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${Number.isFinite(currentAvgHR) ? currentAvgHR.toFixed(0) : '–'} bpm</p>
            <small><span style="color:${hrTrend.color};">${hrTrend.icon} ${hrTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>🏃 Average Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${Number.isFinite(avgDistance) ? avgDistance.toFixed(1) : '–'} km</p>
            <small><span style="color:${avgDistTrend.color};">${avgDistTrend.icon} ${avgDistTrend.label}</span></small>
        </div>
        
    `;


}

/**
 * Renders Training Load Metrics (CTL, ATL, TSB, Injury Risk, Load)
 * Uses preprocessed activities with .tss, .atl, .ctl, .tsb, .injuryRisk
 */
// Helper
function getTrendColor(pct) {
    if (pct > 15) return '#e74c3c';
    if (pct > 5) return '#f39c12';
    if (pct < -10) return '#e74c3c';
    if (pct < -5) return '#f39c12';
    return '#27ae60';
}


function renderAcuteLoadChart(activities, rangeStart, rangeEnd) {
    const canvas = document.getElementById('acute-load-chart');
    const explainer = document.getElementById('acute-load-explainer');
    if (!canvas) return;

    renderAcuteLoadModeSwitch();

    const ctx = canvas.getContext('2d');
    if (dashboardCharts['acute-load-chart']) {
        dashboardCharts['acute-load-chart'].destroy();
    }

    const series = buildRollingSevenDayLoad(activities, rangeStart, rangeEnd);
    if (!series || !series.sorted.length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('No load data to display', canvas.width / 2, canvas.height / 2);
        if (explainer) explainer.innerHTML = '';
        return;
    }

    const profile = getPmcProfile(series.sorted);
    const labels = series.labels.map(label => {
        const date = new Date(`${label}T00:00:00`);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const load7d = series.load7d;
    const ctl7dBase = series.ctlDaily.map(value => +(value * 7).toFixed(1));
    const idealBand = series.ctlDaily.map(value => getAcuteLoadBand(profile, value, acuteLoadBandMode));
    const bandLower = idealBand.map(band => band.lower);
    const bandUpper = idealBand.map(band => band.upper);
    const tsbData = series.tsbDaily;
    const lastBand = idealBand[idealBand.length - 1];
    const lastLoad = load7d[load7d.length - 1] || 0;
    const lastCtl = series.ctlDaily[series.ctlDaily.length - 1] || 0;
    const lastAtl = series.atlDaily[series.atlDaily.length - 1] || 0;
    const lastTsb = series.tsbDaily[series.tsbDaily.length - 1] || 0;
    const lastRisk = series.riskDaily[series.riskDaily.length - 1] || 0;
    const lastStatus = getAcuteLoadStatus(lastLoad, lastBand);
    const maxY = Math.max(...bandUpper, ...load7d, ...ctl7dBase, 10);
    const minTsb = Math.min(...tsbData, -10);
    const maxTsb = Math.max(...tsbData, 10);
    const tsbPadding = Math.max(6, Math.ceil((maxTsb - minTsb) * 0.12));

    renderAcuteLoadExplanation(series.sorted, profile, lastBand, lastStatus, lastLoad, lastCtl, lastAtl, lastTsb, lastRisk);

    dashboardCharts['acute-load-chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Ideal range floor',
                    data: bandLower,
                    borderColor: 'rgba(97, 181, 102, 0)',
                    backgroundColor: 'rgba(97, 181, 102, 0)',
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    borderWidth: 0,
                    fill: false,
                    tension: 0.28,
                    yAxisID: 'y'
                },
                {
                    label: 'Ideal acute load range',
                    data: bandUpper,
                    borderColor: 'rgba(49, 163, 84, 0.45)',
                    backgroundColor: 'rgba(76, 175, 80, 0.18)',
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    borderWidth: 1.5,
                    fill: '-1',
                    tension: 0.28,
                    yAxisID: 'y'
                },
                {
                    label: 'Base load (CTL × 7)',
                    data: ctl7dBase,
                    borderColor: 'rgba(0, 116, 217, 0.7)',
                    backgroundColor: 'rgba(0, 116, 217, 0)',
                    pointRadius: 0,
                    borderWidth: 1.75,
                    borderDash: [6, 4],
                    tension: 0.28,
                    fill: false,
                    yAxisID: 'y',
                    hidden: true
                },
                {
                    label: 'Rolling 7-day load',
                    data: load7d,
                    borderColor: '#fc5200',
                    backgroundColor: 'rgba(252, 82, 0, 0.12)',
                    pointRadius: 0,
                    borderWidth: 3,
                    tension: 0.28,
                    fill: false,
                    yAxisID: 'y'
                },
                {
                    label: 'TSB (Form)',
                    data: tsbData,
                    borderColor: '#2ECC40',
                    backgroundColor: 'rgba(46, 204, 64, 0.08)',
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y1',
                    hidden: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 10,
                        padding: 16,
                        filter(item) {
                            return item.text !== 'Ideal range floor';
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label(context) {
                            if (context.dataset.label === 'Ideal range floor') {
                                return null;
                            }

                            if (context.dataset.label === 'Ideal acute load range') {
                                const lower = bandLower[context.dataIndex];
                                const upper = bandUpper[context.dataIndex];
                                return `Ideal range: ${lower.toFixed(1)} – ${upper.toFixed(1)}`;
                            }

                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Date' },
                    ticks: { maxTicksLimit: 10 },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: Math.ceil(maxY * 1.12),
                    title: { display: true, text: 'Load (7-day TSS)' },
                    grid: { color: 'rgba(0, 0, 0, 0.06)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'TSB (Form)' },
                    grid: {
                        drawOnChartArea: true,
                        color(context) {
                            return context.tick.value === 0 ? 'rgba(46, 204, 64, 0.28)' : 'rgba(0,0,0,0)';
                        }
                    },
                    min: Math.floor(minTsb - tsbPadding),
                    max: Math.ceil(maxTsb + tsbPadding)
                }
            }
        }
    });
}






/**
 * Renderiza una gr→fica de barras: TSS por per→odo
 */
function renderTSSBarChart(activities, rangeType) {
    const canvas = document.getElementById('tss-bar-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (window.tssBarChart) window.tssBarChart.destroy();

    // Calcular las fechas de inicio y fin del per→odo seleccionado
    const now = new Date();
    let startDate;
    let endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    switch (rangeType) {
        case 'week': {
            const today = new Date();
            const day = today.getDay(); // 0 = domingo, 1 = lunes...
            const diffToMonday = day === 0 ? -6 : 1 - day; // si es domingo, retrocede 6
            startDate = new Date(today);
            startDate.setDate(today.getDate() + diffToMonday);
            startDate.setHours(0, 0, 0, 0);

            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6); // lunes + 6 = domingo
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'month': {
            const today = new Date();
            startDate = new Date(today.getFullYear(), today.getMonth(), 1); // 1 del mes actual
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); // →ltimo del mes actual
            endDate.setHours(23, 59, 59, 999);
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
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = s→bado
    const diff = day === 0 ? -6 : 1 - day; // Si es domingo, ir al lunes anterior (retroceder 6)
    d.setDate(d.getDate() + diff);
    return d;
}

/**
 * Obtiene el n→mero de semana del a→o (ISO 8601)
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
 * Agrupa TSS por per→odo (d→a, semana o mes) incluyendo per→odos sin datos
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

    // Seguridad: l→mite m→ximo de iteraciones (por si hay error de rango)
    let guard = 0;

    // Crear todos los per→odos del rango (incluso sin datos)
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

    // A→adir datos reales de actividades (solo si hay actividades)
    if (activities && activities.length > 0) {
        for (const a of activities) {
            if (!a.start_date_local) continue;
            const date = new Date(a.start_date_local);
            if (isNaN(date)) continue;

            // Solo procesar si est→ dentro del rango
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
            return `Week ${getWeekNumber(d)}`;
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




// ==============================================
// CUSTOMIZABLE RUNNING GOALS TRACKER
// ==============================================

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();

function loadGoals() {
    const saved = JSON.parse(localStorage.getItem('training_goals') || 'null');
    return saved || { km: { annual: 1000, monthly: 100 }, hours: { annual: 150, monthly: 15 }, activities: { annual: 200, monthly: 20 }, selectedMetric: 'km' };
}

function saveGoals(goals) {
    localStorage.setItem('training_goals', JSON.stringify(goals));
}

const metricConfig = {
    km: {
        label: 'Distance (km)',
        unit: 'km',
        extract: (a) => (a.distance || 0) / 1000,
    },
    hours: {
        label: 'Time (hours)',
        unit: 'h',
        extract: (a) => (a.moving_time || 0) / 3600,
    },
    activities: {
        label: 'Activities',
        unit: '',
        extract: () => 1,
    },
};

// ==============================================
// MAIN RENDER FUNCTION
// ==============================================

export function renderGoalsSectionAdvanced(allActivities) {
    const container = document.getElementById('dashboard-tab');
    if (!container) return;

    const goals = loadGoals();
    const metric = goals.selectedMetric || 'km';
    const cfg = metricConfig[metric];
    const annualGoal = goals[metric]?.annual || 1000;
    const monthlyGoal = goals[metric]?.monthly || 100;

    if (!document.getElementById('goals-section')) {
        const goalsDiv = document.createElement('div');
        goalsDiv.id = 'goals-section';
        goalsDiv.style = 'margin-top:2rem;';
        container.appendChild(goalsDiv);
    }

    const div = document.getElementById('goals-section');
    div.innerHTML = `
    <!-- METRIC SELECTOR TABS -->
    <div id="goal-metric-tabs" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
        <button class="goal-metric-btn ${metric === 'km' ? 'active' : ''}" data-metric="km" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${metric === 'km' ? '#007bff' : '#fff'};color:${metric === 'km' ? '#fff' : '#333'};">Distance (km)</button>
        <button class="goal-metric-btn ${metric === 'hours' ? 'active' : ''}" data-metric="hours" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${metric === 'hours' ? '#007bff' : '#fff'};color:${metric === 'hours' ? '#fff' : '#333'};">Time (hours)</button>
        <button class="goal-metric-btn ${metric === 'activities' ? 'active' : ''}" data-metric="activities" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${metric === 'activities' ? '#007bff' : '#fff'};color:${metric === 'activities' ? '#fff' : '#333'};">Activities</button>
    </div>

    <div style="display:flex;gap:2rem;flex-wrap:wrap;">
        <!-- YEARLY GOAL -->
        <div style="flex:1;min-width:300px;background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h4 style="margin:0;">Annual Goal</h4>
                <div>
                    <input type="number" id="annual-goal" value="${annualGoal}" min="1"
                           style="width:100px;padding:0.5rem;border:1px solid #ddd;border-radius:4px;">
                    <span style="margin-left:0.5rem;">${cfg.unit}</span>
                    <button id="update-annual-btn" style="margin-left:1rem;padding:0.5rem 1rem;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">
                        Update
                    </button>
                </div>
            </div>
            <div id="annual-stats" style="margin-bottom:1rem;padding:0.8rem;background:#f8f9fa;border-radius:4px;"></div>
            <canvas id="annual-goal-chart" style="max-height:300px;width:100%;"></canvas>
        </div>

        <!-- MONTHLY GOAL -->
        <div style="flex:1;min-width:300px;background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h4 style="margin:0;">Monthly Goal - ${getMonthName(currentMonth)}</h4>
                <div>
                    <input type="number" id="monthly-goal" value="${monthlyGoal}" min="1"
                           style="width:100px;padding:0.5rem;border:1px solid #ddd;border-radius:4px;">
                    <span style="margin-left:0.5rem;">${cfg.unit}</span>
                    <button id="update-monthly-btn" style="margin-left:1rem;padding:0.5rem 1rem;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">
                        Update
                    </button>
                </div>
            </div>
            <div id="monthly-stats" style="margin-bottom:1rem;padding:0.8rem;background:#f8f9fa;border-radius:4px;"></div>
            <canvas id="monthly-goal-chart" style="max-height:300px;width:100%;"></canvas>
        </div>
    </div>
`;

    // Metric tab listeners
    div.querySelectorAll('.goal-metric-btn').forEach(btn => {
        btn.onclick = () => {
            const g = loadGoals();
            g.selectedMetric = btn.dataset.metric;
            saveGoals(g);
            renderGoalsSectionAdvanced(allActivities);
        };
    });

    // Event listeners
    document.getElementById('update-annual-btn').onclick = () => {
        const g = loadGoals();
        const m = g.selectedMetric || 'km';
        g[m] = g[m] || {};
        g[m].annual = parseFloat(document.getElementById('annual-goal').value);
        saveGoals(g);
        renderGoalCharts(allActivities, g);
    };

    document.getElementById('update-monthly-btn').onclick = () => {
        const g = loadGoals();
        const m = g.selectedMetric || 'km';
        g[m] = g[m] || {};
        g[m].monthly = parseFloat(document.getElementById('monthly-goal').value);
        saveGoals(g);
        renderGoalCharts(allActivities, g);
    };

    renderGoalCharts(allActivities, goals);
}

function renderGoalCharts(allActivities, goals) {
    const metric = goals.selectedMetric || 'km';
    const cfg = metricConfig[metric];
    const annualGoal = goals[metric]?.annual || 1000;
    const monthlyGoal = goals[metric]?.monthly || 100;

    renderAnnualChart(allActivities, cfg, annualGoal);
    renderMonthlyChart(allActivities, cfg, monthlyGoal);
}

// ==============================================
// ANNUAL CHART
// ==============================================

function renderAnnualChart(allActivities, cfg, annualGoal) {
    const runActivities = allActivities.filter(a => a.type && a.type.includes('Run'));

    const labels = [];
    const actualData = [];
    const plannedData = [];
    let cumulative = 0;

    for (let m = 0; m < 12; m++) {
        labels.push(getMonthName(m));

        const monthStart = new Date(currentYear, m, 1);
        const monthEnd = new Date(currentYear, m + 1, 0, 23, 59, 59);

        const monthActivities = runActivities.filter(a => {
            const d = new Date(a.start_date_local);
            return d >= monthStart && d <= monthEnd;
        });

        const monthVal = monthActivities.reduce((sum, a) => sum + cfg.extract(a), 0);
        cumulative += monthVal;
        actualData.push(parseFloat(cumulative.toFixed(2)));
        plannedData.push(parseFloat((annualGoal / 12 * (m + 1)).toFixed(2)));
    }

    const currentTotal = actualData[actualData.length - 1] || 0;
    const percentage = ((currentTotal / annualGoal) * 100).toFixed(1);
    const remaining = Math.max(0, annualGoal - currentTotal).toFixed(1);

    document.getElementById('annual-stats').innerHTML = `
        <strong>Progress:</strong> ${currentTotal.toFixed(1)} / ${annualGoal} ${cfg.unit} (${percentage}%)
        | <strong>Remaining:</strong> ${remaining} ${cfg.unit}
    `;

    const config = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Goal',
                    data: plannedData,
                    borderColor: '#28a745',
                    borderDash: [8, 4],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 3
                },
                {
                    label: 'Actual',
                    data: actualData,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#007bff'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} ${cfg.unit}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: `Cumulative ${cfg.label}` }
                }
            }
        }
    };

    createDashboardChart('annual-goal-chart', config);
}

// ==============================================
// MONTHLY CHART
// ==============================================

function renderMonthlyChart(allActivities, cfg, monthlyGoal) {
    const runActivities = allActivities.filter(a => a.type && a.type.includes('Run'));

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const labels = [];
    const actualData = [];
    const plannedData = [];
    let cumulative = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        labels.push(d);

        const dayStart = new Date(currentYear, currentMonth, d, 0, 0, 0);
        const dayEnd = new Date(currentYear, currentMonth, d, 23, 59, 59);

        const dayActivities = runActivities.filter(a => {
            const dt = new Date(a.start_date_local);
            return dt >= dayStart && dt <= dayEnd;
        });

        const dayVal = dayActivities.reduce((sum, a) => sum + cfg.extract(a), 0);
        cumulative += dayVal;
        actualData.push(parseFloat(cumulative.toFixed(2)));
        plannedData.push(parseFloat((monthlyGoal / daysInMonth * d).toFixed(2)));
    }

    const currentTotal = actualData[actualData.length - 1] || 0;
    const percentage = ((currentTotal / monthlyGoal) * 100).toFixed(1);
    const remaining = Math.max(0, monthlyGoal - currentTotal).toFixed(1);

    document.getElementById('monthly-stats').innerHTML = `
        <strong>Progress:</strong> ${currentTotal.toFixed(1)} / ${monthlyGoal} ${cfg.unit} (${percentage}%)
        | <strong>Remaining:</strong> ${remaining} ${cfg.unit}
    `;

    const config = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Goal',
                    data: plannedData,
                    borderColor: '#28a745',
                    borderDash: [8, 4],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: 'Actual',
                    data: actualData,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#007bff'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} ${cfg.unit}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: `Cumulative ${cfg.label}` }
                },
                x: {
                    title: { display: true, text: 'Day of Month' }
                }
            }
        }
    };

    createDashboardChart('monthly-goal-chart', config);
}

// ==============================================
// HELPER FUNCTION
// ==============================================

function getMonthName(monthIndex) {
    return new Date(2000, monthIndex, 1).toLocaleString('default', { month: 'short' });
}
