// js/utils.js




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

    const injuryRisk = tsb.map(tsbVal => {
        const k = 0.25;  // steepness of the curve
        const x0 = -10;  // TSB where risk = 50%
        const risk = 1 / (1 + Math.exp(-k * (x0 - tsbVal))); // sigmoid
        return +(risk * 100).toFixed(2); // convert to %
    });

    return { atl, ctl, tsb, injuryRisk };
}



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
    let min = Math.floor(pace / 60);
    let secRest = Math.round(pace % 60);
    if (secRest === 60) {
        min += 1;
        secRest = 0;
    }
    return `${min}:${secRest.toString().padStart(2, '0')} /km`;
}

export function formatPaceFromSpeed(speedInMps) {
    if (!speedInMps || speedInMps === 0) return '-';
    const paceInSecPerKm = 1000 / speedInMps;
    let min = Math.floor(paceInSecPerKm / 60);
    let sec = Math.round(paceInSecPerKm % 60);
    if (sec === 60) {
        min += 1;
        sec = 0;
    }
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function calculateEnvironmentalDifficulty(activity) {
    // Placeholder: calculate based on weather data
    // Assume activity has weather: { temp: number, humidity: number, wind_speed: number }
    const weather = activity.weather || {};
    let difficulty = 0;

    if (weather.temp !== undefined) {
        if (weather.temp > 30) difficulty += 30;
        else if (weather.temp > 25) difficulty += 20;
        else if (weather.temp < 5) difficulty += 15;
        else if (weather.temp < 0) difficulty += 25;
    }

    if (weather.humidity !== undefined && weather.humidity > 80) {
        difficulty += 10;
    }

    if (weather.wind_speed !== undefined && weather.wind_speed > 10) {
        difficulty += 15;
    }

    return Math.min(difficulty, 100); // Max 100%
}

export function formatDate(date) {
    if (!(date instanceof Date)) date = new Date(date);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

export function paceDecimalToTime(paceDecimal) {
    if (isNaN(paceDecimal) || paceDecimal <= 0) return "–";

    const minutes = Math.floor(paceDecimal);
    const seconds = Math.round((paceDecimal - minutes) * 60);

    const adjMinutes = seconds === 60 ? minutes + 1 : minutes;
    const adjSeconds = seconds === 60 ? 0 : seconds;

    return `${adjMinutes}:${adjSeconds.toString().padStart(2, "0")}`;
}


// --- helpers de icono/color --- 
export function trendColor(p) {
    return p > 0 ? '#2ECC40' : (p < 0 ? '#FF4136' : '#888');
}
export function trendIcon(p) {
    return p > 0 ? '▲' : (p < 0 ? '▼' : '•');
}

// --- Colores e iconos por métrica ---
export function metricColor(metric, change) {
    if (change == 0) return '#888';

    // Menor es mejor → verde si baja
    if (['pace', 'hr'].includes(metric))
        return change < 0 ? '#2ECC40' : '#FF4136';

    // Mayor es mejor → verde si sube
    return change > 0 ? '#2ECC40' : '#FF4136';
}

export function metricIcon(metric, change) {
    if (change == 0) return '•';

    if (['pace', 'hr'].includes(metric))
        return change < 0 ? '▼' : '▲'; // baja = mejora

    return change > 0 ? '▲' : '▼';
}