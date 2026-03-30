// =================================================================
//          CLASIFICADOR DE TIPO DE CARRERA MEJORADO
// =================================================================

window.classifyRun = function classifyRun(act = {}, streams = {}) {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sum = arr => arr.reduce((s, x) => s + (x || 0), 0);
    const avg = arr => {
        const n = (arr || []).filter(Number.isFinite);
        return n.length ? sum(n) / n.length : 0;
    };

    function paceMinPerKmFromSpeed(mps) {
        return mps && mps > 0 ? 1000 / mps / 60 : 0;
    }

    function calculateCV(arr) {
        if (!Array.isArray(arr) || arr.length < 2) return 0;
        const n = arr.map(Number).filter(x => Number.isFinite(x) && x > 0);
        if (n.length < 2) return 0;
        const m = avg(n);
        if (!m) return 0;
        const variance = n.map(x => Math.pow(x - m, 2)).reduce((a, b) => a + b, 0) / n.length;
        return Math.sqrt(variance) / m * 100;
    }

    function normalizeEffort(e) {
        return clamp(Number(e) || 0, 0, 300) / 300;
    }

    function parseStoredVariability(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value !== 'string') return 0;
        const parsed = Number(value.replace('%', '').trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function emptyScores() {
        return {
            'Recovery Run': 0,
            'Easy Run': 0,
            'Long Run': 0,
            'Race': 0,
            'Tempo Run': 0,
            'Intervals': 0,
            'Fartlek': 0,
            'Progressive Run': 0,
            'Hill Repeats': 0,
            'Trail Run': 0
        };
    }

    function addScores(target, addObj, weight = 1) {
        for (const k in addObj) {
            target[k] = (target[k] || 0) + (addObj[k] || 0) * weight;
        }
    }

    function readHrZonesFromStorage() {
        try {
            const raw = localStorage?.getItem?.('strava_training_zones');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const zones = parsed?.heart_rate?.zones;
            if (!Array.isArray(zones)) return [];
            return zones
                .map(z => ({ min: Number(z?.min), max: Number(z?.max) }))
                .filter(z => Number.isFinite(z.min) && Number.isFinite(z.max))
                .sort((a, b) => a.min - b.min);
        } catch {
            return [];
        }
    }

    function computeZoneBuckets(zones, hrData, timeData) {
        const pctZ = { low: 0, midlow: 0, midhigh: 0, high: 0 };
        if (!zones.length || !Array.isArray(hrData) || !Array.isArray(timeData)) {
            return pctZ;
        }

        const n = Math.min(hrData.length, timeData.length);
        if (n < 2) return pctZ;

        const timePerZone = Array(zones.length).fill(0);

        for (let i = 1; i < n; i++) {
            const dt = timeData[i] - timeData[i - 1];
            const hr = Number(hrData[i]);
            if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(hr) || hr <= 0) continue;

            const idx = zones.findIndex(z => hr >= z.min && (z.max === -1 || hr < z.max));
            if (idx >= 0) timePerZone[idx] += dt;
            else if (hr >= zones[zones.length - 1].min) timePerZone[zones.length - 1] += dt;
        }

        const total = sum(timePerZone) || 1;
        const ratios = timePerZone.map(t => t / total * 100);

        if (ratios.length >= 5) {
            pctZ.low = (ratios[0] || 0) + (ratios[1] || 0);
            pctZ.midlow = ratios[2] || 0;
            pctZ.midhigh = ratios[3] || 0;
            pctZ.high = ratios.slice(4).reduce((a, b) => a + b, 0);
            return pctZ;
        }

        if (ratios.length === 4) {
            pctZ.low = ratios[0] || 0;
            pctZ.midlow = ratios[1] || 0;
            pctZ.midhigh = ratios[2] || 0;
            pctZ.high = ratios[3] || 0;
            return pctZ;
        }

        if (ratios.length === 3) {
            pctZ.low = ratios[0] || 0;
            pctZ.midlow = ratios[1] || 0;
            pctZ.high = ratios[2] || 0;
            return pctZ;
        }

        if (ratios.length === 2) {
            pctZ.low = ratios[0] || 0;
            pctZ.high = ratios[1] || 0;
            return pctZ;
        }

        pctZ.midlow = ratios[0] || 0;
        return pctZ;
    }

    function clampPaceSample(v) {
        if (!Number.isFinite(v) || v <= 0) return null;
        if (v < 2 || v > 20) return null;
        return v;
    }

    function computeConfidence(topResults, featureAvailability) {
        const top1 = topResults[0]?.abs || 0;
        const top2 = topResults[1]?.abs || 0;
        const totalTop = topResults.reduce((s, r) => s + (r.abs || 0), 0) || 1;

        const margin = top1 > 0 ? (top1 - top2) / top1 : 0;
        const topShare = top1 / totalTop;

        const featureFlags = [
            featureAvailability.distance,
            featureAvailability.movingTime,
            featureAvailability.elevation,
            featureAvailability.paceAvg,
            featureAvailability.paceStream,
            featureAvailability.effort,
            featureAvailability.hrAvg,
            featureAvailability.hrStream,
            featureAvailability.hrZones,
            featureAvailability.negativeSplit
        ];

        const coverage = featureFlags.filter(Boolean).length / featureFlags.length;
        const score = clamp(0.2 + (margin * 0.4) + (coverage * 0.3) + (topShare * 0.1), 0.05, 0.99);
        const level = score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : 'low';

        const missing = [];
        if (!featureAvailability.hrStream) missing.push('heartrate stream');
        if (!featureAvailability.hrZones) missing.push('training zones');
        if (!featureAvailability.paceStream) missing.push('pace stream');
        if (!featureAvailability.negativeSplit) missing.push('negative split');

        return {
            score: +score.toFixed(2),
            level,
            coverage: +(coverage * 100).toFixed(0),
            margin: +(margin * 100).toFixed(0),
            missingFeatures: missing
        };
    }

    const distKm = (act.distance || 0) / 1000;
    const movingTime = act.moving_time || 0;
    const elapsedTime = act.elapsed_time || movingTime || 1;
    const moveRatio = clamp(movingTime / elapsedTime, 0, 1);
    const elevationPerKm = distKm > 0 ? (act.total_elevation_gain || 0) / distKm : 0;
    const paceAvgMinKm = paceMinPerKmFromSpeed(act.average_speed);
    const hrAvg = Number(act.average_heartrate) || 0;
    const effortNorm = normalizeEffort(act.suffer_score || act.perceived_effort || 0);

    let paceStream = [];
    try {
        if (streams?.distance?.data && streams?.time?.data) {
            const distanceData = streams.distance.data;
            const timeData = streams.time.data;
            const len = Math.min(distanceData.length, timeData.length);
            for (let i = 1; i < len; i++) {
                const dDist = distanceData[i] - distanceData[i - 1];
                const dTime = timeData[i] - timeData[i - 1];
                if (dDist > 0 && dTime > 0) {
                    const sample = clampPaceSample((dTime / dDist) * 1000 / 60);
                    if (sample !== null) paceStream.push(sample);
                }
            }
        } else if (streams?.velocity_smooth?.data) {
            paceStream = streams.velocity_smooth.data
                .map(v => clampPaceSample(paceMinPerKmFromSpeed(Number(v))))
                .filter(v => v !== null);
        } else if (streams?.pace?.data) {
            paceStream = streams.pace.data
                .map(v => clampPaceSample(Number(v)))
                .filter(v => v !== null);
        }
    } catch {
        paceStream = [];
    }

    const paceCV = calculateCV(paceStream);

    let hrCV = 0;
    const hrSamples = streams?.heartrate?.data;
    if (Array.isArray(hrSamples) && hrSamples.length > 10) {
        hrCV = calculateCV(hrSamples);
    } else {
        hrCV = parseStoredVariability(act.hr_variability_stream || act.hr_variability_laps);
    }

    const zoneDefs = readHrZonesFromStorage();
    const pctZ = computeZoneBuckets(zoneDefs, streams?.heartrate?.data, streams?.time?.data);

    let negativeSplitRatio = 1;
    let hasNegativeSplit = false;
    try {
        if (streams?.distance?.data && streams?.time?.data) {
            const halfway = (act.distance || 0) / 2;
            const idx = streams.distance.data.findIndex(d => d >= halfway);
            if (idx > 0) {
                const tHalf = streams.time.data[idx];
                const secondHalf = movingTime - tHalf;
                if (tHalf > 0 && secondHalf > 0) {
                    negativeSplitRatio = secondHalf / tHalf;
                    hasNegativeSplit = true;
                }
            }
        }
    } catch {
        hasNegativeSplit = false;
    }

    const featureAvailability = {
        distance: distKm > 0,
        movingTime: movingTime > 0,
        elevation: Number.isFinite(elevationPerKm),
        paceAvg: paceAvgMinKm > 0,
        paceStream: paceStream.length >= 30,
        effort: effortNorm > 0,
        hrAvg: hrAvg > 0,
        hrStream: Array.isArray(hrSamples) && hrSamples.length >= 30,
        hrZones: zoneDefs.length >= 3 && Array.isArray(hrSamples) && hrSamples.length >= 30,
        negativeSplit: hasNegativeSplit
    };

    const scores = emptyScores();

    if (act.sport_type === 'TrailRun') addScores(scores, { 'Trail Run': 220, 'Hill Repeats': 40 });
    if (act.workout_type === 1) addScores(scores, { Race: 260 });
    if (act.name && /tempo|threshold|umbral/i.test(act.name)) addScores(scores, { 'Tempo Run': 90 });
    if (act.name && /fartlek/i.test(act.name)) addScores(scores, { Fartlek: 120 });
    if (act.name && /interval|series|repeats?/i.test(act.name)) addScores(scores, { Intervals: 120 });
    if (act.name && /long run|tirada|fondo/i.test(act.name)) addScores(scores, { 'Long Run': 120 });
    if (act.name && /recovery|easy|suave|regenerativo/i.test(act.name)) addScores(scores, { 'Recovery Run': 120, 'Easy Run': 40 });

    if (distKm >= 24) addScores(scores, { 'Long Run': 180, Race: 40, 'Recovery Run': -20 });
    else if (distKm >= 16) addScores(scores, { 'Long Run': 140, 'Easy Run': 40 });
    else if (distKm >= 10) addScores(scores, { 'Long Run': 60, 'Easy Run': 35, 'Tempo Run': 15 });
    else if (distKm >= 6) addScores(scores, { 'Easy Run': 45, 'Tempo Run': 20 });
    else if (distKm >= 3) addScores(scores, { 'Recovery Run': 55, 'Easy Run': 30, 'Long Run': -35 });
    else addScores(scores, { 'Recovery Run': 65, 'Easy Run': 20, 'Long Run': -70 });

    if (elevationPerKm > 45) addScores(scores, { 'Hill Repeats': 160, 'Trail Run': 120, Race: -20 });
    else if (elevationPerKm > 25) addScores(scores, { 'Hill Repeats': 100, 'Trail Run': 70, 'Tempo Run': -10 });
    else if (elevationPerKm > 12) addScores(scores, { 'Trail Run': 35, 'Hill Repeats': 25 });
    else addScores(scores, { 'Trail Run': -10, 'Hill Repeats': -20 });

    if (moveRatio < 0.65) addScores(scores, { 'Trail Run': 40, Fartlek: 20, Intervals: 15, Race: -25 });
    else if (moveRatio < 0.8) addScores(scores, { 'Trail Run': 18, Fartlek: 10 });

    if (effortNorm > 0.78) addScores(scores, { Race: 90, Intervals: 70, 'Tempo Run': 35, 'Recovery Run': -50, 'Easy Run': -35 });
    else if (effortNorm > 0.55) addScores(scores, { 'Tempo Run': 65, Fartlek: 35, 'Long Run': 30, Race: 20 });
    else if (effortNorm > 0.25) addScores(scores, { 'Easy Run': 45, 'Long Run': 20 });
    else addScores(scores, { 'Recovery Run': 85, 'Easy Run': 45, Race: -35 });

    if (featureAvailability.hrZones) {
        if (pctZ.low > 68) addScores(scores, { 'Recovery Run': 130, 'Easy Run': 80, Intervals: -35, Race: -40, 'Tempo Run': -20 });
        if (pctZ.low < 25) addScores(scores, { 'Recovery Run': -50, 'Easy Run': -35, 'Long Run': -20 });

        if (pctZ.midlow > 45) addScores(scores, { 'Easy Run': 50, 'Long Run': 60, 'Tempo Run': 20 });
        if (pctZ.midhigh > 35) addScores(scores, { 'Tempo Run': 95, Fartlek: 55, Intervals: 35, 'Recovery Run': -30 });
        if (pctZ.high > 25) addScores(scores, { Intervals: 90, Race: 95, Fartlek: 45, 'Recovery Run': -55, 'Easy Run': -40 });
        if (pctZ.high < 10) addScores(scores, { Race: -30, Intervals: -20, 'Recovery Run': 25 });

        if (pctZ.high > 20 && pctZ.midhigh > 20) addScores(scores, { Fartlek: 40, Intervals: 20 });
        if (pctZ.high < 8 && pctZ.low > 75) addScores(scores, { 'Recovery Run': 95, 'Easy Run': 40 });
    }

    if (paceCV > 24) addScores(scores, { Intervals: 120, Fartlek: 90, 'Progressive Run': -25 });
    else if (paceCV > 14) addScores(scores, { Fartlek: 55, Intervals: 25, 'Progressive Run': 20 });
    else if (paceCV < 6 && distKm >= 8) addScores(scores, { 'Tempo Run': 35, Race: 40, 'Recovery Run': -15 });

    if (distKm >= 8 && hasNegativeSplit) {
        if (negativeSplitRatio < 0.95) addScores(scores, { 'Progressive Run': 120, 'Tempo Run': 30, Race: 15 });
        else if (negativeSplitRatio < 1.0) addScores(scores, { 'Progressive Run': 65, 'Tempo Run': 15 });
        else if (negativeSplitRatio > 1.08) addScores(scores, { 'Progressive Run': -55, Race: -20, 'Recovery Run': 15 });
    }

    if (hrCV > 11 && featureAvailability.hrStream) addScores(scores, { Intervals: 30, Fartlek: 20 });
    if (hrCV < 5 && featureAvailability.hrStream && distKm > 8) addScores(scores, { 'Tempo Run': 20, 'Long Run': 10 });

    const positives = Object.entries(scores)
        .map(([type, sc]) => ({ type, abs: Math.max(0, Math.round(sc)) }))
        .filter(r => r.abs > 0)
        .sort((a, b) => b.abs - a.abs);

    const fallback = positives.length
        ? positives
        : [{ type: distKm >= 12 ? 'Long Run' : 'Easy Run', abs: 100 }];

    const positiveTotal = sum(fallback.map(r => r.abs)) || 1;
    const results = fallback.map(r => ({
        type: r.type,
        abs: r.abs,
        pct: +((r.abs / positiveTotal) * 100).toFixed(1)
    }));

    const confidence = computeConfidence(results.slice(0, 5), featureAvailability);

    return {
        top: results.slice(0, 5),
        all: results,
        confidence,
        diagnostics: {
            distKm: +distKm.toFixed(2),
            paceAvgMinKm: +paceAvgMinKm.toFixed(2),
            paceCV: +paceCV.toFixed(1),
            hrAvg,
            hrCV: +hrCV.toFixed(1),
            effortNorm: +effortNorm.toFixed(2),
            elevationPerKm: +elevationPerKm.toFixed(1),
            moveRatio: +moveRatio.toFixed(2),
            pctZ,
            negativeSplitRatio: +negativeSplitRatio.toFixed(2),
            featureAvailability,
            paceSamples: paceStream.length,
            hrSamples: Array.isArray(hrSamples) ? hrSamples.length : 0,
            zonesCount: zoneDefs.length
        }
    };
};