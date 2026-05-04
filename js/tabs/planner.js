// js/planner.js - Race Predictor and Performance Analyzer
// Enhanced with PB display, ±3-5% margin bands, VDOT model, and improved prediction logic

import * as utils from './utils.js';

const TARGET_DISTANCES = [
    { name: 'Mile', km: 1.609, margin: 0.04 },
    { name: '5K', km: 5, margin: 0.04 },
    { name: '10K', km: 10, margin: 0.04 },
    { name: '15K', km: 15, margin: 0.05 },
    { name: 'Half Marathon', km: 21.097, margin: 0.05 },
    { name: '30K', km: 30, margin: 0.05 },
    { name: 'Marathon', km: 42.195, margin: 0.05 }
];

const HISTORY_DISTANCE_OPTIONS = TARGET_DISTANCES.filter(distance =>
    [1.609, 5, 10, 21.097, 42.195].includes(distance.km)
);

const HISTORY_COLOR_PALETTE = ['#0B6E4F', '#D35400', '#1F618D', '#B03A2E', '#6C3483', '#117864'];

// =====================================================
// TRAINING READINESS REFERENCE DATA
// Based on established training literature for each distance.
// Each level has: weeklyKm range, longRunKm range, daysPerWeek range
// =====================================================

const READINESS_REFERENCES = [
    {
        name: 'Mile',
        km: 1.609,
        levels: [
            { label: 'Beginner', weeklyKm: [20, 40], longRunKm: [6, 8], daysPerWeek: [3, 4] },
            { label: 'Intermediate', weeklyKm: [40, 65], longRunKm: [8, 10], daysPerWeek: [4, 5] },
            { label: 'Advanced', weeklyKm: [65, 130], longRunKm: [10, 14], daysPerWeek: [5, 7] }
        ],
        planWeeks: [6, 12],
        keyFactors: 'Speed sessions, track intervals, lactate tolerance'
    },
    {
        name: '5K',
        km: 5,
        levels: [
            { label: 'Beginner', weeklyKm: [15, 25], longRunKm: [8, 10], daysPerWeek: [3, 4] },
            { label: 'Intermediate', weeklyKm: [25, 50], longRunKm: [10, 13], daysPerWeek: [4, 5] },
            { label: 'Advanced', weeklyKm: [50, 80], longRunKm: [13, 16], daysPerWeek: [5, 6] }
        ],
        planWeeks: [6, 10],
        keyFactors: 'Intervals 400-1000m, tempo runs, aerobic base'
    },
    {
        name: '10K',
        km: 10,
        levels: [
            { label: 'Beginner', weeklyKm: [20, 40], longRunKm: [10, 13], daysPerWeek: [3, 4] },
            { label: 'Intermediate', weeklyKm: [40, 65], longRunKm: [13, 16], daysPerWeek: [4, 5] },
            { label: 'Advanced', weeklyKm: [65, 96], longRunKm: [16, 19], daysPerWeek: [5, 6] }
        ],
        planWeeks: [8, 12],
        keyFactors: 'Threshold work, 1000m repeats, progressive long runs'
    },
    {
        name: 'Half Marathon',
        km: 21.097,
        levels: [
            { label: 'Beginner', weeklyKm: [20, 30], longRunKm: [13, 16], daysPerWeek: [3, 4] },
            { label: 'Intermediate', weeklyKm: [30, 50], longRunKm: [16, 18], daysPerWeek: [4, 5] },
            { label: 'Advanced', weeklyKm: [50, 70], longRunKm: [18, 21], daysPerWeek: [5, 6] }
        ],
        planWeeks: [10, 16],
        keyFactors: 'Progressive long runs (max ~18-20km), tempo at HM pace, volume build'
    },
    {
        name: 'Marathon',
        km: 42.195,
        levels: [
            { label: 'Beginner', weeklyKm: [25, 40], longRunKm: [18, 22], daysPerWeek: [4, 5] },
            { label: 'Intermediate', weeklyKm: [40, 65], longRunKm: [22, 27], daysPerWeek: [5, 6] },
            { label: 'Advanced', weeklyKm: [65, 95], longRunKm: [27, 32], daysPerWeek: [5, 7] }
        ],
        planWeeks: [12, 20],
        keyFactors: 'High volume, long runs 26-32km, marathon pace sessions, gradual taper'
    }
];

const READINESS_ANALYSIS_WEEKS = 8; // Analyze last 8 weeks of training

// =====================================================
// MAIN EXPORT - RENDERS THE TAB
// =====================================================

export function renderPlannerTab(allActivities) {
    const runs = allActivities
        .filter(a => a.type && a.type.includes('Run'))
        .slice()
        .sort((left, right) => new Date(left.start_date_local || 0) - new Date(right.start_date_local || 0));

    // Render PB section first
    renderPersonalBestsSection(runs);

    // Render Training Readiness section
    renderTrainingReadinessSection(runs);

    initializePredictionHistoryControls(runs);

    // Wire up controls - they live in the HTML
    const updateBtn = document.getElementById('update-predictions-btn');
    const moodRadios = document.querySelectorAll('input[name="prediction-mood"]');
    const sliders = document.querySelectorAll('.model-weight-slider');

    function updateUI() {
        // Sync displayed percentages from sliders
        document.querySelectorAll('.model-weight-slider').forEach(s => {
            const valEl = document.getElementById(`${s.id}-val`);
            if (valEl) valEl.textContent = `${s.value}%`;
        });
        updatePredictions(runs);
    }

    sliders.forEach(s => s.addEventListener('input', updateUI));
    if (updateBtn) updateBtn.addEventListener('click', updateUI);
    moodRadios.forEach(r => r.addEventListener('change', updateUI));

    updateUI();
}

// =====================================================
// PERSONAL BESTS SECTION
// =====================================================

function renderPersonalBestsSection(runs) {
    const container = document.getElementById('pb-section');
    if (!container) {
        const predictionsDiv = document.getElementById('riegel-predictions');
        if (predictionsDiv) {
            const pbDiv = document.createElement('div');
            pbDiv.id = 'pb-section';
            pbDiv.className = 'chart-container';
            predictionsDiv.parentNode.insertBefore(pbDiv, predictionsDiv);
        } else {
            return;
        }
    }

    // Use tight ±3-5% margin to find races that are actually close to target distance
    const targetDistances = [
        { name: 'Mile', km: 1.609, margin: 0.04 },
        { name: '5K', km: 5, margin: 0.04 },
        { name: '10K', km: 10, margin: 0.04 },
        { name: '21K (Half Marathon)', km: 21.097, margin: 0.05 },
        { name: 'Marathon', km: 42.195, margin: 0.05 }
    ];

    const pbs = getPBsWithMargin(runs, targetDistances);
    const allBests = getBestPerformances(runs);

    let pbRows = targetDistances.map(target => {
        const pb = pbs.find(p => Math.abs(p.km - target.km) < 0.1);
        if (!pb || !pb.time) {
            return `<tr><td>${target.name}</td><td colspan="4" style="text-align:center; color:#999;">No PB recorded</td></tr>`;
        }

        // Adjust time to exactly target distance (pace * target_km) for fair comparison
        const adjustedTime = (pb.time / pb.distance) * target.km;
        const timeStr = utils.formatTime(adjustedTime);
        const pace = utils.formatPace(adjustedTime, target.km);
        const dateStr = pb.date ? new Date(pb.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

        // Get top 3 times for this distance
        const topTimes = allBests[target.km] ? allBests[target.km].slice(0, 3) : [];
        let topTimesHTML = '';
        if (topTimes.length > 1) {
            topTimesHTML = `<details style="cursor: pointer; user-select: none;">
                <summary style="color: #666; font-size: 0.85em; margin-top: 0.3rem;">📊 Top 3 times</summary>
                <div style="margin-top: 0.3rem; padding-left: 1rem; font-size: 0.85em; color: #888;">
                    ${topTimes.map((t, i) => {
                const tTime = (t.seconds / t.km) * target.km;
                const tPace = utils.formatPace(tTime, target.km);
                return `<div>#${i + 1}: ${utils.formatTime(tTime)} (${tPace})</div>`;
            }).join('')}
                </div>
            </details>`;
        }

        return `<tr>
            <td><strong>${target.name}</strong></td>
            <td>${timeStr}</td>
            <td>${pace}</td>
            <td style="font-size:0.82em; color:#999;">${dateStr} · ${pb.runs} runs${topTimesHTML}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <h3>🏆 Personal Bests</h3>
        <p style="font-size:0.9em; color:#666; margin-bottom:1rem;">Your fastest races at each distance (±3-5% search margin).</p>
        <div style="overflow-x:auto;">
        <table class="df-table">
            <thead>
                <tr><th>Distance</th><th>Best Time</th><th>Pace</th><th>Details</th></tr>
            </thead>
            <tbody>${pbRows}</tbody>
        </table>
        </div>
    `;
}

function getPBsWithMargin(allRuns, targetDistances) {
    const pbs = [];
    for (const { km, margin } of targetDistances) {
        const min = km * (1 - margin), max = km * (1 + margin);
        const candidates = allRuns
            .map(r => {
                const distance = r.distance / 1000;
                const seconds = r.moving_time;
                // Pace normalised to target distance so we compare fairly across slightly different race lengths
                const normPace = seconds / distance;
                return { date: r.start_date_local, distance, seconds, pace: normPace, id: r.id };
            })
            .filter(r => r.distance >= min && r.distance <= max && r.seconds > 0 && r.pace > 0);

        if (candidates.length === 0) continue;

        candidates.sort((a, b) => a.pace - b.pace);
        const best = candidates[0];
        pbs.push({
            km,
            time: best.seconds,
            pace: best.pace,
            date: best.date,
            runs: candidates.length,
            distance: best.distance  // keep actual distance for time-normalisation
        });
    }
    return pbs;
}

// =====================================================
// IMPROVED PREDICTION LOGIC
// =====================================================

let paceChartInstance = null;
let predictionHistoryChartInstance = null;

function updatePredictions(runs) {
    const container = document.getElementById('riegel-predictions');
    if (!container) return;

    if (!runs || runs.length === 0) {
        container.innerHTML = '<p>No running data available to make predictions.</p>';
        return;
    }

    const mood = document.querySelector('input[name="prediction-mood"]:checked')?.value || 'realistic';
    const weights = {
        riegel: parseFloat(document.getElementById('riegel-weight')?.value ?? 30),
        ml: parseFloat(document.getElementById('ml-weight')?.value ?? 20),
        pb: parseFloat(document.getElementById('pb-weight')?.value ?? 20),
        vdot: parseFloat(document.getElementById('vdot-weight')?.value ?? 15),
        readiness: parseFloat(document.getElementById('readiness-weight')?.value ?? 15),
    };

    // Normalize weights so they always sum to 100
    const totalW = Object.values(weights).reduce((s, v) => s + v, 0);
    if (totalW > 0) {
        for (const k of Object.keys(weights)) weights[k] = weights[k] / totalW * 100;
    }

    const bests = getBestPerformances(runs);
    const model = trainPersonalizedModel(bests);
    const vdot = estimateVDOT(runs);
    const trainingData = analyzeRecentTraining(runs);
    const readinessScores = assessReadiness(trainingData);
    const finalPredictions = calculateAllPredictions(bests, model, vdot, { mood, weights }, readinessScores);

    renderResultsTableAndChart(container, finalPredictions, bests);
    updatePredictionHistory(runs);
}

// =====================================================
// VDOT MODEL (Daniels' Running Formula)
// =====================================================

/**
 * Estimate VDOT from the athlete's best recent performances.
 * Uses Jack Daniels' formula: VDOT = V / (0.182258 * (km*1000/t) + 0.000104 * ((km*1000/t)^2) - 4.6...)
 * Simplified: we use the inverse — given a race time, compute VDOT, then predict other distances.
 */
function estimateVDOT(allRuns) {
    // Use Daniels' percent VO2max curve: %VO2max = 0.8 + 0.1894393*e^(-0.012778*t) + 0.2989558*e^(-0.1932605*t)
    // where t is time in minutes. Then VDOT = VO2 / %VO2max
    // VO2 (ml/kg/min) from velocity: VO2 = -4.60 + 0.182258*v + 0.000104*v^2  (v in m/min)
    const candidateRaces = allRuns
        .filter(r => r.distance >= 3000 && r.moving_time > 0)
        .map(r => {
            const distM = r.distance;
            const tMin = r.moving_time / 60;
            const v = distM / tMin; // m/min
            const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
            const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
            const vdot = pct > 0 ? vo2 / pct : 0;
            return { vdot, distKm: distM / 1000, tMin };
        })
        .filter(r => r.vdot > 10 && r.vdot < 100);

    if (candidateRaces.length === 0) return null;

    // Use the top 3 races by VDOT and average to reduce noise
    candidateRaces.sort((a, b) => b.vdot - a.vdot);
    const top = candidateRaces.slice(0, Math.min(5, candidateRaces.length));
    const avgVdot = top.reduce((s, r) => s + r.vdot, 0) / top.length;
    return avgVdot;
}

/**
 * Given a VDOT, predict finish time for a given distance (km) using Daniels' tables
 * approximated with Newton's method: find t such that VDOT(t, dist) == vdot.
 */
function vdotPredict(vdot, km) {
    if (!vdot || vdot <= 0) return null;
    const distM = km * 1000;
    let tMin = (distM / 1000) * 4.5; // initial guess: 4:30/km
    for (let i = 0; i < 50; i++) {
        const v = distM / tMin;
        const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
        const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
        const f = pct > 0 ? vo2 / pct - vdot : -vdot;
        // Derivative (numerical)
        const dt = 0.001;
        const tMin2 = tMin + dt;
        const v2 = distM / tMin2;
        const vo2_2 = -4.60 + 0.182258 * v2 + 0.000104 * v2 * v2;
        const pct2 = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin2) + 0.2989558 * Math.exp(-0.1932605 * tMin2);
        const f2 = pct2 > 0 ? vo2_2 / pct2 - vdot : -vdot;
        const df = (f2 - f) / dt;
        if (Math.abs(df) < 1e-10) break;
        tMin = tMin - f / df;
        if (tMin < 0.1) tMin = 0.1;
    }
    return tMin * 60; // return seconds
}

function calculateAllPredictions(bestPerformances, model, vdot, settings, readinessScores) {
    const moodSettings = {
        optimistic: { start: 0.0, end: 0.40 },
        realistic: { start: 0.25, end: 0.75 },
        conservative: { start: 0.60, end: 1.0 }
    };
    const trim = moodSettings[settings.mood];

    // Max penalty by distance (longer = more affected by under-training)
    const READINESS_MAX_PENALTY = {
        1.609: 0.05,   // Mile: max 5% slower if unprepared
        5: 0.08,       // 5K: max 8%
        10: 0.12,      // 10K: max 12%
        15: 0.15,      // 15K: max 15%
        21.097: 0.18,  // Half: max 18%
        30: 0.22,      // 30K: max 22%
        42.195: 0.25   // Marathon: max 25%
    };

    return TARGET_DISTANCES.map(target => {
        let allPredictions = [];

        // Riegel formula prediction
        Object.values(bestPerformances).flat().forEach(perf => {
            if (Math.abs(perf.km - target.km) < 0.1) return;
            const predSec = perf.seconds * Math.pow(target.km / perf.km, 1.06);
            allPredictions.push({ time: predSec, weight: settings.weights.riegel / 100, source: 'Riegel' });
        });

        // ML model prediction
        if (model) {
            const logKm = Math.log(target.km);
            const mlTime = model.a + model.b * logKm + model.c * logKm ** 2;
            if (isFinite(mlTime) && mlTime > 0) {
                allPredictions.push({ time: mlTime, weight: settings.weights.ml / 100, source: 'ML Curve' });
            }
        }

        // PB-based prediction
        if (bestPerformances[target.km]) {
            bestPerformances[target.km].forEach(perf => {
                allPredictions.push({ time: perf.seconds, weight: settings.weights.pb / 100, source: 'Exact PB' });
            });
        }

        // VDOT / Daniels prediction
        if (vdot) {
            const vdotTime = vdotPredict(vdot, target.km);
            if (vdotTime && isFinite(vdotTime) && vdotTime > 0) {
                allPredictions.push({ time: vdotTime, weight: settings.weights.vdot / 100, source: 'VDOT' });
            }
        }

        // Training Readiness prediction
        // Uses the other models' median as baseline, then applies a penalty based on readiness score
        if (readinessScores && settings.weights.readiness > 0) {
            const readinessForDist = readinessScores.find(r => Math.abs(r.km - target.km) < 0.5);
            if (readinessForDist && allPredictions.length > 0) {
                // Use median of existing predictions as baseline
                const sortedTimes = allPredictions.map(p => p.time).sort((a, b) => a - b);
                const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
                // Penalty: 0% at score=100, maxPenalty% at score=0
                const maxPenalty = READINESS_MAX_PENALTY[target.km] || 0.15;
                const penalty = (1 - readinessForDist.score / 100) * maxPenalty;
                const readinessTime = medianTime * (1 + penalty);
                allPredictions.push({ time: readinessTime, weight: settings.weights.readiness / 100, source: 'Readiness' });
            }
        }

        if (allPredictions.length === 0) {
            return {
                ...target,
                combined: null,
                confidence: 0,
                low: null,
                high: null,
                sources: []
            };
        }

        allPredictions.sort((a, b) => a.time - b.time);
        const startIndex = Math.floor(allPredictions.length * trim.start);
        const endIndex = Math.ceil(allPredictions.length * trim.end);
        const trimmed = allPredictions.slice(startIndex, endIndex);

        if (trimmed.length === 0) {
            return {
                ...target,
                combined: null,
                confidence: 0,
                low: null,
                high: null,
                sources: []
            };
        }

        const totalWeight = trimmed.reduce((sum, p) => sum + p.weight, 0);
        if (totalWeight === 0) {
            return {
                ...target,
                combined: null,
                confidence: 0,
                low: null,
                high: null,
                sources: []
            };
        }

        const combinedTime = trimmed.reduce((sum, p) => sum + p.time * p.weight, 0) / totalWeight;
        const lowTime = trimmed[0].time;
        const highTime = trimmed[trimmed.length - 1].time;

        // Improved confidence calculation
        let confidence = 60;
        const actualBest = bestPerformances[target.km] ? bestPerformances[target.km][0].seconds : null;

        if (actualBest) {
            const predictedTime = combinedTime;
            if (predictedTime <= actualBest) {
                const diff = (actualBest - predictedTime) / actualBest;
                confidence = Math.max(50, Math.min(95, 70 + (diff * 200)));
            } else {
                const diff = (predictedTime - actualBest) / actualBest;
                confidence = Math.max(50, Math.min(90, 85 - (diff * 150)));
            }
        } else {
            const sourceCount = Object.values(bestPerformances).flat().length;
            confidence = Math.min(75, 40 + sourceCount * 5);
        }

        // Collect sources
        const sources = [...new Set(trimmed.map(p => p.source))];

        return {
            ...target,
            combined: combinedTime,
            confidence: Math.round(confidence),
            low: lowTime,
            high: highTime,
            sources
        };
    });
}

function renderResultsTableAndChart(container, predictions, bests) {
    const rows = predictions.map(p => {
        if (!p.combined) {
            return `<tr><td>${p.name}</td><td colspan="3" style="text-align:center; color:#999;">No prediction available</td></tr>`;
        }

        const confidenceColor = p.confidence >= 80 ? '#28a745' : p.confidence >= 60 ? '#ffc107' : '#dc3545';
        const paceStr = utils.formatPace(p.combined, p.km);

        return `<tr>
            <td><strong>${p.name}</strong></td>
            <td>${utils.formatTime(p.combined)}</td>
            <td>${paceStr}</td>
            <td style="color: ${confidenceColor}; font-weight: bold;">${p.confidence}%</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <h3>🎯 Race Time Predictions</h3>
        <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1 1 400px; min-width: 300px; overflow-x:auto;">
                <table class="df-table">
                    <thead>
                        <tr><th>Distance</th><th>Predicted Time</th><th>Pace</th><th>Confidence</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div style="flex: 1 1 320px; min-width: 280px;">
                <div class="chart-wrapper" style="position: relative; height: 320px; width: 100%;">
                    <canvas id="prediction-pace-chart"></canvas>
                </div>
            </div>
        </div>
        <div class="disclaimer" style="font-size:0.85em; color:#666; margin-top:15px; padding:10px; background:#f5f5f5; border-radius:4px;">
            <strong>How predictions work:</strong> Combines 5 models — <em>Riegel</em> (exponential scaling from your PBs),
            <em>ML Curve</em> (quadratic fit on your race history), <em>Exact PB</em> (direct times for that distance),
            <em>VDOT</em> (Daniels' VO₂max-based formula), and <em>Training Readiness</em> (adjusts predictions based on
            your recent training volume, long runs, frequency and consistency). Weights are set in the controls above.
            <strong>Confidence</strong> is higher when models agree and you have more race data.
        </div>
    `;

    renderPaceChart(predictions);
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function solve3x3(A, B) {
    const det = A[0][0] * (A[1][1] * A[2][2] - A[2][1] * A[1][2]) -
        A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
        A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (det === 0) return null;
    const invDet = 1 / det;
    const adj = [
        [A[1][1] * A[2][2] - A[2][1] * A[1][2], A[0][2] * A[2][1] - A[0][1] * A[2][2], A[0][1] * A[1][2] - A[0][2] * A[1][1]],
        [A[1][2] * A[2][0] - A[1][0] * A[2][2], A[0][0] * A[2][2] - A[0][2] * A[2][0], A[0][2] * A[1][0] - A[0][0] * A[1][2]],
        [A[1][0] * A[2][1] - A[2][0] * A[1][1], A[2][0] * A[0][1] - A[0][0] * A[2][1], A[0][0] * A[1][1] - A[1][0] * A[0][1]]
    ];
    return [
        invDet * (adj[0][0] * B[0] + adj[0][1] * B[1] + adj[0][2] * B[2]),
        invDet * (adj[1][0] * B[0] + adj[1][1] * B[1] + adj[1][2] * B[2]),
        invDet * (adj[2][0] * B[0] + adj[2][1] * B[1] + adj[2][2] * B[2])
    ];
}

function getBestPerformances(allRuns) {
    // Tight margin (4-5%) so we only pick races that are actually that distance
    const bestPerformances = {};
    for (const { km, margin } of TARGET_DISTANCES) {
        const min = km * (1 - margin), max = km * (1 + margin);
        const candidates = allRuns
            .map(r => ({ ...r, km: r.distance / 1000, seconds: r.moving_time }))
            .filter(r => r.km >= min && r.km <= max && r.seconds > 0);
        if (candidates.length === 0) continue;
        // Sort by pace (s/km), best = lowest
        candidates.sort((a, b) => (a.seconds / a.km) - (b.seconds / b.km));
        bestPerformances[km] = candidates.slice(0, 3);
    }
    return bestPerformances;
}

function trainPersonalizedModel(bestPerformances) {
    const flatBests = Object.values(bestPerformances).flat();
    if (flatBests.length < 3) return null;
    const X = flatBests.map(r => Math.log(r.km));
    const Y = flatBests.map(r => r.seconds);
    let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0, sumY = 0, sumXY = 0, sumX2Y = 0;
    const n = X.length;
    for (let i = 0; i < n; i++) {
        const x = X[i], x2 = x * x, y = Y[i];
        sumX += x; sumX2 += x2; sumX3 += x2 * x; sumX4 += x2 * x2;
        sumY += y; sumXY += x * y; sumX2Y += x2 * y;
    }
    const A = [[n, sumX, sumX2], [sumX, sumX2, sumX3], [sumX2, sumX3, sumX4]];
    const B = [sumY, sumXY, sumX2Y];
    const coeffs = solve3x3(A, B);
    if (!coeffs) return null;
    return { a: coeffs[0], b: coeffs[1], c: coeffs[2] };
}

function renderPaceChart(predictions) {
    if (typeof Chart === 'undefined') return;
    const chartContainer = document.getElementById('prediction-pace-chart');
    if (!chartContainer) return;
    const ctx = chartContainer.getContext('2d');
    if (paceChartInstance) paceChartInstance.destroy();

    const validPredictions = predictions.filter(p => p.combined && p.low && p.high);
    if (validPredictions.length === 0) return;

    // Store pace as decimal minutes for Chart.js (will be formatted as mm:ss in callbacks)
    const toPace = (time, km) => (time / km) / 60;
    const mainPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.combined, p.km) }));
    const lowerPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.low, p.km) }));
    const upperPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.high, p.km) }));

    const formatPaceLabel = (decimal) => {
        const minutes = Math.floor(decimal);
        const seconds = Math.round((decimal - minutes) * 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
    };

    paceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Fastest Range',
                    data: lowerPaces,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(75, 192, 192, 0.15)',
                    pointRadius: 0,
                    fill: '+1'
                },
                {
                    label: 'Slowest Range',
                    data: upperPaces,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(75, 192, 192, 0.15)',
                    pointRadius: 0,
                    fill: '-1'
                },
                {
                    label: 'Predicted Pace',
                    data: mainPaces,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'transparent',
                    tension: 0.2,
                    fill: false,
                    pointRadius: 4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatPaceLabel(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Distance (km)' },
                    min: 0,
                    max: 45
                },
                y: {
                    reverse: true,
                    title: { display: true, text: 'Pace (min/km)' },
                    beginAtZero: false,
                    ticks: {
                        callback: (value) => formatPaceLabel(value)
                    }
                }
            }
        }
    });
}

function initializePredictionHistoryControls(runs) {
    const fromInput = document.getElementById('prediction-history-from');
    const toInput = document.getElementById('prediction-history-to');
    const granularitySelect = document.getElementById('prediction-history-granularity');
    const distancesSelect = document.getElementById('prediction-history-distances');
    const applyButton = document.getElementById('prediction-history-apply');
    const resetButton = document.getElementById('prediction-history-reset');

    if (!fromInput || !toInput || !granularitySelect || !distancesSelect || !applyButton || !resetButton) {
        return;
    }

    const sortedRuns = runs.filter(run => run.start_date_local).slice().sort((left, right) => new Date(left.start_date_local) - new Date(right.start_date_local));
    const minDate = sortedRuns[0]?.start_date_local?.slice(0, 10) || '';
    const maxDate = sortedRuns[sortedRuns.length - 1]?.start_date_local?.slice(0, 10) || '';

    if (!fromInput.dataset.initialized) {
        fromInput.dataset.initialized = 'true';
        fromInput.value = minDate;
        toInput.value = maxDate;
        fromInput.min = minDate;
        fromInput.max = maxDate;
        toInput.min = minDate;
        toInput.max = maxDate;

        const triggerUpdate = () => updatePredictionHistory(runs);
        applyButton.addEventListener('click', triggerUpdate);
        granularitySelect.addEventListener('change', triggerUpdate);
        distancesSelect.addEventListener('change', triggerUpdate);
        fromInput.addEventListener('change', triggerUpdate);
        toInput.addEventListener('change', triggerUpdate);

        resetButton.addEventListener('click', () => {
            fromInput.value = minDate;
            toInput.value = maxDate;
            granularitySelect.value = 'month';
            Array.from(distancesSelect.options).forEach(option => {
                option.selected = ['5', '10'].includes(option.value);
            });
            updatePredictionHistory(runs);
        });
    } else {
        fromInput.min = minDate;
        fromInput.max = maxDate;
        toInput.min = minDate;
        toInput.max = maxDate;
        if (!fromInput.value) fromInput.value = minDate;
        if (!toInput.value) toInput.value = maxDate;
    }
}

function updatePredictionHistory(runs) {
    const chartCanvas = document.getElementById('prediction-history-chart');
    const summary = document.getElementById('prediction-history-summary');
    if (!chartCanvas || !summary) return;

    const settings = readPredictionSettings();
    const filters = readPredictionHistoryFilters(runs);
    const filteredRuns = utils.filterActivitiesByDate(runs, filters.from, filters.to);

    if (filteredRuns.length < 2) {
        summary.textContent = 'Not enough runs in the selected date range to build an evolution chart.';
        destroyPredictionHistoryChart();
        return;
    }

    const historySeries = buildPredictionHistorySeries(filteredRuns, filters.granularity, settings, filters.selectedDistances);
    if (!historySeries.points.length || !historySeries.series.some(series => series.values.length > 0)) {
        summary.textContent = 'No historical predictions could be generated with the selected distances and date range.';
        destroyPredictionHistoryChart();
        return;
    }

    const selectedLabels = historySeries.series.map(series => series.name).join(', ');
    summary.textContent = `${historySeries.points.length} snapshots from ${filters.from || 'the beginning'} to ${filters.to || 'today'} · ${selectedLabels}`;
    renderPredictionHistoryChart(chartCanvas, historySeries);
}

function readPredictionSettings() {
    const mood = document.querySelector('input[name="prediction-mood"]:checked')?.value || 'realistic';
    const weights = {
        riegel: parseFloat(document.getElementById('riegel-weight')?.value ?? 30),
        ml: parseFloat(document.getElementById('ml-weight')?.value ?? 20),
        pb: parseFloat(document.getElementById('pb-weight')?.value ?? 20),
        vdot: parseFloat(document.getElementById('vdot-weight')?.value ?? 15),
        readiness: parseFloat(document.getElementById('readiness-weight')?.value ?? 15)
    };

    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
    if (totalWeight > 0) {
        Object.keys(weights).forEach(key => {
            weights[key] = (weights[key] / totalWeight) * 100;
        });
    }

    return { mood, weights };
}

function readPredictionHistoryFilters(runs) {
    const sortedRuns = runs.filter(run => run.start_date_local).slice().sort((left, right) => new Date(left.start_date_local) - new Date(right.start_date_local));
    const firstDate = sortedRuns[0]?.start_date_local?.slice(0, 10) || '';
    const lastDate = sortedRuns[sortedRuns.length - 1]?.start_date_local?.slice(0, 10) || '';
    const from = document.getElementById('prediction-history-from')?.value || firstDate;
    const to = document.getElementById('prediction-history-to')?.value || lastDate;
    const granularity = document.getElementById('prediction-history-granularity')?.value || 'month';
    const selectedDistances = Array.from(document.getElementById('prediction-history-distances')?.selectedOptions || [])
        .map(option => Number(option.value))
        .filter(value => Number.isFinite(value));

    return {
        from,
        to,
        granularity,
        selectedDistances: selectedDistances.length ? selectedDistances : [5, 10]
    };
}

function buildPredictionHistorySeries(runs, granularity, settings, selectedDistances) {
    const buckets = createHistoryBuckets(runs, granularity);
    const selectedDistanceSet = new Set(selectedDistances);
    const series = HISTORY_DISTANCE_OPTIONS
        .filter(distance => selectedDistanceSet.has(distance.km))
        .map((distance, index) => ({
            ...distance,
            color: HISTORY_COLOR_PALETTE[index % HISTORY_COLOR_PALETTE.length],
            values: [],
            lows: [],
            highs: []
        }));

    const points = [];
    buckets.forEach(bucket => {
        const runsUntilBucket = runs.filter(run => (run.start_date_local || '').slice(0, 10) <= bucket.endDate);
        if (runsUntilBucket.length < 2) return;

        const bests = getBestPerformances(runsUntilBucket);
        const model = trainPersonalizedModel(bests);
        const vdot = estimateVDOT(runsUntilBucket);
        // Compute readiness at this point in time (last 8 weeks relative to bucket end)
        const bucketEndDate = new Date(bucket.endDate);
        const bucketCutoff = new Date(bucketEndDate.getTime() - READINESS_ANALYSIS_WEEKS * 7 * 24 * 60 * 60 * 1000);
        const runsForReadiness = runsUntilBucket.filter(r => {
            const d = new Date(r.start_date_local);
            return d >= bucketCutoff && d <= bucketEndDate;
        });
        const bucketTrainingData = runsForReadiness.length > 0 ? analyzeRecentTrainingFromList(runsForReadiness) : null;
        const bucketReadiness = assessReadiness(bucketTrainingData);
        const predictions = calculateAllPredictions(bests, model, vdot, settings, bucketReadiness);
        const predictionByDistance = new Map(predictions.map(prediction => [prediction.km, prediction]));

        points.push(bucket.label);
        series.forEach(distanceSeries => {
            const prediction = predictionByDistance.get(distanceSeries.km);
            const combined = prediction?.combined ?? null;
            distanceSeries.values.push(combined);
            // Use a tight ±5% band around the combined prediction instead of the full model spread,
            // which can be extremely wide especially for marathon.
            distanceSeries.lows.push(combined !== null ? combined * 0.95 : null);
            distanceSeries.highs.push(combined !== null ? combined * 1.05 : null);
        });
    });

    // Apply a light rolling mean (window = 3) to smooth the series
    series.forEach(distanceSeries => {
        distanceSeries.values = rollingMean3(distanceSeries.values);
        distanceSeries.lows = rollingMean3(distanceSeries.lows);
        distanceSeries.highs = rollingMean3(distanceSeries.highs);
    });

    return { points, series };
}

function rollingMean3(arr) {
    return arr.map((value, index) => {
        const neighbours = [arr[index - 1], value, arr[index + 1]]
            .filter(element => element !== null && element !== undefined && Number.isFinite(element));
        return neighbours.length ? neighbours.reduce((sum, element) => sum + element, 0) / neighbours.length : null;
    });
}

function createHistoryBuckets(runs, granularity) {
    const buckets = new Map();
    runs.forEach(run => {
        const runDate = new Date(run.start_date_local);
        if (Number.isNaN(runDate.getTime())) return;

        const key = getHistoryBucketKey(runDate, granularity);
        if (!buckets.has(key)) {
            buckets.set(key, {
                key,
                endDate: run.start_date_local.slice(0, 10),
                label: formatHistoryBucketLabel(runDate, granularity)
            });
        } else {
            const bucket = buckets.get(key);
            const runDateStr = run.start_date_local.slice(0, 10);
            if (runDateStr > bucket.endDate) {
                bucket.endDate = runDateStr;
            }
        }
    });

    return Array.from(buckets.values()).sort((left, right) => left.endDate.localeCompare(right.endDate));
}

function getHistoryBucketKey(date, granularity) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (granularity === 'day') return `${year}-${month}-${day}`;
    if (granularity === 'week') return `${year}-W${String(utils.getISOWeek(date)).padStart(2, '0')}`;
    return `${year}-${month}`;
}

function formatHistoryBucketLabel(date, granularity) {
    if (granularity === 'day') {
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    if (granularity === 'week') {
        return `W${String(utils.getISOWeek(date)).padStart(2, '0')} ${date.getFullYear()}`;
    }
    return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

function renderPredictionHistoryChart(canvas, historySeries) {
    if (typeof Chart === 'undefined') return;
    const context = canvas.getContext('2d');
    destroyPredictionHistoryChart();

    const datasets = [];
    historySeries.series.forEach(series => {
        const rangeFillColor = `${series.color}22`;
        datasets.push({
            label: `${series.name} range low`,
            data: series.lows,
            borderColor: 'transparent',
            backgroundColor: rangeFillColor,
            pointRadius: 0,
            spanGaps: true,
            fill: '+1'
        });
        datasets.push({
            label: `${series.name} range high`,
            data: series.highs,
            borderColor: 'transparent',
            backgroundColor: rangeFillColor,
            pointRadius: 0,
            spanGaps: true,
            fill: '-1'
        });
        datasets.push({
            label: series.name,
            data: series.values,
            borderColor: series.color,
            backgroundColor: series.color,
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 2,
            pointHoverRadius: 4,
            spanGaps: true,
            fill: false
        });
    });

    predictionHistoryChartInstance = new Chart(context, {
        type: 'line',
        data: {
            labels: historySeries.points,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        filter: item => !item.text.includes('range low') && !item.text.includes('range high')
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${utils.formatTime(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Time' }
                },
                y: {
                    title: { display: true, text: 'Predicted time' },
                    ticks: {
                        callback: value => utils.formatTime(value)
                    }
                }
            }
        }
    });
}

function destroyPredictionHistoryChart() {
    if (predictionHistoryChartInstance) {
        predictionHistoryChartInstance.destroy();
        predictionHistoryChartInstance = null;
    }
}

// =====================================================
// TRAINING READINESS MODEL
// Evaluates how prepared the user is for each distance
// based on recent training patterns.
// =====================================================

function analyzeRecentTraining(runs) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - READINESS_ANALYSIS_WEEKS * 7 * 24 * 60 * 60 * 1000);

    const recentRuns = runs.filter(r => {
        const d = new Date(r.start_date_local);
        return d >= cutoff && d <= now;
    });

    if (recentRuns.length === 0) return null;

    // Group by week (Monday-start)
    const weekMap = new Map();
    recentRuns.forEach(r => {
        const d = new Date(r.start_date_local);
        const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayOfWeek);
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { totalKm: 0, longestRunKm: 0, runDays: new Set(), runs: [] });
        }
        const week = weekMap.get(weekKey);
        const distKm = (r.distance || 0) / 1000;
        week.totalKm += distKm;
        week.longestRunKm = Math.max(week.longestRunKm, distKm);
        week.runDays.add(d.toISOString().slice(0, 10));
        week.runs.push(r);
    });

    const weeks = Array.from(weekMap.values());
    if (weeks.length === 0) return null;

    // Compute averages and maximums
    const avgWeeklyKm = weeks.reduce((s, w) => s + w.totalKm, 0) / weeks.length;
    const maxWeeklyKm = Math.max(...weeks.map(w => w.totalKm));
    const avgLongRunKm = weeks.reduce((s, w) => s + w.longestRunKm, 0) / weeks.length;
    const maxLongRunKm = Math.max(...weeks.map(w => w.longestRunKm));
    const avgDaysPerWeek = weeks.reduce((s, w) => s + w.runDays.size, 0) / weeks.length;
    const consistency = weeks.filter(w => w.totalKm > 0).length / READINESS_ANALYSIS_WEEKS;

    // Trend: compare last 4 weeks vs prior 4 weeks
    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let trend = 0;
    if (sortedWeeks.length >= 4) {
        const mid = Math.floor(sortedWeeks.length / 2);
        const firstHalf = sortedWeeks.slice(0, mid).reduce((s, [, w]) => s + w.totalKm, 0) / mid;
        const secondHalf = sortedWeeks.slice(mid).reduce((s, [, w]) => s + w.totalKm, 0) / (sortedWeeks.length - mid);
        trend = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
    }

    // Count quality sessions (estimate: runs with pace < avg pace * 0.9 OR shorter intense efforts)
    const allPaces = recentRuns.filter(r => r.distance > 0 && r.moving_time > 0)
        .map(r => r.moving_time / (r.distance / 1000));
    const avgPace = allPaces.length > 0 ? allPaces.reduce((s, p) => s + p, 0) / allPaces.length : 0;
    const qualitySessions = recentRuns.filter(r => {
        if (!r.distance || !r.moving_time) return false;
        const pace = r.moving_time / (r.distance / 1000);
        return pace < avgPace * 0.92; // Faster than 92% of avg = quality
    }).length;
    const qualityPerWeek = qualitySessions / Math.max(1, weeks.length);

    return {
        weeksAnalyzed: weeks.length,
        totalRuns: recentRuns.length,
        avgWeeklyKm,
        maxWeeklyKm,
        avgLongRunKm,
        maxLongRunKm,
        avgDaysPerWeek,
        consistency,
        trend,
        qualityPerWeek
    };
}

/**
 * Same as analyzeRecentTraining but takes an already-filtered list of runs
 * (used for historical snapshots where "now" isn't the current date).
 */
function analyzeRecentTrainingFromList(recentRuns) {
    if (recentRuns.length === 0) return null;

    const weekMap = new Map();
    recentRuns.forEach(r => {
        const d = new Date(r.start_date_local);
        const dayOfWeek = (d.getDay() + 6) % 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayOfWeek);
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { totalKm: 0, longestRunKm: 0, runDays: new Set(), runs: [] });
        }
        const week = weekMap.get(weekKey);
        const distKm = (r.distance || 0) / 1000;
        week.totalKm += distKm;
        week.longestRunKm = Math.max(week.longestRunKm, distKm);
        week.runDays.add(d.toISOString().slice(0, 10));
        week.runs.push(r);
    });

    const weeks = Array.from(weekMap.values());
    if (weeks.length === 0) return null;

    const avgWeeklyKm = weeks.reduce((s, w) => s + w.totalKm, 0) / weeks.length;
    const maxWeeklyKm = Math.max(...weeks.map(w => w.totalKm));
    const avgLongRunKm = weeks.reduce((s, w) => s + w.longestRunKm, 0) / weeks.length;
    const maxLongRunKm = Math.max(...weeks.map(w => w.longestRunKm));
    const avgDaysPerWeek = weeks.reduce((s, w) => s + w.runDays.size, 0) / weeks.length;
    const consistency = weeks.filter(w => w.totalKm > 0).length / Math.max(1, weeks.length);

    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let trend = 0;
    if (sortedWeeks.length >= 4) {
        const mid = Math.floor(sortedWeeks.length / 2);
        const firstHalf = sortedWeeks.slice(0, mid).reduce((s, [, w]) => s + w.totalKm, 0) / mid;
        const secondHalf = sortedWeeks.slice(mid).reduce((s, [, w]) => s + w.totalKm, 0) / (sortedWeeks.length - mid);
        trend = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
    }

    const allPaces = recentRuns.filter(r => r.distance > 0 && r.moving_time > 0)
        .map(r => r.moving_time / (r.distance / 1000));
    const avgPace = allPaces.length > 0 ? allPaces.reduce((s, p) => s + p, 0) / allPaces.length : 0;
    const qualitySessions = recentRuns.filter(r => {
        if (!r.distance || !r.moving_time) return false;
        const pace = r.moving_time / (r.distance / 1000);
        return pace < avgPace * 0.92;
    }).length;
    const qualityPerWeek = qualitySessions / Math.max(1, weeks.length);

    return {
        weeksAnalyzed: weeks.length,
        totalRuns: recentRuns.length,
        avgWeeklyKm,
        maxWeeklyKm,
        avgLongRunKm,
        maxLongRunKm,
        avgDaysPerWeek,
        consistency,
        trend,
        qualityPerWeek
    };
}

function assessReadiness(trainingData) {
    if (!trainingData) return READINESS_REFERENCES.map(ref => ({ ...ref, score: 0, level: 'No data', details: [] }));

    return READINESS_REFERENCES.map(ref => {
        const scores = { volume: 0, longRun: 0, frequency: 0, consistency: 0, trend: 0 };
        let matchedLevel = 'Insufficient';
        let levelIndex = -1;

        // Score volume (avg weekly km) against each level
        for (let i = ref.levels.length - 1; i >= 0; i--) {
            const lvl = ref.levels[i];
            if (trainingData.avgWeeklyKm >= lvl.weeklyKm[0]) {
                levelIndex = i;
                matchedLevel = lvl.label;
                // How far into this level's range?
                const range = lvl.weeklyKm[1] - lvl.weeklyKm[0];
                const pos = Math.min(1, (trainingData.avgWeeklyKm - lvl.weeklyKm[0]) / (range || 1));
                scores.volume = ((i + pos) / ref.levels.length) * 100;
                break;
            }
        }
        if (levelIndex === -1) {
            // Below beginner threshold
            const beginner = ref.levels[0];
            scores.volume = Math.max(0, (trainingData.avgWeeklyKm / beginner.weeklyKm[0]) * 30);
        }

        // Score long run
        for (let i = ref.levels.length - 1; i >= 0; i--) {
            const lvl = ref.levels[i];
            if (trainingData.maxLongRunKm >= lvl.longRunKm[0]) {
                const range = lvl.longRunKm[1] - lvl.longRunKm[0];
                const pos = Math.min(1, (trainingData.maxLongRunKm - lvl.longRunKm[0]) / (range || 1));
                scores.longRun = ((i + pos) / ref.levels.length) * 100;
                break;
            }
        }
        if (scores.longRun === 0 && trainingData.maxLongRunKm > 0) {
            scores.longRun = Math.max(0, (trainingData.maxLongRunKm / ref.levels[0].longRunKm[0]) * 30);
        }

        // Score frequency
        for (let i = ref.levels.length - 1; i >= 0; i--) {
            const lvl = ref.levels[i];
            if (trainingData.avgDaysPerWeek >= lvl.daysPerWeek[0]) {
                const range = lvl.daysPerWeek[1] - lvl.daysPerWeek[0];
                const pos = Math.min(1, (trainingData.avgDaysPerWeek - lvl.daysPerWeek[0]) / (range || 1));
                scores.frequency = ((i + pos) / ref.levels.length) * 100;
                break;
            }
        }
        if (scores.frequency === 0 && trainingData.avgDaysPerWeek > 0) {
            scores.frequency = Math.max(0, (trainingData.avgDaysPerWeek / ref.levels[0].daysPerWeek[0]) * 30);
        }

        // Consistency score (0-100)
        scores.consistency = trainingData.consistency * 100;

        // Trend bonus/penalty (-15 to +15)
        scores.trend = Math.max(-15, Math.min(15, trainingData.trend * 50));

        // Weighted combined score
        const combined = (
            scores.volume * 0.35 +
            scores.longRun * 0.30 +
            scores.frequency * 0.15 +
            scores.consistency * 0.10 +
            scores.trend * 0.10 + 50 * 0.10 // baseline for trend
        );
        const finalScore = Math.max(0, Math.min(100, combined));

        // Build detail recommendations
        const details = [];
        const targetLevel = levelIndex >= 0 ? ref.levels[levelIndex] : ref.levels[0];

        if (trainingData.avgWeeklyKm < ref.levels[0].weeklyKm[0]) {
            details.push(`Volume too low: ${trainingData.avgWeeklyKm.toFixed(0)} km/wk vs ${ref.levels[0].weeklyKm[0]}+ km/wk needed`);
        }
        if (trainingData.maxLongRunKm < ref.levels[0].longRunKm[0]) {
            details.push(`Long run short: max ${trainingData.maxLongRunKm.toFixed(1)} km vs ${ref.levels[0].longRunKm[0]}+ km needed`);
        }
        if (trainingData.avgDaysPerWeek < ref.levels[0].daysPerWeek[0]) {
            details.push(`Low frequency: ${trainingData.avgDaysPerWeek.toFixed(1)} days/wk vs ${ref.levels[0].daysPerWeek[0]}+ recommended`);
        }
        if (trainingData.consistency < 0.7) {
            details.push(`Inconsistent: only ${(trainingData.consistency * 100).toFixed(0)}% of weeks active`);
        }
        if (trainingData.trend < -0.1) {
            details.push('Volume declining — consider rebuilding gradually');
        }
        if (finalScore >= 70 && trainingData.qualityPerWeek < 1.5) {
            details.push('Add more quality sessions (tempo/intervals) for race-specific fitness');
        }

        return {
            ...ref,
            score: Math.round(finalScore),
            level: matchedLevel,
            levelIndex,
            scores,
            details
        };
    });
}

function renderTrainingReadinessSection(runs) {
    const container = document.getElementById('readiness-section');
    if (!container) return;

    const trainingData = analyzeRecentTraining(runs);
    const readiness = assessReadiness(trainingData);

    if (!trainingData) {
        container.innerHTML = `
            <h3>📊 Training Readiness</h3>
            <p style="color:#999;">Not enough recent running data (last ${READINESS_ANALYSIS_WEEKS} weeks) to assess readiness.</p>
        `;
        return;
    }

    // Summary cards
    const summaryHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:0.6rem; margin-bottom:1.2rem;">
            <div style="background:#f0f9ff; padding:0.7rem; border-radius:8px; text-align:center; border:1px solid #bae6fd;">
                <div style="font-size:1.4em; font-weight:700; color:#0369a1;">${trainingData.avgWeeklyKm.toFixed(0)}</div>
                <div style="font-size:0.8em; color:#666;">Avg km/week</div>
            </div>
            <div style="background:#f0fdf4; padding:0.7rem; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
                <div style="font-size:1.4em; font-weight:700; color:#15803d;">${trainingData.maxLongRunKm.toFixed(1)}</div>
                <div style="font-size:0.8em; color:#666;">Longest run (km)</div>
            </div>
            <div style="background:#fefce8; padding:0.7rem; border-radius:8px; text-align:center; border:1px solid #fde68a;">
                <div style="font-size:1.4em; font-weight:700; color:#a16207;">${trainingData.avgDaysPerWeek.toFixed(1)}</div>
                <div style="font-size:0.8em; color:#666;">Days/week</div>
            </div>
            <div style="background:#fdf4ff; padding:0.7rem; border-radius:8px; text-align:center; border:1px solid #f0abfc;">
                <div style="font-size:1.4em; font-weight:700; color:#86198f;">${(trainingData.consistency * 100).toFixed(0)}%</div>
                <div style="font-size:0.8em; color:#666;">Consistency</div>
            </div>
            <div style="background:#${trainingData.trend >= 0 ? 'f0fdf4' : 'fef2f2'}; padding:0.7rem; border-radius:8px; text-align:center; border:1px solid ${trainingData.trend >= 0 ? '#bbf7d0' : '#fecaca'};">
                <div style="font-size:1.4em; font-weight:700; color:${trainingData.trend >= 0 ? '#15803d' : '#b91c1c'};">${trainingData.trend >= 0 ? '↑' : '↓'} ${Math.abs(trainingData.trend * 100).toFixed(0)}%</div>
                <div style="font-size:0.8em; color:#666;">Volume trend</div>
            </div>
        </div>
    `;

    // Readiness bars per distance
    const barsHTML = readiness.map(r => {
        const barColor = r.score >= 75 ? '#16a34a' : r.score >= 50 ? '#ca8a04' : r.score >= 30 ? '#ea580c' : '#dc2626';
        const statusEmoji = r.score >= 75 ? '✅' : r.score >= 50 ? '⚠️' : r.score >= 30 ? '🔶' : '❌';
        const levelBadge = r.level === 'Insufficient'
            ? '<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:12px; font-size:0.78em;">Insufficient base</span>'
            : `<span style="background:#e0f2fe; color:#075985; padding:2px 8px; border-radius:12px; font-size:0.78em;">${r.level} level</span>`;

        const detailsHTML = r.details.length > 0
            ? `<details style="margin-top:0.4rem; cursor:pointer;">
                <summary style="font-size:0.82em; color:#666;">💡 Recommendations</summary>
                <ul style="margin:0.3rem 0 0 1rem; padding:0; font-size:0.8em; color:#555;">
                    ${r.details.map(d => `<li>${d}</li>`).join('')}
                </ul>
                <div style="font-size:0.78em; color:#888; margin-top:0.3rem; padding-left:1rem;">Plan: ${r.planWeeks[0]}–${r.planWeeks[1]} weeks · Focus: ${r.keyFactors}</div>
            </details>`
            : `<div style="font-size:0.78em; color:#888; margin-top:0.3rem;">Plan: ${r.planWeeks[0]}–${r.planWeeks[1]} weeks · Focus: ${r.keyFactors}</div>`;

        return `
            <div style="margin-bottom:1rem; padding:0.8rem; background:#fafafa; border-radius:8px; border:1px solid #eee;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <div style="font-weight:600;">${statusEmoji} ${r.name}</div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        ${levelBadge}
                        <strong style="color:${barColor}; font-size:1.1em;">${r.score}%</strong>
                    </div>
                </div>
                <div style="background:#e5e7eb; border-radius:6px; height:10px; overflow:hidden;">
                    <div style="background:${barColor}; height:100%; width:${r.score}%; border-radius:6px; transition:width 0.5s ease;"></div>
                </div>
                ${detailsHTML}
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <h3>📊 Training Readiness</h3>
        <p style="font-size:0.9em; color:#666; margin-bottom:1rem;">How prepared you are for each distance based on your last ${READINESS_ANALYSIS_WEEKS} weeks of training.</p>
        ${summaryHTML}
        ${barsHTML}
    `;
}
