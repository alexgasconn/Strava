// js/planner.js - Race Predictor and Performance Analyzer
// Enhanced with PB display, ±3-5% margin bands, and improved prediction logic

import * as utils from './utils.js';

// =====================================================
// MAIN EXPORT - RENDERS THE TAB
// =====================================================

export function renderPlannerTab(allActivities) {
    const riegelWeightSlider = document.getElementById('riegel-weight');
    const mlWeightSlider = document.getElementById('ml-weight');
    const pbWeightSlider = document.getElementById('pb-weight');
    const riegelWeightVal = document.getElementById('riegel-weight-val');
    const mlWeightVal = document.getElementById('ml-weight-val');
    const pbWeightVal = document.getElementById('pb-weight-val');
    const updateBtn = document.getElementById('update-predictions-btn');
    const moodRadios = document.querySelectorAll('input[name="prediction-mood"]');

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    // Render PB section first
    renderPersonalBestsSection(runs);

    // Update predictions on change
    function updateUI() {
        updatePredictions(runs);
    }

    if (riegelWeightSlider) {
        riegelWeightSlider.addEventListener('input', () => riegelWeightVal.textContent = `${riegelWeightSlider.value}%`);
        mlWeightSlider.addEventListener('input', () => mlWeightVal.textContent = `${mlWeightSlider.value}%`);
        pbWeightSlider.addEventListener('input', () => pbWeightVal.textContent = `${pbWeightSlider.value}%`);
        updateBtn.addEventListener('click', updateUI);
        moodRadios.forEach(radio => radio.addEventListener('change', updateUI));
    }

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

    const targetDistances = [
        { name: 'Mile', km: 1.609, margin: 0.10 },
        { name: '5K', km: 5, margin: 0.15 },
        { name: '10K', km: 10, margin: 0.15 },
        { name: '21K (Half Marathon)', km: 21.097, margin: 0.20 },
        { name: 'Marathon', km: 42.195, margin: 0.30 }
    ];

    const pbs = getPBsWithMargin(runs, targetDistances);

    let pbRows = targetDistances.map(target => {
        const pb = pbs.find(p => Math.abs(p.km - target.km) < 0.1);
        if (!pb || !pb.time) {
            return `<tr><td>${target.name}</td><td colspan="5" style="text-align:center; color:#999;">No PB recorded</td></tr>`;
        }

        const timeStr = utils.formatTime(pb.time);
        const pace = utils.formatPace(pb.time, pb.km);
        const minMargin = pb.time * 0.97; // -3%
        const maxMargin = pb.time * 1.05; // +5%
        const minTimeStr = utils.formatTime(minMargin);
        const maxTimeStr = utils.formatTime(maxMargin);
        const minPace = utils.formatPace(minMargin, pb.km);
        const maxPace = utils.formatPace(maxMargin, pb.km);

        return `<tr>
            <td><strong>${target.name}</strong></td>
            <td>${timeStr}</td>
            <td>${pace}</td>
            <td style="font-size:0.9em; color:#666;">-3%: ${minTimeStr} (${minPace})</td>
            <td style="font-size:0.9em; color:#666;">+5%: ${maxTimeStr} (${maxPace})</td>
            <td style="font-size:0.85em; color:#999;">${pb.runs} run(s)</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <h3>🏆 Personal Bests</h3>
        <p style="font-size:0.9em; color:#666; margin-bottom:1rem;">Your current PBs with realistic range estimates (±3-5%)</p>
        <table class="df-table">
            <thead>
                <tr><th>Distance</th><th>Best Time</th><th>Pace</th><th>Realistic Low (-3%)</th><th>Realistic High (+5%)</th><th>Source</th></tr>
            </thead>
            <tbody>${pbRows}</tbody>
        </table>
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
                return { date: r.start_date_local, distance, seconds, pace: seconds / distance, id: r.id };
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
            distance: best.distance
        });
    }
    return pbs;
}

// =====================================================
// IMPROVED PREDICTION LOGIC
// =====================================================

let paceChartInstance = null;

function updatePredictions(runs) {
    const container = document.getElementById('riegel-predictions');
    if (!container) return;

    if (!runs || runs.length === 0) {
        container.innerHTML = '<p>No running data available to make predictions.</p>';
        return;
    }

    const mood = document.querySelector('input[name="prediction-mood"]:checked')?.value || 'realistic';
    const weights = {
        riegel: parseFloat(document.getElementById('riegel-weight')?.value || 50),
        ml: parseFloat(document.getElementById('ml-weight')?.value || 25),
        pb: parseFloat(document.getElementById('pb-weight')?.value || 40),
    };

    // Normalize weights so they sum to 100
    const totalWeight = weights.riegel + weights.ml + weights.pb;
    if (totalWeight > 0) {
        weights.riegel = weights.riegel / totalWeight * 100;
        weights.ml = weights.ml / totalWeight * 100;
        weights.pb = weights.pb / totalWeight * 100;
    }

    const bests = getBestPerformances(runs);
    const model = trainPersonalizedModel(bests);
    const finalPredictions = calculateAllPredictions(bests, model, { mood, weights });

    renderResultsTableAndChart(container, finalPredictions, bests);
}

function calculateAllPredictions(bestPerformances, model, settings) {
    const targetDistances = [
        { name: 'Mile', km: 1.609 },
        { name: '5K', km: 5 },
        { name: '10K', km: 10 },
        { name: '15K', km: 15 },
        { name: 'Half Marathon', km: 21.097 },
        { name: '30K', km: 30 },
        { name: 'Marathon', km: 42.195 }
    ];

    const moodSettings = {
        optimistic: { start: 0.0, end: 0.40 },
        realistic: { start: 0.25, end: 0.75 },
        conservative: { start: 0.60, end: 1.0 }
    };
    const trim = moodSettings[settings.mood];

    return targetDistances.map(target => {
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
            return `<tr><td>${p.name}</td><td colspan="4" style="text-align:center; color:#999;">No prediction available</td></tr>`;
        }

        const confidenceColor = p.confidence >= 80 ? '#28a745' : p.confidence >= 60 ? '#ffc107' : '#dc3545';
        const sourceStr = p.sources.join(', ');
        const paceStr = utils.formatPace(p.combined, p.km);

        return `<tr>
            <td><strong>${p.name}</strong></td>
            <td>${utils.formatTime(p.combined)}</td>
            <td>${paceStr}</td>
            <td style="color: ${confidenceColor}; font-weight: bold;">${p.confidence}%</td>
            <td style="font-size:0.85em; color:#666;">${sourceStr}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <h3>🎯 Race Time Predictions</h3>
        <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1 1 400px; min-width: 300px;">
                <table class="df-table">
                    <thead>
                        <tr><th>Distance</th><th>Predicted Time</th><th>Pace</th><th>Confidence</th><th>Based On</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div style="flex: 1 1 300px; min-width: 280px;">
                <div class="chart-wrapper" style="position: relative; height: 300px; width: 100%;">
                    <canvas id="prediction-pace-chart"></canvas>
                </div>
            </div>
        </div>
        <div class="disclaimer" style="font-size:0.85em; color:#666; margin-top:15px; padding:10px; background:#f5f5f5; border-radius:4px;">
            <strong>How predictions work:</strong> Combines Riegel formula, your personal performance curve (ML), and actual PBs.
            <strong>Confidence</strong> is higher when predictions align with your PBs and you have more data.
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
    const targetDistances = [
        { name: 'Mile', km: 1.609 },
        { name: '5K', km: 5 },
        { name: '10K', km: 10 },
        { name: 'Half Marathon', km: 21.097 },
        { name: 'Marathon', km: 42.195 }
    ];
    const bestPerformances = {};
    for (const { km } of targetDistances) {
        const margin = 0.15;
        const min = km * (1 - margin), max = km * (1 + margin);
        const candidates = allRuns
            .map(r => ({ ...r, km: r.distance / 1000, seconds: r.moving_time }))
            .filter(r => r.km >= min && r.km <= max && r.seconds > 0);
        if (candidates.length === 0) continue;
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

    const toPace = (time, km) => (time / km) / 60;
    const mainPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.combined, p.km) }));
    const lowerPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.low, p.km) }));
    const upperPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.high, p.km) }));

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
                        label: function (context) {
                            const paceDecimal = context.parsed.y;
                            const minutes = Math.floor(paceDecimal);
                            const seconds = Math.round((paceDecimal - minutes) * 60);
                            return `${context.dataset.label}: ${minutes}:${seconds.toString().padStart(2, '0')} /km`;
                        }
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
                    beginAtZero: false
                }
            }
        }
    });
}
