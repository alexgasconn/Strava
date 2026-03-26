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
// MAIN EXPORT - RENDERS THE TAB
// =====================================================

export function renderPlannerTab(allActivities) {
    const runs = allActivities
        .filter(a => a.type && a.type.includes('Run'))
        .slice()
        .sort((left, right) => new Date(left.start_date_local || 0) - new Date(right.start_date_local || 0));

    // Render PB section first
    renderPersonalBestsSection(runs);

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
        riegel: parseFloat(document.getElementById('riegel-weight')?.value ?? 40),
        ml: parseFloat(document.getElementById('ml-weight')?.value ?? 25),
        pb: parseFloat(document.getElementById('pb-weight')?.value ?? 30),
        vdot: parseFloat(document.getElementById('vdot-weight')?.value ?? 20),
    };

    // Normalize weights so they always sum to 100
    const totalW = Object.values(weights).reduce((s, v) => s + v, 0);
    if (totalW > 0) {
        for (const k of Object.keys(weights)) weights[k] = weights[k] / totalW * 100;
    }

    const bests = getBestPerformances(runs);
    const model = trainPersonalizedModel(bests);
    const vdot = estimateVDOT(runs);
    const finalPredictions = calculateAllPredictions(bests, model, vdot, { mood, weights });

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

function calculateAllPredictions(bestPerformances, model, vdot, settings) {
    const moodSettings = {
        optimistic: { start: 0.0, end: 0.40 },
        realistic: { start: 0.25, end: 0.75 },
        conservative: { start: 0.60, end: 1.0 }
    };
    const trim = moodSettings[settings.mood];

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
            <strong>How predictions work:</strong> Combines 4 models — <em>Riegel</em> (exponential scaling from your PBs),
            <em>ML Curve</em> (quadratic fit on your race history), <em>Exact PB</em> (direct times for that distance),
            and <em>VDOT</em> (Daniels' VO₂max-based formula). Weights are set in the controls above.
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
        riegel: parseFloat(document.getElementById('riegel-weight')?.value ?? 40),
        ml: parseFloat(document.getElementById('ml-weight')?.value ?? 25),
        pb: parseFloat(document.getElementById('pb-weight')?.value ?? 30),
        vdot: parseFloat(document.getElementById('vdot-weight')?.value ?? 20)
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
        const predictions = calculateAllPredictions(bests, model, vdot, settings);
        const predictionByDistance = new Map(predictions.map(prediction => [prediction.km, prediction]));

        points.push(bucket.label);
        series.forEach(distanceSeries => {
            const prediction = predictionByDistance.get(distanceSeries.km);
            distanceSeries.values.push(prediction?.combined ?? null);
            distanceSeries.lows.push(prediction?.low ?? null);
            distanceSeries.highs.push(prediction?.high ?? null);
        });
    });

    return { points, series };
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
            pointRadius: 3,
            pointHoverRadius: 5,
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
