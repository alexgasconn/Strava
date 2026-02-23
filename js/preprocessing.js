// js/preprocessing.js
import { rollingMean } from './utils.js';

// ===================================================================
// CONFIGURACIÓN
// ===================================================================
const SUFFER_TO_TSS = 1.05;
const MAX_HR_DEFAULT = 200;

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
    const rampRate = [0];

    for (let i = 0; i < tssSeries.length; i++) {
        const a = atl[i];
        const c = ctl[i];
        tsb.push(+(a - c).toFixed(1));

        if (i > 0) {
            rampRate.push(+(c - ctl[i - 1]).toFixed(1));
        }
    }

    return { atl, ctl, tsb, rampRate, tssSeries };
}

// ===================================================================
// 6. INJURY RISK: PRECISO, CONTINUO Y REALISTA
// ===================================================================
function calculateInjuryRisk(tsb, rampRate, atl, tssSeries) {
    const riskHistory = [];

    return tsb.map((t, i) => {
        let risk = 0;

        // 1. TSB (fatiga crónica)
        if (t < -30) risk += 0.45;
        else if (t < -20) risk += 0.35;
        else if (t < -10) risk += 0.25;
        else if (t < -5) risk += 0.15;
        else if (t < 0) risk += 0.08;
        else if (t > 15) risk += 0.05; // Sobre-descanso

        // 2. Ramp Rate (aumento rápido)
        const r = rampRate[i];
        if (r > 10) risk += 0.35;
        else if (r > 7) risk += 0.25;
        else if (r > 5) risk += 0.15;
        else if (r > 3) risk += 0.08;

        // 3. ATL alto (carga aguda)
        const a = atl[i];
        if (a > 120) risk += 0.20;
        else if (a > 100) risk += 0.12;
        else if (a > 80) risk += 0.06;

        // 4. Variabilidad reciente (CV de últimos 7 días)
        const recent = tssSeries.slice(Math.max(0, i - 6), i + 1);
        if (recent.length > 1) {
            const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
            const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
            const cv = Math.sqrt(variance) / mean;
            if (cv > 0.5) risk += 0.15;
            else if (cv > 0.3) risk += 0.08;
        }

        // Normalizar
        risk = Math.min(risk, 1.0);
        risk = Math.max(risk, 0.0);

        // Suavizado exponencial (70% anterior, 30% actual)
        if (i > 0) {
            const prev = riskHistory[i - 1];
            risk = prev * 0.7 + risk * 0.3;
        }
        riskHistory.push(risk);

        return +risk.toFixed(3); // 0.123 → 12.3%
    });
}

// ===================================================================
// 6. INJURY RISK MEJORADO
// ===================================================================
function calculateInjuryRiskImproved(tsb, rampRate, atl, tssSeries) {
    const riskHistory = [];
    const len = tsb.length;

    // Helper: percentil relativo al historial
    const percentile = (arr, val) => {
        if (!arr.length) return 0.5;
        const sorted = [...arr].sort((a, b) => a - b);
        let count = 0;
        for (const x of sorted) if (x <= val) count++;
        return count / arr.length;
    }

    for (let i = 0; i < len; i++) {
        // --- 1. TSB relativo (fatiga) ---
        const tsbWindow = tsb.slice(Math.max(0, i - 42), i + 1);
        const tsbPerc = 1 - percentile(tsbWindow, tsb[i]); // más negativo → más riesgo
        let risk = 0.6 * Math.pow(tsbPerc, 1.5); // efecto no lineal

        // --- 2. Ramp Rate relativo ---
        const rrWindow = rampRate.slice(Math.max(0, i - 14), i + 1);
        const rrPerc = percentile(rrWindow, rampRate[i]);
        risk += 0.25 * Math.pow(rrPerc, 1.3) * tsbPerc; // interacción: ramp fuerte + fatiga

        // --- 3. ATL relativo (carga aguda) ---
        const atlWindow = atl.slice(Math.max(0, i - 7), i + 1);
        const atlPerc = percentile(atlWindow, atl[i]);
        risk += 0.15 * Math.pow(atlPerc, 1.2);

        // --- 4. Variabilidad reciente ---
        const recent = tssSeries.slice(Math.max(0, i - 6), i + 1);
        if (recent.length > 1) {
            const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
            const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
            const cv = Math.sqrt(variance) / mean;
            risk *= 1 + Math.min(cv, 1) * 0.3; // hasta +30% si CV alto
        }

        // --- Normalizar a [0,1] ---
        risk = Math.min(Math.max(risk, 0), 1);

        // --- Suavizado EWMA adaptativo ---
        if (i > 0) {
            const prev = riskHistory[i - 1];
            const alpha = 0.2 + 0.5 * Math.min(1, Math.abs(risk - prev));
            risk = prev * (1 - alpha) + risk * alpha;
        }

        riskHistory.push(+risk.toFixed(3));
    }

    return riskHistory;
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
            a.injuryRisk = +injuryRisk[i].toFixed(3); // 3 decimales para precisión
        } else {
            a.atl = a.ctl = a.tsb = a.injuryRisk = null;
        }
    });
}

// ===================================================================
// 8. Pipeline principal
// ===================================================================
export function preprocessActivities(activities, userProfile = {}) {
    console.log("Preprocessing: Starting with", activities.length, "activities");
    if (!activities?.length) {
        console.warn("Preprocessing: No hay actividades.");
        return [];
    }

    const maxHr = userProfile.max_hr || MAX_HR_DEFAULT;
    console.log("Preprocessing: Using max HR:", maxHr);

    const daily = groupByDay(activities);
    console.log("Preprocessing: Grouped by day, days:", Object.keys(daily).length);
    const { dates, tssValues } = getTimeSeries(daily);
    console.log("Preprocessing: Time series created, dates:", dates.length);
    const pmc = calculatePMC(tssValues);
    console.log("Preprocessing: PMC calculated, ATL:", pmc.atl[pmc.atl.length - 1], "CTL:", pmc.ctl[pmc.ctl.length - 1], "TSB:", pmc.tsb[pmc.tsb.length - 1]);
    const injuryRisk = calculateInjuryRiskImproved(pmc.tsb, pmc.rampRate, pmc.atl, pmc.tssSeries);
    console.log("Preprocessing: Injury risk calculated");

    assignMetrics(activities, dates, pmc, injuryRisk);
    console.log("Preprocessing: Metrics assigned to activities");

    // Log final
    const last = dates.length - 1;
    console.log(`\nPMC (último día: ${dates[last]})`);
    console.log(`  CTL: ${pmc.ctl[last]?.toFixed(1) ?? 'n/a'}`);
    console.log(`  ATL: ${pmc.atl[last]?.toFixed(1) ?? 'n/a'}`);
    console.log(`  TSB: ${pmc.tsb[last]?.toFixed(1) ?? 'n/a'}`);
    console.log(`  Injury Risk: ${(injuryRisk[last] * 100).toFixed(2)}%`);

    console.log("Preprocessing: Completed");
    return activities;
}