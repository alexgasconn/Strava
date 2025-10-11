// =================================================================
//          NUEVO MÓDULO: CLASIFICADOR DE TIPO DE CARRERA
// =================================================================

// classifyRun.js
window.classifyRun = function classifyRun(act = {}, streams = {}) {
    // ---------- Helpers ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sum = arr => arr.reduce((s, x) => s + (x || 0), 0);

    function secsPerKmFromSpeed(mps) {
        if (!mps || mps <= 0) return null;
        return 1000 / mps; // seconds per km
    }
    function paceMinPerKmFromSpeed(mps) {
        const s = secsPerKmFromSpeed(mps);
        return s ? (s / 60) : null; // minutes per km
    }

    function calculateCV(arr) {
        if (!Array.isArray(arr) || arr.length < 2) return 0;
        const numeric = arr.map(x => Number(x)).filter(x => isFinite(x) && x > 0);
        if (numeric.length < 2) return 0;
        const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
        const sd = Math.sqrt(numeric.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / numeric.length);
        return (sd / mean) * 100; // percent
    }

    function timeInZonesFromStreams(hrStream, timeStream, hrZones) {
        if (!hrStream || !timeStream || !Array.isArray(hrStream.data) || !Array.isArray(timeStream.data)) return null;
        const hr = hrStream.data;
        const times = timeStream.data;
        const n = Math.min(hr.length, times.length);
        if (n < 2) return null;

        const zones = hrZones.map((z, i) => {
            const max = typeof z.max === 'number' ? z.max : null;
            const min = (i === 0) ? 0 : ((typeof hrZones[i - 1].max === 'number') ? hrZones[i - 1].max + 1 : 0);
            return { min, max };
        });

        const timePerZone = new Array(zones.length).fill(0);
        for (let i = 1; i < n; i++) {
            const dt = times[i] - times[i - 1];
            if (!(dt > 0)) continue;
            const hrVal = hr[i];
            let zi = zones.findIndex(z => (z.max !== null ? (hrVal <= z.max && hrVal >= z.min) : hrVal >= z.min));
            if (zi === -1) zi = zones.length - 1;
            timePerZone[zi] += dt;
        }
        return timePerZone;
    }

    function normalizeEffort(eff) {
        if (!eff && eff !== 0) return 0;
        const v = clamp(Number(eff) || 0, 0, 300);
        return v / 300;
    }

    function emptyScores() {
        return {
            'Recovery Run': 0, 'Easy Run': 0, 'Long Run': 0, 'Race': 0,
            'Tempo Run': 0, 'Intervals': 0, 'Fartlek': 0, 'Progressive Run': 0,
            'Hill Repeats': 0, 'Trail Run': 0
        };
    }

    function addScores(target, addObj, weight = 1) {
        Object.keys(addObj).forEach(k => {
            target[k] = (target[k] || 0) + (addObj[k] || 0) * weight;
        });
    }

    // ---------- Extract basic metrics ----------
    const distKm = (act.distance || 0) / 1000;
    const movingTime = (act.moving_time || 0);
    const elapsedTime = (act.elapsed_time || movingTime || 1);
    const moveRatio = elapsedTime > 0 ? clamp(movingTime / elapsedTime, 0, 1) : 1;
    const elevationPerKm = distKm > 0 ? (act.total_elevation_gain || 0) / distKm : 0;
    const paceAvgMinKm = paceMinPerKmFromSpeed(act.average_speed) || 0;
    const hrAvg = act.average_heartrate || 0;
    const hrMax = act.max_heartrate || null;
    const effortNorm = normalizeEffort(act.suffer_score || act.perceived_exertion || act.perceived_effort || 0);
    const sportType = (act.sport_type || act.type || '').toString();

    let paceStream = [];
    try {
        if (streams?.distance?.data && streams?.time?.data) {
            for (let i = 1; i < Math.min(streams.distance.data.length, streams.time.data.length); i++) {
                const dDist = streams.distance.data[i] - streams.distance.data[i - 1];
                const dTime = streams.time.data[i] - streams.time.data[i - 1];
                if (dDist > 0 && dTime > 0) paceStream.push((dTime / dDist) * 1000 / 60);
            }
        } else if (streams?.pace?.data) {
            paceStream = streams.pace.data.map(x => Number(x)).filter(x => isFinite(x) && x > 0);
        }
    } catch (e) { paceStream = []; }

    const paceCV = calculateCV(paceStream) || (streams?.pace_variability_stream ? parseFloat(String(streams.pace_variability_stream).replace('%', '')) : 0);
    const hrCV = Number(String(act.hr_variability_stream || act.hr_variability_laps || '').replace('%', '')) || calculateCV(streams?.heartrate?.data) || 0;

    const zonesObj = (() => {
        try {
            const zonesText = localStorage?.getItem?.('strava_training_zones');
            if (!zonesText) return null;
            const parsed = JSON.parse(zonesText);
            return parsed?.heart_rate?.zones || null;
        } catch (e) { return null; }
    })();

    const timeInZones = (zonesObj && streams?.heartrate && streams?.time) ? timeInZonesFromStreams(streams.heartrate, streams.time, zonesObj) : null;
    const totalTimeInZones = timeInZones ? sum(timeInZones) : 0;
    let pctZ = { low: 0, tempo: 0, high: 0, byZone: [] };
    if (timeInZones && totalTimeInZones > 0) {
        const z = timeInZones;
        const [z1, z2, z3, z4, z5] = z;
        pctZ.low = ((z1 + z2) / totalTimeInZones) * 100;
        pctZ.tempo = (z3 / totalTimeInZones) * 100;
        pctZ.high = ((z4 + z5) / totalTimeInZones) * 100;
        pctZ.byZone = timeInZones.map(t => (t / totalTimeInZones) * 100);
    }

    let negativeSplitRatio = 1;
    try {
        if (streams?.distance?.data && streams?.time?.data) {
            const halfway = (act.distance || 0) / 2;
            const idx = streams.distance.data.findIndex(d => d >= halfway);
            if (idx > 0) {
                const tHalf = streams.time.data[idx];
                const secondHalf = (movingTime || 0) - tHalf;
                negativeSplitRatio = tHalf > 0 ? secondHalf / tHalf : 1;
            }
        }
    } catch (e) { negativeSplitRatio = 1; }

    // ---------- Scoring ----------
    const scores = emptyScores();

    // 1) sport_type strong hints
    if (act.sport_type === 'TrailRun') addScores(scores, { 'Trail Run': 400 });
    if (act.workout_type === 1) addScores(scores, { 'Race': 500 });
    if (act.workout_type === 2) addScores(scores, { 'Long Run': 200 });

    // 2) Distance: piecewise influence
    const distComponent = {};
    if (distKm >= 15) distComponent['Long Run'] = 120 + (distKm - 15) * 2;
    else if (distKm >= 14) distComponent['Long Run'] = 90;
    else if (distKm >= 13) distComponent['Long Run'] = 75;
    else if (distKm >= 12) distComponent['Long Run'] = 50;
    if (distKm < 5) distComponent['Recovery Run'] = 70;
    if (distKm < 5) distComponent['Easy Run'] = 50;
    else if (distKm < 8) distComponent['Recovery Run'] = 30, distComponent['Easy Run'] = (distKm >= 5 ? 30 : 10);
    else if (distKm < 12) distComponent['Easy Run'] = 20;
    if (distKm >= 5 && distKm < 12) {
        distComponent['Intervals'] = 8;
        distComponent['Fartlek'] = 8;
        distComponent['Tempo Run'] = distKm >= 6 && distKm <= 14 ? 12 : 0;
    }
    addScores(scores, distComponent, 1.0);

    // 3) Elevation per km
    const elevComponent = {};
    if (elevationPerKm > 40) { elevComponent['Trail Run'] = 40; elevComponent['Hill Repeats'] = 60; }
    else if (elevationPerKm > 30) { elevComponent['Hill Repeats'] = 50; elevComponent['Trail Run'] = 50; }
    else if (elevationPerKm > 15) { elevComponent['Hill Repeats'] = 50; elevComponent['Trail Run'] = 50; }
    addScores(scores, elevComponent, 1.1);

    // 4) Moving ratio
    const moveComp = {};
    if (moveRatio < 0.9) { moveComp['Trail Run'] = 50; moveComp['Hill Repeats'] = 30; }
    else if (moveRatio < 0.95) { moveComp['Trail Run'] = 20; moveComp['Fartlek'] = 10; }
    else { moveComp['Easy Run'] = 5; }
    addScores(scores, moveComp, 0.9);

    // 5) Effort
    const e = effortNorm;
    const effComp = {};
    if (e > 0.7) { effComp['Race'] = 80 * e; effComp['Intervals'] = 50 * e; }
    else if (e > 0.45) { effComp['Tempo Run'] = 50 * e; effComp['Fartlek'] = 30 * e; effComp['Long Run'] = 20 * e; }
    else { effComp['Easy Run'] = 30 * (1 - e); effComp['Recovery Run'] = 60 * (1 - e); }
    if (e > 0.5) { effComp['Easy Run'] = (effComp['Easy Run'] || 0) - 40; effComp['Recovery Run'] = (effComp['Recovery Run'] || 0) - 60; }
    addScores(scores, effComp, 1.4);

    // 6) HR zones
    const hrComp = {};
    if (pctZ.low > 80) hrComp['Recovery Run'] = 120, hrComp['Easy Run'] = 40;
    if (pctZ.low > 60 && pctZ.low <= 80) hrComp['Easy Run'] = 100;
    if (pctZ.tempo > 50) hrComp['Tempo Run'] = 100;
    if (pctZ.tempo > 35 && pctZ.tempo <= 50) hrComp['Progressive Run'] = 40;
    if (pctZ.high > 40) hrComp['Intervals'] = 90;
    if (pctZ.high > 60) hrComp['Race'] = 120;
    if (timeInZones && timeInZones.length >= 2) {
        if (timeInZones[0] > timeInZones[1]) hrComp['Recovery Run'] += 40;
        else if (timeInZones[1] > timeInZones[0]) { hrComp['Easy Run'] += 40; hrComp['Recovery Run'] -= 40; }
    }
    if (pctZ.low > 20 && pctZ.high > 10 && pctZ.tempo > 10) hrComp['Fartlek'] = 30;
    addScores(scores, hrComp, 1.6);

    // 7) Pace & variability
    const paceComp = {};
    if (paceCV > 20) { paceComp['Intervals'] = (paceComp['Intervals'] || 0) + 80; paceComp['Fartlek'] = 60; }
    else if (paceCV > 12) { paceComp['Fartlek'] = 40; paceComp['Progressive Run'] = 30; }
    else if (paceCV < 6) { paceComp['Race'] = (paceComp['Race'] || 0) + 20; paceComp['Tempo Run'] = 10; }
    addScores(scores, paceComp, 1.1);

    // 8) HR variability
    const hrComp2 = {};
    if (hrCV > 10) hrComp2['Intervals'] = 40;
    if (hrCV < 5 && pctZ.low > 50) hrComp2['Easy Run'] = 20;
    addScores(scores, hrComp2, 0.8);

    // 9) Negative split
    const nsComp = {};
    if (distKm >= 8) {
        if (negativeSplitRatio < 0.95) nsComp['Progressive Run'] = 80;
        else if (negativeSplitRatio < 1.0) nsComp['Progressive Run'] = 30;
    }
    addScores(scores, nsComp, 1.0);

    // 10) Small rules
    if (distKm >= 21 && effortNorm > 0.6) addScores(scores, { 'Race': 30, 'Long Run': 40 }, 0.8);
    if (distKm >= 10 && elevationPerKm > 20 && moveRatio < 0.97) addScores(scores, { 'Trail Run': 40 }, 1.0);
    if (act.name && /tempo/i.test(act.name)) addScores(scores, { 'Tempo Run': 60 }, 0.9);
    if (act.name && /fartlek/i.test(act.name)) addScores(scores, { 'Fartlek': 80 }, 0.9);

    // ---------- Final normalization & output ----------
    const totalScore = sum(Object.values(scores));
    if (totalScore === 0) return [{ type: 'General Run', score: 100, abs: 1 }];

    const results = Object.entries(scores)
        .map(([type, sc]) => ({ type, abs: Math.round(sc), pct: +((sc / totalScore) * 100).toFixed(1) }))
        .filter(r => r.abs > 0)
        .sort((a, b) => b.abs - a.abs);

    return {
        top: results.slice(0, 5),
        all: results,
        diagnostics: {
            distKm, paceAvgMinKm: +(paceAvgMinKm || 0).toFixed(2), paceCV: +paceCV.toFixed(1),
            hrAvg, hrCV: +hrCV.toFixed(1), effortNorm: +effortNorm.toFixed(3),
            elevationPerKm: +elevationPerKm.toFixed(1), moveRatio: +moveRatio.toFixed(3),
            pctZ, negativeSplitRatio: +negativeSplitRatio.toFixed(3)
        }
    };
}
