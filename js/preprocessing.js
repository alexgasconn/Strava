// js/preprocessing.js

import * as utils from './utils.js';

// --- CONFIGURACIÓN ---
const USER_MAX_HR = 190;
const HR_WEIGHT = 1.0;
const POWER_WEIGHT = 0.6;

/**
 * Calcula VO₂max estimado por actividad (solo running)
 */
function computeVo2max(activities) {
    console.log(`[preprocessing] 🧠 Calculando VO₂max para ${activities.length} actividades...`);
    let count = 0;
    activities.forEach(r => {
        if (r.type === 'Run' && r.average_heartrate && r.moving_time > 0 && r.distance > 0) {
            const vel_m_min = (r.distance / r.moving_time) * 60;
            const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
            const vo2max = vo2_at_pace / (r.average_heartrate / USER_MAX_HR);
            r.vo2max = +vo2max.toFixed(2);
            count++;
        } else {
            r.vo2max = null;
        }
    });
    console.log(`[preprocessing] ✅ VO₂max calculado para ${count} actividades de running.`);
}

/**
 * Agrupa actividades por día (YYYY-MM-DD)
 */
export function groupByDay(activities) {
    console.log(`[preprocessing] 📅 Agrupando ${activities.length} actividades por día...`);
    const grouped = {};
    for (const a of activities) {
        if (!a.start_date_local) continue;
        const date = a.start_date_local.split('T')[0];
        if (!grouped[date]) grouped[date] = { distance: 0, moving_time: 0, effort: 0, count: 0 };

        const hrEffort = a.average_heartrate
            ? (a.average_heartrate / USER_MAX_HR) * (a.moving_time / 60) * HR_WEIGHT
            : 0;

        const powerEffort = a.average_watts
            ? (a.average_watts / 250) * (a.moving_time / 60) * POWER_WEIGHT
            : 0;

        const km = (a.distance || 0) / 1000;
        const timeHrs = (a.moving_time || 0) / 3600;

        const fallbackEffort =
            hrEffort > 0
                ? hrEffort + powerEffort
                : powerEffort > 0
                    ? powerEffort
                    : km > 0
                        ? km * timeHrs
                        : timeHrs;

        grouped[date].distance += a.distance || 0;
        grouped[date].moving_time += a.moving_time || 0;
        grouped[date].effort += fallbackEffort;
        grouped[date].count++;
    }

    const days = Object.keys(grouped).length;
    console.log(`[preprocessing] ✅ Agrupadas ${activities.length} actividades en ${days} días.`);
    return grouped;
}

/**
 * Extrae arrays ordenados de fechas y esfuerzos diarios
 */
export function computeDailyEffort(groupedByDay) {
    const sortedDates = Object.keys(groupedByDay).sort();
    const dailyEffort = sortedDates.map(d => groupedByDay[d].effort);
    console.log(`[preprocessing] 📊 Calculado esfuerzo diario para ${sortedDates.length} días.`);
    console.log(`[preprocessing] Ejemplo:`, sortedDates.slice(0, 3).map((d, i) => ({ d, e: dailyEffort[i].toFixed(2) })));
    return { dates: sortedDates, dailyEffort };
}

/**
 * Normaliza un array entre 0 y 1
 */
export function normalizeArray(arr) {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    console.log(`[preprocessing] ⚖️ Normalizando esfuerzo diario. Min=${min.toFixed(3)} Max=${max.toFixed(3)}`);
    if (max === min) return arr.map(() => 0);
    return arr.map(v => (v - min) / (max - min));
}

/**
 * Suavizado con media móvil
 */
export function smoothArray(arr, windowSize = 3) {
    console.log(`[preprocessing] 📈 Aplicando suavizado (window=${windowSize})...`);
    return utils.rollingMean(arr, windowSize);
}

/**
 * Asigna ATL, CTL, TSB e injuryRisk a cada actividad según su fecha
 */
function assignFitnessToActivities(activities, dates, fitness) {
    console.log(`[preprocessing] 🧩 Asignando ATL/CTL/TSB/InjuryRisk a ${activities.length} actividades...`);
    let matched = 0;
    activities.forEach(a => {
        if (!a.start_date_local) return;
        const date = a.start_date_local.split('T')[0];
        const idx = dates.indexOf(date);
        if (idx !== -1) {
            a.atl = +fitness.atl[idx].toFixed(2);
            a.ctl = +fitness.ctl[idx].toFixed(2);
            a.tsb = +fitness.tsb[idx].toFixed(2);
            a.injuryRisk = +fitness.injuryRisk[idx].toFixed(2);
            matched++;
        } else {
            a.atl = a.ctl = a.tsb = a.injuryRisk = null;
        }
    });
    console.log(`[preprocessing] ✅ Fitness asignado a ${matched}/${activities.length} actividades.`);
}

/**
 * Pipeline completo de preprocesamiento
 */
export function preprocessActivities(activities) {
    console.log(`[preprocessing] 🚀 Iniciando pipeline con ${activities?.length || 0} actividades...`);
    const t0 = performance.now();
    if (!activities || !activities.length) {
        console.warn("[preprocessing] ⚠️ No hay actividades, abortando.");
        return null;
    }

    // 1. VO₂max
    computeVo2max(activities);

    // 2. Agrupar y calcular esfuerzo diario
    const grouped = groupByDay(activities);
    const { dates, dailyEffort } = computeDailyEffort(grouped);

    // 3. Normalizar + suavizar
    const normalized = normalizeArray(dailyEffort);
    const smoothed = smoothArray(normalized, 5);

    // 4. Fitness
    console.log("[preprocessing] 🧮 Calculando ATL/CTL/TSB/InjuryRisk...");
    const fitness = utils.calculateFitness(smoothed);
    console.log(`[preprocessing] Fitness ejemplo: ATL=${fitness.atl.slice(-3)}, CTL=${fitness.ctl.slice(-3)}, TSB=${fitness.tsb.slice(-3)}`);

    // 5. Asignar a actividades
    assignFitnessToActivities(activities, dates, fitness);

    const t1 = performance.now();
    console.log(`[preprocessing] ✅ Pipeline completado en ${(t1 - t0).toFixed(1)} ms.`);
    console.log(`[preprocessing] 📅 Rango de fechas procesadas: ${dates[0]} → ${dates[dates.length - 1]}`);

    return { dates, dailyEffort, smoothed, fitness, activities };
}
