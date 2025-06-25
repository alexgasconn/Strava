// js/utils.js

// EXPORTADO: Ahora es accesible desde otros módulos.
export function filterActivitiesByDate(activities, from, to) {
    if (!from && !to) return activities;
    return activities.filter(act => {
        const date = act.start_date_local.substring(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
    });
}

// EXPORTADO: Correcto.
export function rollingMean(arr, windowSize) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = arr.slice(start, i + 1);
        result.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    return result;
}

// EXPORTADO: Correcto.
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
 * ¡NUEVO Y CORREGIDO!
 * La función getISOWeek estaba oculta dentro de renderStreaks en tu script original.
 * Debe estar aquí, en utils.js, y ser exportada para que ui.js pueda usarla.
 * @param {Date} date - El objeto Date.
 * @returns {number} - El número de la semana.
 */
export function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}


// ELIMINADO: La función calculateStreaks la hemos movido por completo a ui.js
// porque mezclaba cálculo y renderizado. Mantener este placeholder causaba confusión.