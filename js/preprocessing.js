// js/preprocessing.js
import { rollingMean } from './utils.js';

// ===================================================================
// CONFIGURACIÓN
// ===================================================================
const SUFFER_TO_TSS = 1.05;
const MAX_HR_DEFAULT = 190;

// ===================================================================
// 1. TSS: suffer_score → TSS (fallback: 36/hora)
// ===================================================================
function calculateTSS(activity) {
    let tss = 0;
    let method = 'none';

    if (activity.suffer_score != null && activity.suffer_score >= 0) {
        tss = activity.suffer_score * SUFFER_TO_TSS;
        method = 'suffer_score';
    } else {
        const hours = (activity.moving_time || 0) / 3600;
        tss = hours * 36;
        method = 'time';
    }

    activity.tss = +tss.toFixed(2);
    activity.tss_method = method;
    return activity.tss;
}

// ===================================================================
// 2. VO₂max: solo running (ACSM + HR)
// ===================================================================
function computeVO2max(activity, maxHr = MAX_HR_DEFAULT) {
    if (activity.type !== 'Run' || !activity.distance || activity.moving_time < 600) {
        activity.vo2max = null;
        return;
    }

    const speedMperMin = (activity.distance / activity.moving_time) * 60;
    const vo2 = -4.60 + 0.182258 * speedMperMin + 0.000104 * speedMperMin ** 2;
    const hrFraction = activity.average_heartrate ? activity.average_heartrate / maxHr : 0.8;
    const vo2max = vo2 / hrFraction;

    activity.vo2max = (vo2max > 25 && vo2max < 90) ? +vo2max.toFixed(2) : null;
}

// ===================================================================
// 3. Agrupar por día
// ===================================================================
function groupByDay(activities) {
    const daily = {};

    activities.forEach(a => {
        const date = a.start_date_local?.split('T')[0];
        if (!date) return;

        calculateTSS(a);
        computeVO2max(a);

        if (!daily[date]) {
            daily[date] = { tss: 0, count: 0 };
        }
        daily[date].tss += a.tss;
        daily[date].count += 1;
    });

    return daily;
}

// ===================================================================
// 4. Serie temporal
// ===================================================================
function getTimeSeries(daily) {
    const dates = Object.keys(daily).sort();
    const tssValues = dates.map(d => daily[d].tss);
    return { dates, tssValues };
}

// ===================================================================
// 5. PMC: ATL (7d), CTL (42d), TSB, Ramp Rate
// ===================================================================
function calculatePMC(tssSeries) {
    const atl = rollingMean(tssSeries, 7);
    const ctl = rollingMean(tssSeries, 42);
    const tsb = [];
    const rampRate = [0]; // primer día: 0

    for (let i = 0; i < tssSeries.length; i++) {
        const a = atl[i];
        const c = ctl[i];
        tsb.push(+(a - c).toFixed(1));

        if (i > 0) {
            rampRate.push(+(c - ctl[i - 1]).toFixed(1));
        }
    }

    return { atl, ctl, tsb, rampRate };
}

// ===================================================================
// 6. Injury Risk (0.0 – 1.0)
// ===================================================================
function calculateInjuryRisk(tsb, rampRate) {
    return tsb.map((t, i) => {
        let risk = 0;
        if (t < -25) risk += 0.6;
        else if (t < -15) risk += 0.4;
        else if (t < -5) risk += 0.2;
        else if (t < 0) risk += 0.1;

        const r = rampRate[i];
        if (r > 7) risk += 0.4;
        else if (r > 5) risk += 0.3;
        else if (r > 3) risk += 0.2;

        return +(Math.min(risk, 1.0).toFixed(2));
    });
}

// ===================================================================
// 7. Asignar métricas
// ===================================================================
function assignMetrics(activities, dates, pmc, injuryRisk) {
    const map = Object.fromEntries(dates.map((d, i) => [d, i]));

    activities.forEach(a => {
        const date = a.start_date_local?.split('T')[0];
        const i = map[date];
        if (i !== undefined) {
            a.atl = +pmc.atl[i].toFixed(1);
            a.ctl = +pmc.ctl[i].toFixed(1);
            a.tsb = +pmc.tsb[i].toFixed(1);
            a.injuryRisk = +injuryRisk[i].toFixed(2);
        } else {
            a.atl = a.ctl = a.tsb = a.injuryRisk = null;
        }
    });
}

// ===================================================================
// 8. Pipeline principal
// ===================================================================
export function preprocessActivities(activities, userProfile = {}) {
    if (!activities?.length) {
        console.warn("No hay actividades.");
        return [];
    }

    const maxHr = userProfile.max_hr || MAX_HR_DEFAULT;

    const daily = groupByDay(activities);
    const { dates, tssValues } = getTimeSeries(daily);
    const pmc = calculatePMC(tssValues);
    const injuryRisk = calculateInjuryRisk(pmc.tsb, pmc.rampRate);
    assignMetrics(activities, dates, pmc, injuryRisk);

    // Log final
    const last = dates.length - 1;
    console.log(`\nPMC (último día: ${dates[last]})`);
    console.log(`  CTL: ${pmc.ctl[last]?.toFixed(1) ?? 'n/a'}`);
    console.log(`  ATL: ${pmc.atl[last]?.toFixed(1) ?? 'n/a'}`);
    console.log(`  TSB: ${pmc.tsb[last]?.toFixed(1) ?? 'n/a'}`);
    console.log(`  Injury Risk: ${injuryRisk[last]?.toFixed(2) ?? 'n/a'}`);

    return activities;
}