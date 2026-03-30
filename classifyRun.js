// =================================================================
//          RUN TYPE CLASSIFIER (SIMPLIFIED + ROBUST)
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

    // Reduced class set:
    // - Easy/Recovery (merged)
    // - Speed Work (Intervals + Fartlek merged)
    // - Progressive removed
    function emptyScores() {
        return {
            'Easy/Recovery Run': 0,
            'Long Run': 0,
            'Tempo Run': 0,
            'Speed Work': 0,
            Race: 0,
            'Trail/Hills': 0
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
        if (!zones.length || !Array.isArray(hrData) || !Array.isArray(timeData)) return pctZ;

        const n = Math.min(hrData.length, timeData.length);
        if (n < 2) return pctZ;

        const tPerZone = Array(zones.length).fill(0);
        for (let i = 1; i < n; i++) {
            const dt = timeData[i] - timeData[i - 1];
            const hr = Number(hrData[i]);
            if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(hr) || hr <= 0) continue;
            const idx = zones.findIndex(z => hr >= z.min && (z.max === -1 || hr < z.max));
            if (idx >= 0) tPerZone[idx] += dt;
            else if (hr >= zones[zones.length - 1].min) tPerZone[zones.length - 1] += dt;
        }

        const total = sum(tPerZone) || 1;
        const ratios = tPerZone.map(t => t / total * 100);

        if (ratios.length >= 5) {
            pctZ.low = (ratios[0] || 0) + (ratios[1] || 0);
            pctZ.midlow = ratios[2] || 0;
            pctZ.midhigh = ratios[3] || 0;
            pctZ.high = ratios.slice(4).reduce((a, b) => a + b, 0);
        } else if (ratios.length === 4) {
            pctZ.low = ratios[0] || 0;
            pctZ.midlow = ratios[1] || 0;
            pctZ.midhigh = ratios[2] || 0;
            pctZ.high = ratios[3] || 0;
        } else if (ratios.length === 3) {
            pctZ.low = ratios[0] || 0;
            pctZ.midlow = ratios[1] || 0;
            pctZ.high = ratios[2] || 0;
        } else if (ratios.length === 2) {
            pctZ.low = ratios[0] || 0;
            pctZ.high = ratios[1] || 0;
        } else {
            pctZ.midlow = ratios[0] || 0;
        }

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
    const durationMin = movingTime / 60;

    // Name/workout hints
    if (act.sport_type === 'TrailRun') addScores(scores, { 'Trail/Hills': 220 });
    if (act.workout_type === 1) addScores(scores, { Race: 280 });

    if (act.name && /tempo|threshold|umbral/i.test(act.name)) addScores(scores, { 'Tempo Run': 180 });
    if (act.name && /fartlek|interval|series|repeats?|vo2|max/i.test(act.name)) addScores(scores, { 'Speed Work': 190 });
    if (act.name && /long run|tirada|fondo/i.test(act.name)) addScores(scores, { 'Long Run': 160 });
    if (act.name && /recovery|easy|suave|regenerativo/i.test(act.name)) addScores(scores, { 'Easy/Recovery Run': 170 });
    if (act.name && /race|carrera|competition|test/i.test(act.name)) addScores(scores, { Race: 220 });

    // Distance + duration
    if (distKm >= 24 || durationMin >= 140) addScores(scores, { 'Long Run': 210, 'Easy/Recovery Run': -10 });
    else if (distKm >= 16 || durationMin >= 95) addScores(scores, { 'Long Run': 160, 'Tempo Run': 25 });
    else if (distKm >= 10 || durationMin >= 60) addScores(scores, { 'Long Run': 70, 'Tempo Run': 45 });
    else if (distKm <= 4 && durationMin <= 30) addScores(scores, { 'Easy/Recovery Run': 60, 'Speed Work': 30 });

    // Terrain
    if (elevationPerKm > 45) addScores(scores, { 'Trail/Hills': 190, 'Speed Work': 20, Race: -20 });
    else if (elevationPerKm > 25) addScores(scores, { 'Trail/Hills': 130, 'Tempo Run': -10 });
    else if (elevationPerKm > 12) addScores(scores, { 'Trail/Hills': 60 });
    else addScores(scores, { 'Trail/Hills': -15 });

    // Moving ratio (many stops tends away from pure tempo/race)
    if (moveRatio < 0.7) addScores(scores, { 'Trail/Hills': 35, 'Speed Work': 20, Race: -20 });
    else if (moveRatio > 0.95) addScores(scores, { 'Tempo Run': 35, Race: 20 });

    // Effort signal (strong driver)
    if (effortNorm >= 0.82) addScores(scores, { 'Speed Work': 120, Race: 90, 'Tempo Run': 40, 'Easy/Recovery Run': -70 });
    else if (effortNorm >= 0.62) addScores(scores, { 'Tempo Run': 100, 'Speed Work': 55, Race: 25, 'Long Run': 20 });
    else if (effortNorm >= 0.35) addScores(scores, { 'Easy/Recovery Run': 35, 'Long Run': 25, 'Tempo Run': 15 });
    else addScores(scores, { 'Easy/Recovery Run': 130, Race: -40, 'Speed Work': -40 });

    // Pace variability and pace level
    if (paceCV > 20) addScores(scores, { 'Speed Work': 155, 'Tempo Run': -20 });
    else if (paceCV > 12) addScores(scores, { 'Speed Work': 70, 'Tempo Run': 35 });
    else if (paceCV < 7 && distKm >= 6) addScores(scores, { 'Tempo Run': 100, Race: 35, 'Easy/Recovery Run': -20 });

    if (paceAvgMinKm > 0) {
        if (paceAvgMinKm <= 4.1 && distKm >= 5) addScores(scores, { Race: 70, 'Tempo Run': 60, 'Speed Work': 20 });
        else if (paceAvgMinKm <= 4.45 && distKm >= 6) addScores(scores, { 'Tempo Run': 55, Race: 20 });
        else if (paceAvgMinKm >= 5.7 && effortNorm < 0.5) addScores(scores, { 'Easy/Recovery Run': 55 });
    }

    // HR zones if available
    if (featureAvailability.hrZones) {
        if (pctZ.low >= 70) addScores(scores, { 'Easy/Recovery Run': 120, 'Long Run': 30, 'Speed Work': -50, Race: -45 });
        if (pctZ.midhigh >= 33) addScores(scores, { 'Tempo Run': 110, 'Speed Work': 40, 'Easy/Recovery Run': -25 });
        if (pctZ.high >= 20) addScores(scores, { 'Speed Work': 120, Race: 80, 'Tempo Run': 30, 'Easy/Recovery Run': -60 });
        if (pctZ.high < 8 && pctZ.low > 65) addScores(scores, { 'Easy/Recovery Run': 55, Race: -20, 'Speed Work': -20 });
    }

    // HR variability signal
    if (featureAvailability.hrStream) {
        if (hrCV > 10) addScores(scores, { 'Speed Work': 35 });
        if (hrCV < 5 && distKm >= 8) addScores(scores, { 'Tempo Run': 25, 'Long Run': 10 });
    }

    // Negative split supports tempo/race (instead of a dedicated progressive class)
    if (distKm >= 8 && hasNegativeSplit) {
        if (negativeSplitRatio < 0.97) addScores(scores, { 'Tempo Run': 60, Race: 30, 'Long Run': 20 });
        else if (negativeSplitRatio > 1.08) addScores(scores, { 'Easy/Recovery Run': 25, Race: -20, 'Tempo Run': -15 });
    }

    const positives = Object.entries(scores)
        .map(([type, sc]) => ({ type, abs: Math.max(0, Math.round(sc)) }))
        .filter(r => r.abs > 0)
        .sort((a, b) => b.abs - a.abs);

    const fallback = positives.length
        ? positives
        : [{ type: distKm >= 12 ? 'Long Run' : 'Easy/Recovery Run', abs: 100 }];

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
            durationMin: +durationMin.toFixed(1),
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