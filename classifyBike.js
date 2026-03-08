// =================================================================
//          CLASIFICADOR DE TIPO DE CICLISMO
// =================================================================

window.classifyBike = function classifyBike(act = {}, streams = {}) {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sum = arr => arr.reduce((s, x) => s + (x || 0), 0);

    function speedKmhFromMps(mps) { return mps * 3.6; }
    function calculateCV(arr) {
        if (!Array.isArray(arr) || arr.length < 2) return 0;
        const n = arr.map(Number).filter(x => isFinite(x) && x > 0);
        if (n.length < 2) return 0;
        const m = n.reduce((a, b) => a + b, 0) / n.length;
        const sd = Math.sqrt(n.map(x => Math.pow(x - m, 2)).reduce((a, b) => a + b, 0) / n.length);
        return (sd / m) * 100;
    }
    function normalizeEffort(e) { return clamp(Number(e) || 0, 0, 300) / 300; }

    function emptyScores() {
        return {
            'Road Bike': 0, 'Mountain Bike': 0
        };
    }
    function addScores(target, addObj, weight = 1) {
        for (const k in addObj) target[k] = (target[k] || 0) + (addObj[k] || 0) * weight;
    }

    // ---------- Extract metrics ----------
    const distKm = (act.distance || 0) / 1000;
    const movingTime = act.moving_time || 0;
    const elapsedTime = act.elapsed_time || movingTime || 1;
    const moveRatio = clamp(movingTime / elapsedTime, 0, 1);
    const elevationPerKm = distKm > 0 ? (act.total_elevation_gain || 0) / distKm : 0;
    const speedAvgKmh = speedKmhFromMps(act.average_speed);
    const hrAvg = act.average_heartrate || 0;
    const effortNorm = normalizeEffort(act.suffer_score || act.perceived_effort || 0);

    let speedStream = [];
    try {
        if (streams?.distance?.data && streams?.time?.data) {
            const len = Math.min(streams.distance.data.length, streams.time.data.length);
            for (let i = 1; i < len; i++) {
                const dDist = streams.distance.data[i] - streams.distance.data[i - 1];
                const dTime = streams.time.data[i] - streams.time.data[i - 1];
                if (dDist > 0 && dTime > 0) speedStream.push((dDist / dTime) * 3.6);
            }
        } else if (streams?.velocity_smooth?.data) speedStream = streams.velocity_smooth.data.map(x => x * 3.6).filter(x => isFinite(x) && x > 0);
    } catch { }

    const speedCV = calculateCV(speedStream);
    const hrCV = Number(String(act.hr_variability_stream || act.hr_variability_laps || '').replace('%', '')) || 0;

    // ---------- HR zones (similar to run) ----------
    let pctZ = { low: 0, midlow: 0, midhigh: 0, high: 0 };
    try {
        const zonesObj = JSON.parse(localStorage?.getItem?.('strava_training_zones') || '{}')?.heart_rate?.zones || null;
        if (zonesObj && streams?.heartrate?.data && streams?.time?.data) {
            const tPerZone = [0, 0, 0, 0];
            const hr = streams.heartrate.data, times = streams.time.data;

            let bounds = [0, 0, 0, 0, 0];
            for (let i = 0; i < 4; i++) {
                bounds[i] = zonesObj[i]?.max || 0;
            }
            bounds[4] = zonesObj[3]?.max || 200;

            for (let i = 1; i < Math.min(hr.length, times.length); i++) {
                const dt = times[i] - times[i - 1];
                if (dt <= 0) continue;
                const h = hr[i];
                if (h <= bounds[0]) tPerZone[0] += dt;
                else if (h <= bounds[1]) tPerZone[1] += dt;
                else if (h <= bounds[2]) tPerZone[2] += dt;
                else tPerZone[3] += dt;
            }

            const total = sum(tPerZone) || 1;
            pctZ.low = tPerZone[0] / total * 100;
            pctZ.midlow = tPerZone[1] / total * 100;
            pctZ.midhigh = tPerZone[2] / total * 100;
            pctZ.high = tPerZone[3] / total * 100;
        }
    } catch (e) {
        console.warn('Error calculando pctZ', e);
    }

    // ---------- Scoring ----------
    const scores = emptyScores();

    // Sport type & name hints
    if (act.sport_type === 'MountainBike') addScores(scores, { 'Mountain Bike': 500 });
    if (act.name && /mountain|mtb|trail/i.test(act.name)) addScores(scores, { 'Mountain Bike': 100 });
    if (act.name && /road|cycling|bike/i.test(act.name)) addScores(scores, { 'Road Bike': 100 });

    // ---------- Elevation scoring ----------
    if (elevationPerKm > 50) {
        addScores(scores, { 'Mountain Bike': 200 });
    } else if (elevationPerKm > 20) {
        addScores(scores, { 'Mountain Bike': 100, 'Road Bike': -50 });
    } else if (elevationPerKm > 10) {
        addScores(scores, { 'Mountain Bike': 50, 'Road Bike': -20 });
    } else {
        addScores(scores, { 'Road Bike': 50, 'Mountain Bike': -50 });
    }

    // ---------- Speed scoring ----------
    if (speedAvgKmh > 30) {
        addScores(scores, { 'Road Bike': 100, 'Mountain Bike': -50 });
    } else if (speedAvgKmh > 20) {
        addScores(scores, { 'Road Bike': 50 });
    } else if (speedAvgKmh < 15) {
        addScores(scores, { 'Mountain Bike': 50, 'Road Bike': -50 });
    }

    // ---------- Speed variability ----------
    if (speedCV > 30) {
        addScores(scores, { 'Mountain Bike': 100 });
    } else if (speedCV > 20) {
        addScores(scores, { 'Mountain Bike': 50 });
    } else {
        addScores(scores, { 'Road Bike': 50 });
    }

    // ---------- Moving ratio ----------
    if (moveRatio < 0.8) {
        addScores(scores, { 'Mountain Bike': 50 });
    }

    // ---------- Effort ----------
    if (effortNorm > 0.6) {
        addScores(scores, { 'Mountain Bike': 50 });
    }

    // ---------- HR zones ----------
    if (pctZ.high > 40) {
        addScores(scores, { 'Mountain Bike': 50 });
    } else if (pctZ.low > 60) {
        addScores(scores, { 'Road Bike': 50 });
    }

    // ---------- Output ----------
    const totalScore = sum(Object.values(scores)) || 1;
    const results = Object.entries(scores).map(([type, sc]) => ({ type, abs: Math.round(sc), pct: +((sc / totalScore) * 100).toFixed(1) }))
        .filter(r => r.abs > 0).sort((a, b) => b.abs - a.abs);

    return {
        top: results.slice(0, 2),
        all: results,
        diagnostics: { distKm, speedAvgKmh: +speedAvgKmh.toFixed(2), speedCV: +speedCV.toFixed(1), hrAvg, hrCV: +hrCV.toFixed(1), effortNorm: +effortNorm.toFixed(2), elevationPerKm: +elevationPerKm.toFixed(1), moveRatio: +moveRatio.toFixed(2), pctZ }
    };
}