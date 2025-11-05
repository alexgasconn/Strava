// js/utils.js


export function formatTime(sec) {
    if (!isFinite(sec) || sec <= 0) return 'N/A';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return (h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`);
}

export function formatPace(seconds, km) {
    if (!isFinite(seconds) || !isFinite(km) || km <= 0) return '-';
    const pace = seconds / km;
    const min = Math.floor(pace / 60);
    const secRest = Math.round(pace % 60);
    return `${min}:${secRest.toString().padStart(2, '0')} /km`;
}



export function filterActivitiesByDate(activities, from, to) {
    if (!from && !to) return activities;
    return activities.filter(act => {
        const date = act.start_date_local.substring(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
    });
}

export function rollingMean(arr, windowSize) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = arr.slice(start, i + 1);
        result.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    return result;
}

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



export function formatTime(sec) {
    if (!isFinite(sec) || sec <= 0) return 'N/A';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return (h > 0 ? h + ':' : '') + m.toString().padStart(h > 0 ? 2 : 1, '0') + ':' + s.toString().padStart(2, '0');
}

export function formatDistance(meters) {
    if (!isFinite(meters) || meters < 0) return 'N/A';
    if (meters < 1000) {
        return `${meters.toFixed(0)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
}

export function formatPace(seconds, km) {
    if (!isFinite(seconds) || !isFinite(km) || km <= 0) return '-';
    const pace = seconds / km; // pace in seconds per km
    const min = Math.floor(pace / 60);
    const secRest = Math.round(pace % 60);
    return `${min}:${secRest.toString().padStart(2, '0')} /km`;
}