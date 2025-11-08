// js/preprocessing.js
import * as utils from './utils.js';

// ===================================================================
// CONFIGURACIÓN GLOBAL (debería venir de un perfil de usuario)
// ===================================================================
const DEFAULTS = {
    MAX_HR: 190,
    LTHR: 160,
    REST_HR: 50,
    FTP: 250,
    RUN_THRESHOLD_PACE: 300, // segundos/km (5:00 min/km)
    SWIM_THRESHOLD_SPEED: 1.5, // m/s (CSS)
    SUFFER_SCORE_TO_TSS_FACTOR: 1.05
};

// ===================================================================
// UTILIDADES INTERNAS
// ===================================================================
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const isValid = (val) => val != null && !isNaN(val) && val > 0;

// ===================================================================
// CÁLCULO DE TSS POR TIPO (TrainingPeaks Standard)
// ===================================================================

/**
 * TSS basado en potencia (más preciso)
 */
function calculatePowerTSS(activity, ftp) {
    if (!isValid(activity.average_watts) || !isValid(ftp)) return null;
    if (!isValid(activity.moving_time)) return null;

    const hours = activity.moving_time / 3600;
    const IF = activity.average_watts / ftp;
    const tss = hours * 100 * IF * IF;
    return { value: +tss.toFixed(2), method: 'TSS (power)' };
}

/**
 * rTSS basado en ritmo de carrera (NGP aproximado con average_pace)
 */
function calculateRunningTSS(activity, thresholdPaceSecKm) {
    if (activity.type !== 'Run' || !isValid(activity.distance) || !isValid(activity.moving_time)) {
        return null;
    }

    const km = activity.distance / 1000;
    const avgPaceSecKm = (activity.moving_time / 60) / km;
    if (!isValid(thresholdPaceSecKm) || !isValid(avgPaceSecKm)) return null;

    const hours = activity.moving_time / 3600;
    const IF = thresholdPaceSecKm / avgPaceSecKm; // más rápido = IF > 1
    const tss = hours * 100 * IF * IF;
    return { value: +tss.toFixed(2), method: 'rTSS (pace)' };
}

/**
 * sTSS para natación (basado en distancia y CSS)
 */
function calculateSwimTSS(activity, cssMs) {
    if (activity.type !== 'Swim' || !isValid(activity.distance) || !isValid(activity.moving_time)) {
        return null;
    }
    if (!isValid(cssMs)) return null;

    const hours = activity.moving_time / 3600;
    const speedMs = activity.distance / activity.moving_time;
    const IF = speedMs / cssMs;
    const tss = hours * 100 * IF * IF;
    return { value: +tss.toFixed(2), method: 'sTSS (swim)' };
}

/**
 * hrTSS: basado en zonas de HR (LTHR)
 */
function calculateHrTSS(activity, lthr) {
    if (!isValid(activity.average_heartrate) || !isValid(lthr) || !isValid(activity.moving_time)) {
        return null;
    }

    const hours = activity.moving_time / 3600;
    const IF = activity.average_heartrate / lthr;
    const tss = hours * 100 * IF * IF;
    return { value: +tss.toFixed(2), method: 'hrTSS' };
}

/**
 * tTSS: TRIMPS (más fisiológico)
 */
function calculateTrimpTSS(activity, maxHr, restHr, lthr) {
    if (!isValid(activity.average_heartrate) || !isValid(activity.moving_time)) return null;
    if (!isValid(maxHr) || !isValid(restHr) || !isValid(lthr)) return null;

    const hours = activity.moving_time / 3600;
    const hrReserve = maxHr - restHr;
    const hrRatio = (activity.average_heartrate - restHr) / hrReserve;
    const y = 0.64 + 0.64 * Math.exp(1.92 * hrRatio);
    const trimp = hours * 60 * hrRatio * y; // Banister TRIMP
    return { value: +trimp.toFixed(2), method: 'tTSS (TRIMP)' };
}

/**
 * TSS desde suffer_score (Strava)
 */
function calculateSufferTSS(activity, factor = DEFAULTS.SUFFER_SCORE_TO_TSS_FACTOR) {
    if (!isValid(activity.suffer_score)) return null;
    return { value: +(activity.suffer_score * factor).toFixed(2), method: 'TSS (suffer_score)' };
}

/**
 * Fallback: tiempo solo (36 TSS/hora)
 */
function calculateTimeTSS(activity) {
    if (!isValid(activity.moving_time)) return null;
    const hours = activity.moving_time / 3600;
    return { value: +(hours * 36).toFixed(2), method: 'TSS* (time)' };
}

// ===================================================================
// TSS PRINCIPAL: Jerarquía de TrainingPeaks
// ===================================================================
function calculateTSS(activity, profile) {
    const {
        ftp = DEFAULTS.FTP,
        run_threshold_pace = DEFAULTS.RUN_THRESHOLD_PACE,
        swim_css = DEFAULTS.SWIM_THRESHOLD_SPEED,
        lthr = DEFAULTS.LTHR,
        max_hr = DEFAULTS.MAX_HR,
        rest_hr = DEFAULTS.REST_HR
    } = profile || {};

    const candidates = [];

    // 1. TSS (potencia) - más preciso
    const power = calculatePowerTSS(activity, ftp);
    if (power) candidates.push(power);

    // 2. rTSS (carrera)
    if (activity.type === 'Run') {
        const rtss = calculateRunningTSS(activity, run_threshold_pace);
        if (rtss) candidates.push(rtss);
    }

    // 3. sTSS (natación)
    if (activity.type === 'Swim') {
        const stss = calculateSwimTSS(activity, swim_css);
        if (stss) candidates.push(stss);
    }

    // 4. hrTSS
    const hr = calculateHrTSS(activity, lthr);
    if (hr) candidates.push(hr);

    // 5. tTSS (TRIMP)
    const trimp = calculateTrimpTSS(activity, max_hr, rest_hr, lthr);
    if (trimp) candidates.push(trimp);

    // 6. suffer_score
    const suffer = calculateSufferTSS(activity);
    if (suffer) candidates.push(suffer);

    // 7. Tiempo (fallback)
    const time = calculateTimeTSS(activity);
    if (time) candidates.push(time);

    // Seleccionar el más alto en jerarquía
    const selected = candidates[0] || { value: 0, method: 'none' };
    activity.tss = selected.value;
    activity.tss_method = selected.method;
    return selected.value;
}

// ===================================================================
// VO₂max ESTIMADO (solo running, con ecuación ACSM)
// ===================================================================
function computeVo2max(activities, profile) {
    const maxHr = profile?.max_hr || DEFAULTS.MAX_HR;
    let count = 0;

    activities.forEach(a => {
        if (a.type !== 'Run' || !isValid(a.distance) || !isValid(a.moving_time) || a.moving_time < 600) {
            a.vo2max = null;
            return;
        }

        const speedMperMin = (a.distance / a.moving_time) * 60;
        const vo2 = -4.60 + 0.182258 * speedMperMin + 0.000104 * speedMperMin ** 2;
        const hrFraction = a.average_heartrate ? a.average_heartrate / maxHr : 0.8;
        const vo2max = vo2 / hrFraction;

        a.vo2max = (vo2max > 25 && vo2max < 90) ? +vo2max.toFixed(2) : null;
        if (a.vo2max) count++;
    });

    console.log(`[preprocessing] VO₂max calculado para ${count} runs.`);
}

// ===================================================================
// AGRUPACIÓN POR DÍA
// ===================================================================
function groupByDayWithTSS(activities, profile) {
    const grouped = {};

    for (const a of activities) {
        if (!a.start_date_local) continue;
        const date = a.start_date_local.split('T')[0];
        if (!grouped[date]) {
            grouped[date] = { tss: 0, count: 0, distance: 0, moving_time: 0, activities: [] };
        }

        calculateTSS(a, profile);
        grouped[date].tss += a.tss;
        grouped[date].count++;
        grouped[date].distance += a.distance || 0;
        grouped[date].moving_time += a.moving_time || 0;
        grouped[date].activities.push(a);
    }

    return grouped;
}

// ===================================================================
// SERIES TEMPORALES
// ===================================================================
function extractTimeSeries(grouped) {
    const dates = Object.keys(grouped).sort();
    const dailyTSS = dates.map(d => grouped[d].tss || 0);
    return { dates, dailyTSS };
}

// ===================================================================
// FITNESS: ATL, CTL, TSB, Ramp Rate, Injury Risk
// ===================================================================
function calculateFitness(dailyTSS) {
    const atl = utils.rollingMean(dailyTSS, 7);
    const ctl = utils.rollingMean(dailyTSS, 42);
    const tsb = dailyTSS.map((_, i) => +(atl[i] - (ctl[i] || 0)).toFixed(2));

    // Ramp Rate (CTL change)
    const rampRate = ctl.map((c, i) => i === 0 ? 0 : +(c - ctl[i - 1]).toFixed(2));

    // Injury Risk (0.0 - 1.0)
    const injuryRisk = dailyTSS.map((_, i) => {
        let risk = 0;
        if (tsb[i] < -25) risk += 0.6;
        else if (tsb[i] < -15) risk += 0.4;
        else if (tsb[i] < -5) risk += 0.2;
        else if (tsb[i] < 0) risk += 0.1;

        if (rampRate[i] > 7) risk += 0.4;
        else if (rampRate[i] > 5) risk += 0.3;
        else if (rampRate[i] > 3) risk += 0.2;

        return +clamp(risk, 0, 1).toFixed(2);
    });

    return { atl, ctl, tsb, rampRate, injuryRisk };
}

// ===================================================================
// ASIGNAR FITNESS A ACTIVIDADES
// ===================================================================
function assignFitnessToActivities(activities, dates, fitness) {
    const dateIndex = Object.fromEntries(dates.map((d, i) => [d, i]));
    let matched = 0;

    activities.forEach(a => {
        if (!a.start_date_local) return;
        const date = a.start_date_local.split('T')[0];
        const i = dateIndex[date];
        if (i !== undefined) {
            a.atl = +fitness.atl[i].toFixed(2);
            a.ctl = +fitness.ctl[i].toFixed(2);
            a.tsb = +fitness.tsb[i].toFixed(2);
            a.rampRate = +fitness.rampRate[i].toFixed(2);
            a.injuryRisk = +fitness.injuryRisk[i].toFixed(2);
            matched++;
        } else {
            a.atl = a.ctl = a.tsb = a.rampRate = a.injuryRisk = null;
        }
    });

    console.log(`[preprocessing] Fitness asignado a ${matched}/${activities.length} actividades.`);
}

// ===================================================================
// PIPELINE PRINCIPAL
// ===================================================================
export function preprocessActivities(activities, userProfile = {}) {
    if (!activities || activities.length === 0) {
        console.warn("[preprocessing] No hay actividades.");
        return [];
    }

    const profile = { ...DEFAULTS, ...userProfile };

    // 1. VO₂max
    computeVo2max(activities, profile);

    // 2. TSS + agrupar
    const grouped = groupByDayWithTSS(activities, profile);
    const { dates, dailyTSS } = extractTimeSeries(grouped);

    // 3. Fitness
    const fitness = calculateFitness(dailyTSS);

    // 4. Asignar
    assignFitnessToActivities(activities, dates, fitness);

    // 5. Log Top 30
    logTopActivities(activities);

    return activities;
}

// ===================================================================
// LOGGING
// ===================================================================
function logTopActivities(activities) {
    try {
        const top30 = activities
            .filter(a => isValid(a.tss))
            .sort((a, b) => b.tss - a.tss)
            .slice(0, 30);

        console.log(`\n[preprocessing] Top ${top30.length} actividades por TSS:`);
        console.table(top30.map((a, i) => ({
            rank: i + 1,
            date: a.start_date_local?.split('T')[0] || '',
            name: a.name || a.type,
            tss: a.tss,
            method: a.tss_method,
            type: a.type,
            atl: a.atl ?? '-',
            ctl: a.ctl ?? '-',
            tsb: a.tsb ?? '-',
            risk: a.injuryRisk ?? '-',
            vo2: a.vo2max ?? '-',
            km: ((a.distance || 0) / 1000).toFixed(2),
            time: `${Math.round((a.moving_time || 0) / 60)}min`
        })));
    } catch (e) {
        console.warn('[preprocessing] Error en log:', e);
    }
}