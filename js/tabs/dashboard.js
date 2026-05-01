import * as utils from './utils.js';

let selectedRangeDays = 'last30'; // rango inicial
let tssUnit = 'tss'; // unit for TSS chart: 'tss', 'activities', or 'hours'
let acuteLoadBandMode = 'aggressive'; // always aggressive, no user selection
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

function renderDashboardTopline(recentActivities) {
    const container = document.getElementById('dashboard-topline');
    if (!container) return;

    const totalDistanceKm = recentActivities.reduce((sum, a) => sum + ((a.distance || 0) / 1000), 0);
    const totalMovingTime = recentActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
    const longestActivity = recentActivities.reduce((max, activity) => {
        const distanceKm = (activity.distance || 0) / 1000;
        return distanceKm > max.distanceKm
            ? { distanceKm, type: getSportKey(activity.type || ''), rawType: activity.type || 'Activity' }
            : max;
    }, { distanceKm: 0, type: 'Other', rawType: 'Activity' });

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
            <p class="dashboard-mini-label">Longest Session</p>
            <p class="dashboard-mini-value">${longestActivity.distanceKm.toFixed(1)} km</p>
            <p class="dashboard-mini-subvalue">${longestActivity.type}</p>
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
    // Mode is always aggressive, no user selection needed
    return;
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

function getPercentileValue(values, percentile) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * percentile)));
    return sorted[idx];
}

function formatSigned(value, digits = 1) {
    if (!Number.isFinite(value)) return 'N/A';
    if (value > 0) return `+${value.toFixed(digits)}`;
    if (value < 0) return `-${Math.abs(value).toFixed(digits)}`;
    return (0).toFixed(digits);
}

function isValueInBand(value, band) {
    const minOk = band.min == null ? true : value >= band.min;
    const maxOk = band.max == null ? true : value < band.max;
    return minOk && maxOk;
}

function renderBandRows(bands, currentValue, formatRange) {
    return bands.map(band => {
        const active = isValueInBand(currentValue, band);
        return `
            <div style="display:flex;align-items:flex-start;gap:.6rem;padding:.5rem .55rem;border-radius:8px;background:${active ? `${band.color}18` : '#fff'};border:1px solid ${active ? `${band.color}66` : '#e6e6e6'};margin-bottom:.4rem;">
                <span style="width:10px;height:10px;border-radius:50%;background:${band.color};margin-top:.35rem;flex:0 0 auto;"></span>
                <div style="display:flex;flex-direction:column;gap:.12rem;min-width:0;">
                    <div style="display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;">
                        <strong>${band.label}</strong>
                        <small style="opacity:.7;">${formatRange(band)}</small>
                        ${band.isIdeal ? '<small style="padding:.05rem .35rem;border-radius:999px;background:#1f9d5518;color:#1f9d55;border:1px solid #1f9d5540;">Ideal</small>' : ''}
                        ${active ? '<small style="padding:.05rem .35rem;border-radius:999px;background:#0074d918;color:#0074D9;border:1px solid #0074D940;">Current</small>' : ''}
                    </div>
                    <small style="opacity:.86;line-height:1.35;">${band.meaning}</small>
                </div>
            </div>
        `;
    }).join('');
}

function buildCtlBands(ctlValues) {
    const p25 = getPercentileValue(ctlValues, 0.25);
    const p45 = getPercentileValue(ctlValues, 0.45);
    const p70 = getPercentileValue(ctlValues, 0.70);
    const p90 = getPercentileValue(ctlValues, 0.90);

    return [
        {
            label: 'Rebuilding',
            min: null,
            max: p25,
            color: '#f39c12',
            isIdeal: false,
            meaning: 'Low chronic load for your own history. Typical during reset blocks, low consistency, or return-to-training phases.'
        },
        {
            label: 'Maintaining',
            min: p25,
            max: p45,
            color: '#6c757d',
            isIdeal: false,
            meaning: 'Stable but modest long-term load. Good for maintenance, but usually not enough to push fitness up quickly.'
        },
        {
            label: 'Productive',
            min: p45,
            max: p70,
            color: '#27ae60',
            isIdeal: true,
            meaning: 'Sustainable fitness-building territory with manageable fatigue for most training cycles.'
        },
        {
            label: 'High fitness',
            min: p70,
            max: p90,
            color: '#1f9d55',
            isIdeal: true,
            meaning: 'Strong chronic conditioning. Usually effective for race-specific phases if recovery habits stay consistent.'
        },
        {
            label: 'Peak fitness',
            min: p90,
            max: null,
            color: '#0074D9',
            isIdeal: false,
            meaning: 'Top end of your recent CTL distribution. Powerful but harder to sustain for long.'
        }
    ];
}

function buildAtlBands(currentCtl) {
    return [
        {
            label: 'Recovery',
            min: null,
            max: -6,
            color: '#0074D9',
            isIdeal: false,
            meaning: 'ATL well below CTL. Usually indicates tapering, deloading, or reduced short-term stress.'
        },
        {
            label: 'Productive',
            min: -6,
            max: 4,
            color: '#27ae60',
            isIdeal: true,
            meaning: 'Acute load close to base load. Good balance between stimulus and recoverability.'
        },
        {
            label: 'Build',
            min: 4,
            max: 12,
            color: '#f39c12',
            isIdeal: true,
            meaning: 'Short-term load above baseline. Useful for progression blocks when sleep and easy days are protected.'
        },
        {
            label: 'Overload',
            min: 12,
            max: 22,
            color: '#FF851B',
            isIdeal: false,
            meaning: 'High acute stress. Effective only in controlled blocks; fatigue and injury exposure increase.'
        },
        {
            label: 'Strained',
            min: 22,
            max: null,
            color: '#e74c3c',
            isIdeal: false,
            meaning: 'Very high acute load versus base. Keep this short and intentional, with recovery planned.'
        }
    ].map(band => ({
        ...band,
        absoluteMin: band.min == null ? null : currentCtl + band.min,
        absoluteMax: band.max == null ? null : currentCtl + band.max
    }));
}

function buildTsbBands(profile) {
    const t = profile.thresholds;
    return [
        {
            label: 'Strained',
            min: null,
            max: t.deepFatigue,
            color: '#e74c3c',
            isIdeal: false,
            meaning: 'Deep fatigue state. Useful only briefly in heavy blocks, then followed by recovery.'
        },
        {
            label: 'Heavy load',
            min: t.deepFatigue,
            max: t.fatigue,
            color: '#FF851B',
            isIdeal: false,
            meaning: 'Substantial fatigue. Strong training stress, but low freshness for quality performance.'
        },
        {
            label: 'Productive',
            min: t.fatigue,
            max: t.balanced,
            color: '#27ae60',
            isIdeal: true,
            meaning: 'Balanced training zone where adaptation often improves without excessive residual fatigue.'
        },
        {
            label: 'Race-ready',
            min: t.balanced,
            max: t.fresh,
            color: '#0074D9',
            isIdeal: true,
            meaning: 'Fresh enough for quality sessions, testing, or racing while keeping some fitness tension.'
        },
        {
            label: 'Recovery',
            min: t.fresh,
            max: t.fresh + 8,
            color: '#6c757d',
            isIdeal: false,
            meaning: 'Very fresh state. Good for regeneration, but prolonged time here can reduce training momentum.'
        },
        {
            label: 'Underload',
            min: t.fresh + 8,
            max: null,
            color: '#8e44ad',
            isIdeal: false,
            meaning: 'Too fresh for too long. Usually signals insufficient load to drive continued fitness gains.'
        }
    ];
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
    const ctlMax = Math.max(...ctlValues);
    const ctlIdealLow = (ctlMax * 0.6).toFixed(1);
    const ctlIdealHigh = ctlMax.toFixed(1);
    const atlIdealLow = (currentCtl * 0.8).toFixed(1);
    const atlIdealHigh = (currentCtl * 1.5).toFixed(1);
    const tsbIdealLow = th.fatigue.toFixed(0);
    const tsbIdealHigh = th.fresh.toFixed(0);
    const ctlBands = buildCtlBands(ctlValues);
    const atlBands = buildAtlBands(currentCtl);
    const tsbBands = buildTsbBands(profile);
    const atlDelta = currentAtl - currentCtl;

    const ctlBandsHtml = renderBandRows(ctlBands, currentCtl, band => {
        if (band.min == null) return `< ${band.max.toFixed(1)}`;
        if (band.max == null) return `>= ${band.min.toFixed(1)}`;
        return `${band.min.toFixed(1)} to ${band.max.toFixed(1)}`;
    });

    const atlBandsHtml = renderBandRows(atlBands, atlDelta, band => {
        const rel = band.min == null
            ? `< ${formatSigned(band.max, 1)} vs CTL`
            : band.max == null
                ? `>= ${formatSigned(band.min, 1)} vs CTL`
                : `${formatSigned(band.min, 1)} to ${formatSigned(band.max, 1)} vs CTL`;

        const abs = band.absoluteMin == null
            ? `< ${band.absoluteMax.toFixed(1)} ATL`
            : band.absoluteMax == null
                ? `>= ${band.absoluteMin.toFixed(1)} ATL`
                : `${band.absoluteMin.toFixed(1)} to ${band.absoluteMax.toFixed(1)} ATL`;

        return `${rel} (${abs})`;
    });

    const tsbBandsHtml = renderBandRows(tsbBands, currentTsb, band => {
        if (band.min == null) return `< ${band.max.toFixed(1)}`;
        if (band.max == null) return `>= ${band.min.toFixed(1)}`;
        return `${band.min.toFixed(1)} to ${band.max.toFixed(1)}`;
    });

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
            <small><strong>CTL (Chronic Training Load / fitness)</strong> is the 42-day exponentially weighted average of your daily TSS. Higher values mean stronger long-term fitness capacity.</small>
            <small style="margin-top:.2rem;display:block;">${describeCtl(currentCtl, context)} <span style="opacity:.6;">Ideal: ${ctlIdealLow}–${ctlIdealHigh} (your recent range).</span></small>
            <details style="margin-top:.55rem;">
                <summary style="cursor:pointer;font-weight:600;color:#2f3b52;">Show CTL ranges</summary>
                <div style="margin-top:.55rem;">
                    ${ctlBandsHtml}
                </div>
            </details>
        </div>
        <div class="pmc-explainer-card pmc-explainer-atl">
            <div class="pmc-explainer-header">
                <span class="pmc-dot"></span>
                <strong>ATL</strong> <small style="opacity:.65;">Fatigue · ~7d</small>
                <span class="pmc-explainer-value" style="color:${atlStatus.color};">${currentAtl.toFixed(1)} · ${atlStatus.label}</span>
            </div>
            <small><strong>ATL (Acute Training Load / fatigue)</strong> is the 7-day exponentially weighted average of daily TSS. It rises quickly with hard training and drops quickly with recovery.</small>
            <small style="margin-top:.2rem;display:block;">${describeAtl(currentAtl, currentCtl, context)} <span style="opacity:.6;">Productive range: ${atlIdealLow}–${atlIdealHigh} (0.8–1.5× CTL).</span></small>
            <small style="margin-top:.2rem;display:block;opacity:.72;">Current ATL−CTL: ${formatSigned(atlDelta, 1)}</small>
            <details style="margin-top:.55rem;">
                <summary style="cursor:pointer;font-weight:600;color:#2f3b52;">Show ATL ranges</summary>
                <div style="margin-top:.55rem;">
                    ${atlBandsHtml}
                </div>
            </details>
        </div>
        <div class="pmc-explainer-card pmc-explainer-tsb">
            <div class="pmc-explainer-header">
                <span class="pmc-dot"></span>
                <strong>TSB</strong> <small style="opacity:.65;">Form · CTL−ATL</small>
                <span class="pmc-explainer-value" style="color:${tsbStatus.color};">${currentTsb.toFixed(1)} · ${tsbStatus.label}</span>
            </div>
            <small><strong>TSB (Training Stress Balance / form)</strong> is CTL − ATL. Positive values usually mean freshness, while negative values mean fatigue from load accumulation.</small>
            <small style="margin-top:.2rem;display:block;">${describeTsb(currentTsb, context)} <span style="opacity:.6;">Productive zone: ${tsbIdealLow} to ${tsbIdealHigh} for ${profile.label}.</span></small>
            <details style="margin-top:.55rem;">
                <summary style="cursor:pointer;font-weight:600;color:#2f3b52;">Show TSB ranges</summary>
                <div style="margin-top:.55rem;">
                    ${tsbBandsHtml}
                </div>
            </details>
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

/**
 * Setup event listeners for TSS unit selector (only once)
 */
function setupTSSUnitSelector() {
    const selector = document.querySelector('.tss-unit-selector');
    if (!selector || selector.dataset.listenerReady) return;
    selector.dataset.listenerReady = '1';

    const radios = selector.querySelectorAll('input[name="tss-unit"]');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            tssUnit = e.target.value;
            renderTSSBarChart(dashboardRenderContext.allActivities, selectedRangeDays);
        });
    });
}

/**
 * Setup chart click handlers for fullscreen modal
 */
function setupChartClickHandlers() {
    const chartContainers = document.querySelectorAll('.chart-container');
    chartContainers.forEach(container => {
        const canvas = container.querySelector('canvas');
        const title = container.querySelector('h3');
        if (canvas && !canvas.dataset.modalReady) {
            canvas.dataset.modalReady = '1';
            canvas.style.cursor = 'pointer';
            canvas.addEventListener('click', () => {
                openChartModal(canvas, title ? title.textContent : 'Chart');
            });
        }
    });

    // Add modal close listeners (only once)
    const modal = document.getElementById('chart-modal');
    if (modal && !modal.dataset.listenersReady) {
        modal.dataset.listenersReady = '1';

        // Close when clicking outside the content
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeChartModal();
            }
        });

        // Close button
        const closeBtn = modal.querySelector('.chart-modal-close');
        if (closeBtn) {
            closeBtn.onclick = closeChartModal;
        }

        // Keyboard escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeChartModal();
            }
        });
    }
}

/**
 * Open chart in fullscreen modal
 */
function openChartModal(canvas, title) {
    const modal = document.getElementById('chart-modal');
    const container = document.getElementById('chart-modal-canvas-container');
    if (!modal || !container) return;

    // Convert canvas to image for display in modal
    const imageUrl = canvas.toDataURL('image/png');
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem;width:100%;height:100%;">
            <h2 style="margin:0;">${title}</h2>
            <img src="${imageUrl}" style="width:100%;height:auto;max-height:calc(95vh - 60px);object-fit:contain;" />
        </div>
    `;

    modal.classList.add('active');
}

/**
 * Close chart modal
 */
function closeChartModal() {
    const modal = document.getElementById('chart-modal');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('chart-modal-canvas-container').innerHTML = '';
    }
}

export function renderDashboardTab(allActivities, dateFilterFrom, dateFilterTo) {
    dashboardRenderContext = { allActivities, dateFilterFrom, dateFilterTo };
    const container = document.getElementById('dashboard-tab');
    if (container && !document.getElementById('range-selector')) {
        const rangeDiv = document.createElement('div');
        rangeDiv.id = 'range-selector';
        rangeDiv.style = 'display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap;';
        container.prepend(rangeDiv);
    }

    renderRangeSelector();
    renderDashboardContent(allActivities, dateFilterFrom, dateFilterTo);
}

function renderRangeSelector() {
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
            // Update active class immediately for snappy feedback
            container.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Defer heavy render to next frame
            requestAnimationFrame(() => {
                const ctx = dashboardRenderContext;
                renderDashboardContent(ctx.allActivities, ctx.dateFilterFrom, ctx.dateFilterTo);
            });
        };
    });
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

    renderDashboardTopline(recentActivities);
    renderDashboardSummary(recentActivities, previousActivities, recentRuns, previousRuns);

    // Render heavy charts in next frame to avoid blocking UI
    requestAnimationFrame(() => {
        renderAcuteLoadChart(recentActivities, startDate, endDate);
        renderTSSBarChart(recentActivities, selectedRangeDays);
        setupTSSUnitSelector();
        renderGoalsSectionAdvanced(allActivities);
        setupChartClickHandlers();
    });
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

        // For metrics where less is better (HR, injury), invert the colors
        const lowerIsBetter = ['hr', 'injury'].includes(metric);
        const improved = lowerIsBetter ? change < 0 : change > 0;
        const icon = change === 0 ? '•' : (improved ? '▲' : '▼');
        const color = change === 0 ? '#888' : (improved ? '#27ae60' : '#e74c3c');
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

    const currentInjury = avg(numeric(currentActivities.map(activity => activity.injuryRisk)));
    const previousInjury = avg(numeric(previousActivities.map(activity => activity.injuryRisk)));

    const currentTotalTss = sum(currentActivities, activity => activity.tss ?? (activity.suffer_score ? activity.suffer_score * 1.05 : 0));
    const previousTotalTss = sum(previousActivities, activity => activity.tss ?? (activity.suffer_score ? activity.suffer_score * 1.05 : 0));

    const distChange = calcChange(totalDistance, prevDistance);
    const timeChange = calcChange(totalTime, prevTime);
    const elevChange = calcChange(totalElevation, prevElevation);
    const hrChange = calcChange(currentAvgHR, previousAvgHR);
    const injuryRiskChange = calcChange(currentInjury, previousInjury);
    const tssChange = calcChange(currentTotalTss, previousTotalTss);

    const distTrend = trendVisual('distance', distChange);
    const timeTrend = trendVisual('time', timeChange);
    const elevTrend = trendVisual('elevation', elevChange);
    const injuryTrend = trendVisual('injury', injuryRiskChange);
    const hrTrend = trendVisual('hr', hrChange);
    const tssTrend = trendVisual('load', tssChange);


    // --- Renderizado ---
    container.innerHTML = `
        <div class="card">
            <h3>Total Distance</h3>
            <p style="font-size:2rem;font-weight:bold;color:#0074D9;">${totalDistance.toFixed(1)} km</p>
            <small><span style="color:${distTrend.color};">${distTrend.icon} ${distTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>Total Moving Time</h3>
            <p style="font-size:2rem;font-weight:bold;color:#B10DC9;">${totalTime.toFixed(1)} h</p>
            <small><span style="color:${timeTrend.color};">${timeTrend.icon} ${timeTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>Total Elevation Gain</h3>
            <p style="font-size:2rem;font-weight:bold;color:#2ECC40;">${totalElevation.toFixed(0)} m</p>
            <small><span style="color:${elevTrend.color};">${elevTrend.icon} ${elevTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>Injury Risk Index</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${Number.isFinite(currentInjury) ? currentInjury.toFixed(3) : '–'}</p>
            <small><span style="color:${injuryTrend.color};">${injuryTrend.icon} ${injuryTrend.label}</span></small>
        </div>

        <div class="card">
            <h3>Average Heart Rate</h3>
            <p style="font-size:2rem;font-weight:bold;color:#FF4136;">${Number.isFinite(currentAvgHR) ? currentAvgHR.toFixed(0) : '–'} bpm</p>
            <small><span style="color:${hrTrend.color};">${hrTrend.icon} ${hrTrend.label}</span></small>
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
            startDate.setDate(now.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        case 'last30': {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 29);
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
            startDate.setDate(now.getDate() - 364);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        default: {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
        }
    }

    const { labels, datasets, yAxisTitle } = getTSSBarChartData(activities, rangeType, startDate, endDate, tssUnit);

    if (!labels.length || !datasets.length) {
        console.warn('No data to render');
        return;
    }

    window.tssBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { mode: 'index', intersect: false },
                legend: { display: true, position: 'top' }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: yAxisTitle },
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/**
 * Helper function to get TSS/Activities/Hours data grouped by period
 */
function getTSSBarChartData(activities, rangeType, startDate, endDate, unit) {
    const isDaily = rangeType === 'week' || rangeType === 'last7' || rangeType === 'month' || rangeType === 'last30';
    const isWeekly = rangeType === 'last3m' || rangeType === 'last6m';
    const isMonthly = rangeType === 'year' || rangeType === 'last365';

    const sports = ['Run', 'Ride', 'Swim', 'Gym'];
    const sportColors = {
        Run: '#ff7f50',
        Ride: '#20b2aa',
        Swim: '#1e90ff',
        Gym: '#9370db',
        Other: '#95a5a6'
    };

    let grouped = {};
    const minDate = new Date(startDate);
    const maxDate = new Date(endDate);
    let curr = new Date(minDate);

    // Crear todos los periodos del rango (incluso sin datos)
    let guard = 0;
    while (curr <= maxDate && guard++ < 2000) {
        let key;
        if (isDaily) {
            key = getPeriodKey(curr, 'daily');
            curr.setDate(curr.getDate() + 1);
        } else if (isWeekly) {
            key = getPeriodKey(curr, 'weekly');
            curr.setDate(curr.getDate() + 7);
        } else if (isMonthly) {
            key = getPeriodKey(curr, 'monthly');
            curr.setMonth(curr.getMonth() + 1);
        } else {
            key = getPeriodKey(curr, 'daily');
            curr.setDate(curr.getDate() + 1);
        }
        grouped[key] = {
            total: 0,
            Run: 0,
            Ride: 0,
            Swim: 0,
            Gym: 0,
            Other: 0
        };
    }

    // Agregar datos reales de actividades
    if (activities && activities.length > 0) {
        for (const a of activities) {
            if (!a.start_date_local) continue;
            const date = new Date(a.start_date_local);
            if (isNaN(date)) continue;

            if (!isDateWithinRange(date, minDate, maxDate)) continue;

            let key;
            if (isDaily) {
                key = getPeriodKey(date, 'daily');
            } else if (isWeekly) {
                key = getPeriodKey(date, 'weekly');
            } else if (isMonthly) {
                key = getPeriodKey(date, 'monthly');
            } else {
                key = getPeriodKey(date, 'daily');
            }

            if (grouped.hasOwnProperty(key)) {
                const sport = getSportKey(a.type || '');

                let value = 0;
                if (unit === 'tss') {
                    value = a.tss ?? (a.suffer_score ? a.suffer_score * 1.05 : 0);
                } else if (unit === 'activities') {
                    value = 1;
                } else if (unit === 'hours') {
                    value = (a.moving_time || 0) / 3600; // Convert seconds to hours
                }

                grouped[key].total += value;
                grouped[key][sport] = (grouped[key][sport] || 0) + value;
            }
        }
    }

    const sortedKeys = Object.keys(grouped).sort((a, b) => {
        if (isMonthly) {
            const [ya, ma] = a.split('-').map(Number);
            const [yb, mb] = b.split('-').map(Number);
            return new Date(ya, ma - 1, 1) - new Date(yb, mb - 1, 1);
        }
        return parseLocalYMD(a) - parseLocalYMD(b);
    });

    const labels = sortedKeys.map(key => {
        if (isDaily) {
            const d = parseLocalYMD(key);
            return d.toLocaleDateString('default', { day: '2-digit', month: 'short' });
        }
        if (isWeekly) {
            const d = parseLocalYMD(key);
            return `Week ${getWeekNumber(d)}`;
        }
        if (isMonthly) {
            const [y, m] = key.split('-');
            return `${new Date(y, m - 1).toLocaleString('default', { month: 'short' })} ${y.slice(2)}`;
        }
        return key;
    });

    let formatFn = v => Math.round(v);
    if (unit === 'hours') {
        formatFn = v => v.toFixed(1);
    }

    const datasets = sports
        .map(sport => ({
            label: sport,
            data: sortedKeys.map(k => formatFn(grouped[k][sport] || 0)),
            backgroundColor: sportColors[sport],
            borderColor: '#fff',
            borderWidth: 1,
            borderRadius: 3
        }))
        .filter(dataset => dataset.data.some(value => value > 0));

    let yAxisTitle = 'TSS';
    if (unit === 'activities') {
        yAxisTitle = 'Activities';
    } else if (unit === 'hours') {
        yAxisTitle = 'Hours';
    }

    return { labels, datasets, yAxisTitle };
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

function parseLocalYMD(ymd) {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodKey(date, mode) {
    if (mode === 'daily') return toLocalYMD(date);
    if (mode === 'weekly') return toLocalYMD(getMondayOfWeek(date));
    return getMonthKey(date);
}

function isDateWithinRange(date, minDate, maxDate) {
    const value = date.getTime();
    return value >= minDate.getTime() && value <= maxDate.getTime();
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


// ==============================================
// CUSTOMIZABLE RUNNING GOALS TRACKER
// ==============================================

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();

const GOAL_SPORTS = [
    { label: 'All', value: 'all' },
    { label: '🏃 Run', value: 'Run' },
    { label: '🚴 Ride', value: 'Ride' },
    { label: '🏊 Swim', value: 'Swim' },
    { label: '💪 Gym', value: 'Workout' },
];

function filterActivitiesBySport(activities, sport) {
    if (!sport || sport === 'all') return activities;
    if (sport === 'Workout') return activities.filter(a => a.type && (a.type.includes('WeightTraining') || a.type.includes('Workout')));
    return activities.filter(a => a.type && a.type.includes(sport));
}

function loadGoals() {
    const saved = JSON.parse(localStorage.getItem('training_goals') || 'null');
    return saved || { km: { annual: 1000, monthly: 100 }, hours: { annual: 150, monthly: 15 }, activities: { annual: 200, monthly: 20 }, selectedMetric: 'km', selectedSport: 'all' };
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
    const sport = goals.selectedSport || 'all';
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
    <div id="goal-metric-tabs" style="display:flex;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap;">
        <button class="goal-metric-btn ${metric === 'km' ? 'active' : ''}" data-metric="km" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${metric === 'km' ? '#007bff' : '#fff'};color:${metric === 'km' ? '#fff' : '#333'};">Distance (km)</button>
        <button class="goal-metric-btn ${metric === 'hours' ? 'active' : ''}" data-metric="hours" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${metric === 'hours' ? '#007bff' : '#fff'};color:${metric === 'hours' ? '#fff' : '#333'};">Time (hours)</button>
        <button class="goal-metric-btn ${metric === 'activities' ? 'active' : ''}" data-metric="activities" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${metric === 'activities' ? '#007bff' : '#fff'};color:${metric === 'activities' ? '#fff' : '#333'};">Activities</button>
    </div>
    <!-- SPORT SELECTOR -->
    <div id="goal-sport-tabs" style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;">
        ${GOAL_SPORTS.map(s => `<button class="goal-sport-btn ${sport === s.value ? 'active' : ''}" data-sport="${s.value}" style="padding:0.4rem 0.9rem;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:${sport === s.value ? '#fc5200' : '#fff'};color:${sport === s.value ? '#fff' : '#333'};font-size:0.9em;">${s.label}</button>`).join('')}
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

    // Sport tab listeners
    div.querySelectorAll('.goal-sport-btn').forEach(btn => {
        btn.onclick = () => {
            const g = loadGoals();
            g.selectedSport = btn.dataset.sport;
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
    const sport = goals.selectedSport || 'all';
    const cfg = metricConfig[metric];
    const annualGoal = goals[metric]?.annual || 1000;
    const monthlyGoal = goals[metric]?.monthly || 100;
    const filteredActivities = filterActivitiesBySport(allActivities, sport);

    renderAnnualChart(filteredActivities, cfg, annualGoal, sport);
    renderMonthlyChart(filteredActivities, cfg, monthlyGoal, sport);
}

// ==============================================
// ANNUAL CHART
// ==============================================

function renderAnnualChart(allActivities, cfg, annualGoal, sport) {
    const sportLabel = GOAL_SPORTS.find(s => s.value === (sport || 'all'))?.label || 'All';

    const labels = [];
    const actualData = [];
    const plannedData = [];
    let cumulative = 0;

    for (let m = 0; m < 12; m++) {
        labels.push(getMonthName(m));

        const monthStart = new Date(currentYear, m, 1);
        const monthEnd = new Date(currentYear, m + 1, 0, 23, 59, 59);

        const monthActivities = allActivities.filter(a => {
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
        <strong>Sport:</strong> ${sportLabel}
        | <strong>Progress:</strong> ${currentTotal.toFixed(1)} / ${annualGoal} ${cfg.unit} (${percentage}%)
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

function renderMonthlyChart(allActivities, cfg, monthlyGoal, sport) {
    const sportLabel = GOAL_SPORTS.find(s => s.value === (sport || 'all'))?.label || 'All';

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const labels = [];
    const actualData = [];
    const plannedData = [];
    let cumulative = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        labels.push(d);

        const dayStart = new Date(currentYear, currentMonth, d, 0, 0, 0);
        const dayEnd = new Date(currentYear, currentMonth, d, 23, 59, 59);

        const dayActivities = allActivities.filter(a => {
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
        <strong>Sport:</strong> ${sportLabel}
        | <strong>Progress:</strong> ${currentTotal.toFixed(1)} / ${monthlyGoal} ${cfg.unit} (${percentage}%)
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
