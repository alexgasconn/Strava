// js/charts.js
// Aquí irían todas tus funciones `plot...` y `createChart`.
// Por brevedad, solo pongo la estructura. Debes mover TODAS las funciones de gráficos aquí.

let charts = {}; // Almacén para las instancias de Chart.js

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas, config);
}

export function renderConsistencyChart(runs) {
    // ... tu código para CalHeatmap ...
}

export function renderActivityTypeChart(runs) {
    // ... tu código para el gráfico de barras de tipo de actividad ...
}

export function renderMonthlyDistanceChart(runs) {
    // ... tu código para el gráfico de distancia mensual ...
}

// ... Y así sucesivamente para CADA gráfico ...
// renderPaceVsDistanceChart, renderDistanceHistogram, renderVo2maxChart,
// renderFitnessChart, renderGearCharts, renderHeatmap, etc.

// Mueve TODAS las funciones que empiezan con 'plot' o que crean un 'new Chart' aquí
// y asegúrate de añadir 'export' delante de cada una.