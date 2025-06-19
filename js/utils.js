// js/utils.js

/**
 * Filtra actividades según el rango de fechas global.
 * @param {Array} activities - Array de actividades.
 * @param {string|null} from - Fecha de inicio (YYYY-MM-DD).
 * @param {string|null} to - Fecha de fin (YYYY-MM-DD).
 * @returns {Array} - Actividades filtradas.
 */
export function filterActivitiesByDate(activities, from, to) {
    if (!from && !to) return activities;
    return activities.filter(act => {
        const date = act.start_date_local.substring(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
    });
}

/**
 * Calcula una media móvil sobre un array de números.
 * @param {Array<number>} arr - El array de datos.
 * @param {number} windowSize - El tamaño de la ventana.
 * @returns {Array<number>} - El array con la media móvil.
 */
export function rollingMean(arr, windowSize) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = arr.slice(start, i + 1);
        result.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    return result;
}

/**
 * Calcula CTL, ATL y TSB a partir de un array de esfuerzos diarios.
 * @param {Array<number>} dailyEffort - Array de valores de esfuerzo por día.
 * @returns {Object} - Objeto con arrays para atl, ctl y tsb.
 */
export function calculateFitness(dailyEffort) {
    function expMovingAvg(arr, lambda) {
        const result = [];
        let prev = arr[0] || 0;
        for (let i = 0; i < arr.length; i++) {
            const val = arr[i] || 0;
            prev = prev + lambda * (val - prev);
            result.push(prev);
        }
        return result;
    }
    const atl = expMovingAvg(dailyEffort, 1 / 7);
    const ctl = expMovingAvg(dailyEffort, 1 / 42);
    const tsb = ctl.map((c, i) => c - atl[i]);
    return { atl, ctl, tsb };
}


/**
 * Obtiene el número de semana ISO para una fecha.
 * @param {Date} date - El objeto Date.
 * @returns {number} - El número de la semana.
 */
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}


/**
 * Calcula las rachas de actividad (días, semanas, meses).
 * @param {Array} runs - Array de actividades de carrera.
 * @returns {Object} - Objeto con las rachas actuales e históricas.
 */
export function calculateStreaks(runs) {
    // Esta es la lógica de tu función renderStreaks, pero solo la parte de cálculo.
    // ... (El código de cálculo de rachas de días, semanas y meses va aquí) ...
    // ... (Es un bloque largo, lo omito para brevedad, pero es el mismo que tenías) ...
    // Al final, en lugar de renderizar, devuelve un objeto:
    // return { maxDayStreak, currentDayStreak, maxWeekStreak, ... };
    // Por ahora, para simplificar, dejaremos el cálculo y renderizado juntos en ui.js
    // pero idealmente, el cálculo puro iría aquí.
    return {}; // Placeholder
}