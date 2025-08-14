// js/planner.js

// Este archivo es un módulo que exporta la función principal para la pestaña del planner.
export function renderPlannerTab(allActivities) {
    console.log("Initializing Planner Tab...");
    
    // --- Referencias a los controles de la UI ---
    const riegelWeightSlider = document.getElementById('riegel-weight');
    const mlWeightSlider = document.getElementById('ml-weight');
    const pbWeightSlider = document.getElementById('pb-weight');
    const riegelWeightVal = document.getElementById('riegel-weight-val');
    const mlWeightVal = document.getElementById('ml-weight-val');
    const pbWeightVal = document.getElementById('pb-weight-val');
    const updateBtn = document.getElementById('update-predictions-btn');
    const moodRadios = document.querySelectorAll('input[name="prediction-mood"]');

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    // --- Función maestra que se ejecuta para actualizar las predicciones ---
    function updateUI() {
        console.log("Updating predictions...");
        updatePredictions(runs);
    }

    // --- Event Listeners para los controles ---
    if (riegelWeightSlider) {
        riegelWeightSlider.addEventListener('input', () => riegelWeightVal.textContent = `${riegelWeightSlider.value}%`);
        mlWeightSlider.addEventListener('input', () => mlWeightVal.textContent = `${mlWeightSlider.value}%`);
        pbWeightSlider.addEventListener('input', () => pbWeightVal.textContent = `${pbWeightSlider.value}%`);
        updateBtn.addEventListener('click', updateUI);
        moodRadios.forEach(radio => radio.addEventListener('change', updateUI));
    }
    
    // --- Llama a la función de predicción por primera vez al cargar la pestaña ---
    updateUI();
}


// =================================================================
//          TODA LA LÓGICA DE PREDICCIÓN VIVE AQUÍ
// =================================================================
let paceChartInstance = null;

// Función "maestra" que lee los controles y llama a los cálculos
function updatePredictions(runs) {
    const container = document.getElementById('riegel-predictions');
    if (!container) return;

    if (!runs || runs.length === 0) {
        container.innerHTML = '<p>No running data available to make predictions.</p>';
        return;
    }

    // Leer los valores actuales de los controles de la UI
    const mood = document.querySelector('input[name="prediction-mood"]:checked').value;
    const weights = {
        riegel: parseFloat(document.getElementById('riegel-weight').value),
        ml: parseFloat(document.getElementById('ml-weight').value),
        pb: parseFloat(document.getElementById('pb-weight').value),
    };

    // Realizar los cálculos con los nuevos parámetros
    const bests = getBestPerformances(runs);
    const model = trainPersonalizedModel(bests);
    const finalPredictions = calculateAllPredictions(bests, model, { mood, weights });
    
    // Renderizar la tabla y el gráfico con los nuevos resultados
    renderResultsTableAndChart(container, finalPredictions);
}

// Función de cálculo modificada para aceptar los settings del usuario
function calculateAllPredictions(bestPerformances, model, settings) {
    const targetDistances = [
        { name: 'Mile', km: 1.609 }, { name: '5K', km: 5 }, { name: '10K', km: 10 },
        { name: 'Half Marathon', km: 21.097 }, { name: 'Marathon', km: 42.195 }
    ];

    const moodSettings = {
        optimistic: { start: 0.0, end: 0.40 },
        realistic: { start: 0.25, end: 0.75 },
        conservative: { start: 0.60, end: 1.0 }
    };
    const trim = moodSettings[settings.mood];

    return targetDistances.map(target => {
        let allPredictions = [];
        
        Object.values(bestPerformances).flat().forEach(perf => {
            if (Math.abs(perf.km - target.km) < 0.1) return;
            const predSec = perf.seconds * (target.km / perf.km) ** 1.06;
            allPredictions.push({ time: predSec, weight: settings.weights.riegel / 10 });
        });
        
        if (model) {
            const logKm = Math.log(target.km);
            const mlTime = model.a + model.b * logKm + model.c * logKm ** 2;
            if (isFinite(mlTime) && mlTime > 0) {
               allPredictions.push({ time: mlTime, weight: settings.weights.ml / 10 });
            }
        }
        
        if (bestPerformances[target.km]) {
            bestPerformances[target.km].forEach(perf => {
                allPredictions.push({ time: perf.seconds, weight: settings.weights.pb / 10 });
            });
        }

        if (allPredictions.length === 0) return { ...target, combined: null, confidence: 0, low: null, high: null };

        allPredictions.sort((a, b) => a.time - b.time);
        const startIndex = Math.floor(allPredictions.length * trim.start);
        const endIndex = Math.ceil(allPredictions.length * trim.end);
        const trimmed = allPredictions.slice(startIndex, endIndex);

        if (trimmed.length === 0) return { ...target, combined: null, confidence: 0, low: null, high: null };

        const totalWeight = trimmed.reduce((sum, p) => sum + p.weight, 0);
        if (totalWeight === 0) return { ...target, combined: null, confidence: 0, low: null, high: null };
        
        const combinedTime = trimmed.reduce((sum, p) => sum + p.time * p.weight, 0) / totalWeight;
        const lowTime = trimmed[0].time;
        const highTime = trimmed[trimmed.length - 1].time;
        
        let confidence = 0;
        const actualBest = bestPerformances[target.km] ? bestPerformances[target.km][0].seconds : null;

        if (actualBest) {
            const diff = Math.abs(actualBest - combinedTime) / actualBest;
            confidence = Math.max(0, 100 - (diff * 800));
        } else {
            const sourceCount = Object.values(bestPerformances).flat().length;
            confidence = Math.min(80, 10 + sourceCount * 4);
        }

        return { 
            ...target, 
            combined: combinedTime, 
            confidence: Math.round(confidence),
            low: lowTime,
            high: highTime
        };
    });
}

// Nueva función para renderizar la tabla Y el gráfico
function renderResultsTableAndChart(container, predictions) {
    const rows = predictions.map(p => {
        if (!p.combined) {
            return `<tr><td>${p.name}</td><td>No data</td><td>-</td><td>-</td></tr>`;
        }
        const confidenceColor = p.confidence >= 85 ? '#28a745' : p.confidence >= 60 ? '#ffc107' : '#dc3545';
        return `<tr>
            <td>${p.name}</td>
            <td>${formatTime(p.combined)}</td>
            <td>${formatPace(p.combined, p.km)}</td>
            <td style="color: ${confidenceColor}; font-weight: bold;">${p.confidence}%</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1 1 320px; min-width: 280px;">
                <table class="df-table">
                    <thead>
                        <tr><th>Distance</th><th>Predicted Time</th><th>Pace</th><th>Confidence</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div style="flex: 1 1 320px; min-width: 280px;">
                <div class="chart-wrapper" style="position: relative; height: 300px; width: 100%;">
                    <canvas id="riegel-chart-container"></canvas>
                </div>
            </div>
        </div>
        <div class="disclaimer" style="font-size: 0.8em; color: #666; margin-top: 10px;">
            Predictions are calculated based on your selected mood and model weights. Confidence is higher when predictions align with your actual personal bests.
        </div>
    `;

    renderPaceChart(predictions);
}

// --- FUNCIONES DE AYUDA (SIN CAMBIOS) ---
function formatTime(sec) {
    if (!isFinite(sec) || sec <= 0) return 'N/A';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return (h > 0 ? h + ':' : '') + m.toString().padStart(h > 0 ? 2 : 1, '0') + ':' + s.toString().padStart(2, '0');
}

function formatPace(sec, km) {
    if (!isFinite(sec) || !isFinite(km) || km <= 0) return '-';
    const pace = sec / km;
    const min = Math.floor(pace / 60);
    const secRest = Math.round(pace % 60);
    return `${min}:${secRest.toString().padStart(2, '0')} /km`;
}

function solve3x3(A, B) {
    const det = A[0][0]*(A[1][1]*A[2][2]-A[2][1]*A[1][2])-A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])+A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);
    if(det===0)return null;const invDet=1/det;const adj=[[A[1][1]*A[2][2]-A[2][1]*A[1][2],A[0][2]*A[2][1]-A[0][1]*A[2][2],A[0][1]*A[1][2]-A[0][2]*A[1][1]],[A[1][2]*A[2][0]-A[1][0]*A[2][2],A[0][0]*A[2][2]-A[0][2]*A[2][0],A[0][2]*A[1][0]-A[0][0]*A[1][2]],[A[1][0]*A[2][1]-A[2][0]*A[1][1],A[2][0]*A[0][1]-A[0][0]*A[2][1],A[0][0]*A[1][1]-A[1][0]*A[0][1]]];return[invDet*(adj[0][0]*B[0]+adj[0][1]*B[1]+adj[0][2]*B[2]),invDet*(adj[1][0]*B[0]+adj[1][1]*B[1]+adj[1][2]*B[2]),invDet*(adj[2][0]*B[0]+adj[2][1]*B[1]+adj[2][2]*B[2])];
}

function getBestPerformances(allRuns) {
    const targetDistances = [
        { name: 'Mile', km: 1.609 }, { name: '5K', km: 5 }, { name: '10K', km: 10 },
        { name: 'Half Marathon', km: 21.097 }, { name: 'Marathon', km: 42.195 }
    ];
    const bestPerformances = {};
    for (const { km } of targetDistances) {
        const margin = 0.1;
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
    let sumX=0, sumX2=0, sumX3=0, sumX4=0, sumY=0, sumXY=0, sumX2Y=0;
    const n = X.length;
    for (let i = 0; i < n; i++) {
        const x = X[i], x2 = x*x, y = Y[i];
        sumX += x; sumX2 += x2; sumX3 += x2*x; sumX4 += x2*x2;
        sumY += y; sumXY += x*y; sumX2Y += x2*y;
    }
    const A = [[n, sumX, sumX2], [sumX, sumX2, sumX3], [sumX2, sumX3, sumX4]];
    const B = [sumY, sumXY, sumX2Y];
    const coeffs = solve3x3(A, B);
    if (!coeffs) return null;
    return { a: coeffs[0], b: coeffs[1], c: coeffs[2] };
}

function renderPaceChart(predictions) {
    if (typeof Chart === 'undefined') return;
    const chartContainer = document.getElementById('riegel-chart-container');
    if (!chartContainer) return;
    const ctx = chartContainer.getContext('2d');
    if (paceChartInstance) paceChartInstance.destroy();
    
    const validPredictions = predictions.filter(p => p.combined && p.low && p.high);
    if(validPredictions.length === 0) return; // No hay datos para graficar
    
    const toPace = (time, km) => (time / km) / 60;
    const mainPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.combined, p.km) }));
    const lowerPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.low, p.km) }));
    const upperPaces = validPredictions.map(p => ({ x: p.km, y: toPace(p.high, p.km) }));

    paceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Fastest Pace Prediction', data: lowerPaces, borderColor: 'transparent',
                backgroundColor: 'rgba(75, 192, 192, 0.2)', pointRadius: 0, fill: '+1'
            }, {
                label: 'Slowest Pace Prediction', data: upperPaces, borderColor: 'transparent',
                backgroundColor: 'rgba(75, 192, 192, 0.2)', pointRadius: 0, fill: '-1'
            }, {
                label: 'Predicted Pace', data: mainPaces, borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgb(75, 192, 192)', tension: 0.1, fill: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Predicted Pace vs. Distance' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const paceDecimal = context.parsed.y;
                            const minutes = Math.floor(paceDecimal);
                            const seconds = Math.round((paceDecimal - minutes) * 60);
                            return `${context.dataset.label}: ${minutes}:${seconds.toString().padStart(2, '0')} /km`;
                        }
                    }
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Distance (km)' }, min: 0, max: 45 },
                y: { title: { display: true, text: 'Pace (min/km)' }, reverse: false }
            }
        }
    });
}