// js/tabs/overview.js

export function renderOverviewTab(activities) {
    console.log("Renderizando pestaña Overview...");
    renderSummaryCards(activities);
    renderConsistencyHeatmap(activities);
}

function renderSummaryCards(activities) {
    const totalRuns = activities.filter(a => a.type === 'Run').length;
    const totalRides = activities.filter(a => a.type === 'Ride').length;
    const totalSwims = activities.filter(a => a.type === 'Swim').length;
    const totalDistance = activities.reduce((sum, a) => sum + a.distance_km, 0);

    const summaryCardsContainer = document.getElementById('summary-cards');
    if (summaryCardsContainer) {
        summaryCardsContainer.innerHTML = `
            <div class="card"><h3>Distancia Total</h3><p>${totalDistance.toFixed(0)} km</p></div>
            <div class="card"><h3>Carreras</h3><p>${totalRuns}</p></div>
            <div class="card"><h3>Salidas en Bici</h3><p>${totalRides}</p></div>
            <div class="card"><h3>Sesiones de Natación</h3><p>${totalSwims}</p></div>
        `;
    }
}

function renderConsistencyHeatmap(activities) {
    const cal = new CalHeatmap();
    const heatmapData = activities.map(act => ({
        date: act.start_date_local.substring(0, 10),
        value: 1
    }));
    
    const aggregatedData = heatmapData.reduce((acc, curr) => {
        acc[curr.date] = (acc[curr.date] || 0) + curr.value;
        return acc;
    }, {});

    const finalHeatmapData = Object.keys(aggregatedData).map(date => ({
        date: date,
        value: aggregatedData[date]
    }));

    cal.paint({
        itemSelector: "#cal-heatmap",
        domain: { type: "month", label: { text: "MMM", textAlign: "start", position: "top" } },
        subDomain: { type: "ghDay", radius: 2, width: 11, height: 11, gutter: 4 },
        range: 12,
        data: { source: finalHeatmapData, x: 'date', y: 'value' },
        scale: {
            color: {
                type: 'threshold',
                range: ['#ebedf0', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26'],
                domain: [1, 2, 3, 4]
            }
        },
        date: { start: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
    });
}