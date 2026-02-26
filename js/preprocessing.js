// js/preprocessing.js
import { rollingMean, calculateEnvironmentalDifficulty } from './utils.js';

// ===================================================================
// CONFIGURACIÓN
// ===================================================================
const SUFFER_TO_TSS = 1;
const MAX_HR_DEFAULT = 190;

// ===================================================================
// WEATHER API FUNCTION
// ===================================================================
function numericSafe(v) {
    return v === null || v === undefined || isNaN(v) ? 0 : Number(v);
}

async function getWeatherForRun(run) {
    if (!run.start_latlng || run.start_latlng.length < 2) {
        return null;
    }

    const [lat, lon] = run.start_latlng;
    const start = new Date(run.start_date_local);
    const dateStr = start.toISOString().split("T")[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,weathercode,cloudcover,surface_pressure,relativehumidity_2m&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        const data = await res.json();

        if (!data.hourly || !data.hourly.time || !data.hourly.time.length) {
            return null;
        }

        const hour = start.getHours();
        let idx = data.hourly.time.findIndex(t => new Date(t).getHours() === hour);

        if (idx === -1) {
            idx = Math.min(hour, data.hourly.time.length - 1);
        }

        const weather = {
            temperature: numericSafe(data.hourly.temperature_2m[idx]),
            precipitation: numericSafe(data.hourly.precipitation[idx]),
            wind_speed: numericSafe(data.hourly.wind_speed_10m[idx]),
            wind_direction: numericSafe(data.hourly.wind_direction_10m[idx]),
            weather_code: data.hourly.weathercode ? data.hourly.weathercode[idx] : null,
            humidity: numericSafe(data.hourly.relativehumidity_2m ? data.hourly.relativehumidity_2m[idx] : null),
            cloudcover: numericSafe(data.hourly.cloudcover ? data.hourly.cloudcover[idx] : null),
            pressure: numericSafe(data.hourly.surface_pressure ? data.hourly.surface_pressure[idx] : null),
        };

        const difficulty = calculateEnvironmentalDifficulty({ weather });

        return { ...weather, difficulty };

    } catch (err) {
        console.error(`Weather fetch for ${run.name} (${dateStr}) failed:`, err);
        return null;
    }
}

// ===================================================================
// 1. TSS: suffer_score → TSS (fallback: 36/hora)
// ===================================================================
function calculateTSS(activity, maxHr = MAX_HR_DEFAULT) {
    let tss = 0;
    let method = 'none';

    // Priority: Power (if available, though rare for running)
    if (activity.average_watts != null && activity.average_watts > 0) {
        // For cycling: IF = NP / FTP, but NP not available, use average_watts / FTP
        // But FTP not available, skip for now
        method = 'power_unavailable';
    }

    // Next: Heart Rate
    if (method === 'none' && activity.average_heartrate != null && activity.average_heartrate > 0) {
        const if_hr = activity.average_heartrate / maxHr;
        const hours = (activity.moving_time || 0) / 3600;
        tss = (hours * if_hr) * 100;
        method = 'heartrate';
    }

    // Fallback: Suffer score
    if (method === 'none' && activity.suffer_score != null && activity.suffer_score >= 0) {
        tss = activity.suffer_score * SUFFER_TO_TSS;
        method = 'suffer_score';
    }

    // Last resort: Time-based
    if (method === 'none') {
        const hours = (activity.moving_time || 0) / 3600;
        tss = hours * 36;
        method = 'time';
    }

    if (isNaN(tss)) tss = 0;
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
// 3. Agrupar por día (con weather para runs)
// ===================================================================
async function groupByDay(activities) {
    const daily = {};
    const runs = activities.filter(a => a.type === 'Run' && a.start_latlng);

    // Fetch weather in batches
    const batches = 5;
    for (let i = 0; i < runs.length; i += batches) {
        const batch = runs.slice(i, i + batches);
        const weatherPromises = batch.map(run => getWeatherForRun(run));
        const weatherResults = await Promise.all(weatherPromises);

        batch.forEach((run, idx) => {
            const weather = weatherResults[idx];
            if (weather) {
                run.weather = weather;
                run.difficulty = weather.difficulty;
            } else {
                run.difficulty = 0; // default
            }
        });

        // Sleep to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    activities.forEach(a => {
        const date = a.start_date_local?.split('T')[0];
        if (!date) return;

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
// 6. INJURY RISK (adaptive percentile-based)
// ===================================================================
function calculateInjuryRiskImproved(tsb, rampRate, atl, tssSeries) {
    const riskHistory = [];
    const len = tsb.length;

    // Helper: percentil relativo al historial
    const percentile = (arr, val) => {
        const filtered = arr.filter(x => !isNaN(x));
        if (!filtered.length) return 0.5;
        const sorted = filtered.sort((a, b) => a - b);
        let count = 0;
        for (const x of sorted) if (x <= val) count++;
        return count / sorted.length;
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
            if (!isNaN(mean) && mean > 0) {
                const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
                const cv = Math.sqrt(variance) / mean;
                risk *= 1 + Math.min(cv, 1) * 0.3; // hasta +30% si CV alto
            }
        }

        // --- Normalizar a [0,1] ---
        risk = Math.min(Math.max(risk, 0), 1);

        // --- Suavizado EWMA adaptativo ---
        if (i > 0) {
            const prev = riskHistory[i - 1];
            const alpha = 0.2 + 0.5 * Math.min(1, Math.abs(risk - prev));
            risk = prev * (1 - alpha) + risk * alpha;
        }

        if (isNaN(risk)) risk = 0;
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
export async function preprocessActivities(activities, userProfile = {}, zones = null, gears = null) {
    if (!activities?.length) return [];

    // Derive maxHR from zones if available (last zone's max), fallback to profile, then default
    let maxHr = MAX_HR_DEFAULT;
    if (zones?.heart_rate?.zones) {
        const hrZones = zones.heart_rate.zones;
        const lastZoneMax = hrZones[hrZones.length - 1]?.max;
        if (lastZoneMax && lastZoneMax > 0 && lastZoneMax !== -1) {
            maxHr = lastZoneMax;
        }
    }
    if (userProfile.max_hr) {
        maxHr = userProfile.max_hr;
    }

    activities.forEach(a => calculateTSS(a, maxHr));

    const daily = await groupByDay(activities);
    const { dates, tssValues } = getTimeSeries(daily);
    const pmc = calculatePMC(tssValues);
    const injuryRisk = calculateInjuryRiskImproved(pmc.tsb, pmc.rampRate, pmc.atl, pmc.tssSeries);

    assignMetrics(activities, dates, pmc, injuryRisk);

    return activities;
}