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

// Estimate average HR if missing (based on distance and pace)
export function estimateAverageHR(act, userMaxHr = 195) {
    if (act.average_heartrate) return act.average_heartrate;
    // Ajusta estos coeficientes si tienes mejores datos
    const HR_INTERCEPT = 218.29;
    const HR_COEF_DISTANCE = 0.73;
    const HR_COEF_PACE = -14.73;
    const HR_MIN = 100;
    const HR_MAX = 200;
    const distance_km = act.distance / 1000;
    const pace_min_per_km = (act.moving_time / 60) / distance_km;
    let hr = Math.round(
        HR_INTERCEPT
        + HR_COEF_DISTANCE * distance_km
        + HR_COEF_PACE * pace_min_per_km
    );
    return Math.min(HR_MAX, Math.max(HR_MIN, hr));
}

// Estimate VO2max for an activity
export function estimateVO2max(act, userMaxHr = 195) {
    if (!act.distance || !act.moving_time) return null;
    const avgHr = act.average_heartrate || estimateAverageHR(act, userMaxHr);
    if (!avgHr) return null;
    const vel_m_min = (act.distance / act.moving_time) * 60;
    const vo2_at_pace = (vel_m_min * 0.2) + 3.5;
    const percent_max_hr = avgHr / userMaxHr;
    if (percent_max_hr < 0.5 || percent_max_hr > 1.2) return null;
    return vo2_at_pace / percent_max_hr;
}


// ELIMINADO: La función calculateStreaks la hemos movido por completo a ui.js
// porque mezclaba cálculo y renderizado. Mantener este placeholder causaba confusión.


// ... (al final del archivo, junto a las otras funciones exportadas)

/**
 * Decodifica una polilínea encriptada de Google/Strava a un array de coordenadas [lat, lng].
 * @param {string} str La polilínea encriptada.
 * @returns {Array<[number, number]>} Un array de coordenadas.
 */
export function decodePolyline(str) {
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
}