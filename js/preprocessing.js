// js/preprocessing.js

import * as utils from './utils.js';

// --- CONFIGURACIÓN ---
const USER_MAX_HR = 190;
const FTP = 250; // Functional Threshold Power
const SUFFER_SCORE_TO_TSS_FACTOR = 1.05; // Calibrado: 1 TSS ≈ 1.05 suffer_score

/**
 * Calcula TSS usando el mejor dato disponible:
 * 1. suffer_score (siempre)
 * 2. Corregido con HR (casi siempre)
 * 3. Ajustado con potencia (opcional)
 * 4. Fallback: distancia + ritmo
 */
function calculateTSS(activity) {
    const hours = (activity.moving_time || 0) / 3600;
    if (hours === 0) return 0;

    let tss = 0;
    let method = '';

    // 1. Base: suffer_score (siempre disponible)
    if (activity.suffer_score != null && activity.suffer_score >= 0) {
        tss = activity.suffer_score * SUFFER_SCORE_TO_TSS_FACTOR;
        method = 'suffer_score';

        // 2. Corrección con HR (casi siempre)
        if (activity.average_heartrate && USER_MAX_HR > 0) {
            const hrIF = activity.average_heartrate / USER_MAX_HR;
            const hrTSS = hours * 100 * hrIF * hrIF;

            // Si HR sugiere más esfuerzo, confiamos más en él (más conservador)
            if (hrTSS > tss * 1.3) {
                tss = hrTSS;
                method = 'hr (suffer_score bajo)';
            } else if (hrTSS > tss) {
                tss = (tss * 0.7) + (hrTSS * 0.3);
                method = 'suffer_score+hr';
            }
        }

        // 3. Ajuste con potencia (si existe y es coherente)
        if (activity.average_watts && FTP > 0) {
            const powerIF = activity.average_watts / FTP;
            const powerTSS = hours * 100 * powerIF * powerIF;
            const ratio = powerTSS / tss;

            if (ratio > 0.6 && ratio < 1.4) {
                tss = (tss * 0.8) + (powerTSS * 0.2);
                method += '+power';
            }
        }
    } else {
        // Fallback: HR
        if (activity.average_heartrate && USER_MAX_HR > 0) {
            const hrIF = activity.average_heartrate / USER_MAX_HR;
            tss = hours * 100 * hrIF * hrIF;
            method = 'hr';
        } else {
            // Fallback: ritmo
            const km = (activity.distance || 0) / 1000;
            if (km > 0) {
                const paceMinKm = (activity.moving_time / 60) / km;
                const estimatedIF = Math.max(0.6, 6.5 / paceMinKm);
                tss = hours * 100 * estimatedIF * estimatedIF;
                method = 'pace';
            } else {
                tss = hours * 36;
                method = 'time';
            }
        }
    }

    tss = +tss.toFixed(2);
    activity.tss = tss;
    activity.tss_method = method; // opcional: para debug
    return tss;
}

/**
 * Calcula VO₂max estimado (solo running)
 */
function computeVo2max(activities) {
    console.log(`[preprocessing] Calculando VO₂max para ${activities.length} actividades...`);
    let count = 0;
    activities.forEach(a => {
        if (a.type === 'Run' && a.average_heartrate && a.moving_time > 0 && a.distance > 0) {
            const vel_m_min = (a.distance / a.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const vo2max = vo2_at_pace / (a.average_heartrate / USER_MAX_HR);
            a.vo2max = +vo2max.toFixed(2);
            count++;
        } else {
            a.vo2max = null;
        }
    });
    console.log(`[preprocessing] VO₂max calculado para ${count} runs.`);
}

/**
 * Agrupa por día y acumula TSS
 */
function groupByDayWithTSS(activities) {
    console.log(`[preprocessing] Agrupando con TSS...`);
    const grouped = {};

    for (const a of activities) {
        if (!a.start_date_local) continue;
        const date = a.start_date_local.split('T')[0];
        if (!grouped[date]) {
            grouped[date] = { tss: 0, count: 0, distance: 0, moving_time: 0 };
        }

        // Calcular TSS
        const tss = calculateTSS(a);
        grouped[date].tss += tss;
        grouped[date].count++;
        grouped[date].distance += a.distance || 0;
        grouped[date].moving_time += a.moving_time || 0;
    }

    const days = Object.keys(grouped).length;
    console.log(`[preprocessing] TSS agrupado en ${days} días.`);
    return grouped;
}

/**
 * Extrae series temporales
 */
function extractTimeSeries(grouped) {
    const dates = Object.keys(grouped).sort();
    const dailyTSS = dates.map(d => grouped[d].tss);
    console.log(`[preprocessing] Serie: ${dates[0]} → ${dates.at(-1)} (${dates.length} días)`);
    return { dates, dailyTSS };
}

/**
 * Calcula ATL, CTL, TSB e Injury Risk
 */
function calculateFitness(dailyTSS) {
    console.log(`[preprocessing] Calculando ATL (7d), CTL (42d), TSB...`);

    const atl = utils.rollingMean(dailyTSS, 7);
    const ctl = utils.rollingMean(dailyTSS, 42);
    const tsb = atl.map((a, i) => +(a - (ctl[i] || 0)).toFixed(2));

    // Injury Risk: TSB negativo + ramp rate alto
    const ctlChange = ctl.map((c, i) => i === 0 ? 0 : c - ctl[i - 1]);
    const injuryRisk = dailyTSS.map((_, i) => {
        const base = tsb[i] < -25 ? 1.0 : tsb[i] < -15 ? 0.8 : tsb[i] < -5 ? 0.5 : tsb[i] < 0 ? 0.3 : 0.1;
        const ramp = ctlChange[i] > 5 ? 0.4 : ctlChange[i] > 3 ? 0.2 : 0;
        return +Math.min(1.0, base + ramp).toFixed(2);
    });

    return { atl, ctl, tsb, injuryRisk };
}

/**
 * Asigna métricas a cada actividad
 */
function assignFitnessToActivities(activities, dates, fitness) {
    console.log(`[preprocessing] Asignando fitness a ${activities.length} actividades...`);
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
            a.injuryRisk = +fitness.injuryRisk[i].toFixed(2);
            matched++;
        } else {
            a.atl = a.ctl = a.tsb = a.injuryRisk = null;
        }
    });

    console.log(`[preprocessing] Fitness asignado a ${matched}/${activities.length} actividades.`);
}

/**
 * Pipeline principal
 */
export function preprocessActivities(activities) {
    console.log(`[preprocessing] Iniciando pipeline con ${activities?.length || 0} actividades...`);
    const t0 = performance.now();

    if (!activities || activities.length === 0) {
        console.warn("[preprocessing] No hay actividades.");
        return [];
    }

    // 1. VO₂max
    computeVo2max(activities);

    // 2. TSS por actividad + agrupar
    const grouped = groupByDayWithTSS(activities);
    const { dates, dailyTSS } = extractTimeSeries(grouped);

    // 3. Fitness desde TSS
    const fitness = calculateFitness(dailyTSS);

    // 4. Asignar a actividades
    assignFitnessToActivities(activities, dates, fitness);

    const t1 = performance.now();
    console.log(`[preprocessing] Pipeline completado en ${(t1 - t0).toFixed(1)} ms`);

    // Ejemplo final
    const last = activities.at(-1);
    if (last) {
        console.log(`[preprocessing] Última actividad:`, {
            date: last.start_date_local?.split('T')[0],
            type: last.type,
            tss: last.tss,
            atl: last.atl,
            ctl: last.ctl,
            tsb: last.tsb,
            injuryRisk: last.injuryRisk,
            vo2max: last.vo2max
        });
    }

    return activities;
}