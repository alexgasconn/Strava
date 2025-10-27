// weather-analytics.js
// Versión ajustada para usar la estructura HTML existente

import Chart from 'chart.js/auto'; // Asegúrate de tener Chart.js instalado y accesible

export async function renderWeatherTab(allActivities) {
    console.log("Initializing Weather Analytics — received", allActivities.length, "activities");

    // Reemplaza 'weather-summary' por el contenedor principal que desees usar
    // En el HTML que me pasaste, el div que envuelve el contenido es <div id="weather-tab">
    // Los "summary cards" están en <div id="weather-summary-content"> dentro de weather-tab
    const weatherTabContainer = document.getElementById("weather-tab"); // Contenedor principal de la pestaña
    const summaryCardsContainer = document.getElementById("wa-stats-row"); // Contenedor para las tarjetas de resumen

    if (!weatherTabContainer) {
        return console.error("weather-tab container not found. Ensure the main container has this ID.");
    }
    if (!summaryCardsContainer) {
        console.warn("wa-stats-row container not found. Summary cards might not render.");
        // Podríamos intentar crearla o buscar otro lugar si es crítico
    }

    // Si no hay actividades de carrera, mostramos un mensaje y salimos
    const runs = allActivities.filter(
        (a) => a.type?.toLowerCase().includes("run") && a.start_latlng && a.start_date_local
    );
    if (!runs.length) {
        if (summaryCardsContainer) {
            summaryCardsContainer.innerHTML = "<p>No running activities with GPS/time found.</p>";
        } else {
            weatherTabContainer.innerHTML = "<p>No running activities with GPS/time found.</p>";
        }
        return;
    }

    // Mostrar un mensaje de carga inicial en el contenedor de resumen
    if (summaryCardsContainer) {
        summaryCardsContainer.innerHTML = `<div class="wa-card"><h4>Cargando...</h4><div class="wa-val">Analizando datos meteorológicos...</div></div>`;
    }

    // // Fetch weather data
    const CONCURRENCY = 10;

    async function fetchWeatherForRuns(runs) {
        const results = [];
        const batches = 10;
        for (let i = 0; i < runs.length; i += batches) {
            const batch = runs.slice(i, i + batches);
            const batchResults = await Promise.all(batch.map(async run => {
                try {
                    const w = await getWeatherForRun(run);
                    return w ? { run, ...w } : null;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            }));
            results.push(...batchResults.filter(Boolean));
            console.log(`Processed ${results.length}/${runs.length}`);
        }
        return results;
    }


    // Uso:
    const weatherResults = await fetchWeatherForRuns(runs);


    if (!weatherResults.length) {
        if (summaryCardsContainer) {
            summaryCardsContainer.innerHTML = "<p>No weather data retrieved for any runs.</p>";
        } else {
            weatherTabContainer.innerHTML = "<p>No weather data retrieved.</p>";
        }
        return;
    }

    // Arrays para el análisis (incluyendo humedad)
    const temps = weatherResults.map((r) => r.temperature);
    const rains = weatherResults.map((r) => r.precipitation);
    const winds = weatherResults.map((r) => r.wind_speed);
    const humidities = weatherResults.map((r) => r.humidity); // Nueva
    const conditions = weatherResults.map((r) => r.weather_text);
    const paces = weatherResults.map((r) => runPaceMinPerKm(r.run));
    const distances = weatherResults.map((r) => (r.run.distance || 0) / 1000);


    // 1. Summary cards (rellenar el div #wa-stats-row existente)
    if (summaryCardsContainer) {
        summaryCardsContainer.innerHTML = `
            <div class="wa-card"><h4>Avg Temp</h4><div class="wa-val">${mean(temps).toFixed(1)}°C</div></div>
            <div class="wa-card"><h4>Avg Wind</h4><div class="wa-val">${mean(winds).toFixed(1)} km/h</div></div>
            <div class="wa-card"><h4>Avg Humidity</h4><div class="wa-val">${mean(humidities).toFixed(1)}%</div></div>
            <div class="wa-card"><h4>Total Rain</h4><div class="wa-val">${sum(rains).toFixed(1)} mm</div></div>
            <div class="wa-card"><h4>Common</h4><div class="wa-val">${mode(conditions)}</div></div>
        `;
    }

    // 2. Selector de Histograma (¡Ya existe en HTML, solo adjuntamos el evento!)
    const histogramSelect = document.getElementById("histogram-select");
    const histogramTitle = document.getElementById("histogram-title");
    const ctxHist = document.getElementById("weather-histogram"); // Usar el ID del HTML
    let histChart;

    if (ctxHist && histogramSelect && histogramTitle) {
        // Renderizar histograma inicial
        histChart = renderHistogram(ctxHist, temps, "Temperature (°C)");

        histogramSelect.addEventListener("change", (e) => {
            if (histChart) histChart.destroy(); // Destruir el gráfico anterior
            const v = e.target.value;
            let dataToRender = [];
            let labelText = "";

            if (v === "temp") { dataToRender = temps; labelText = "Temperature (°C)"; }
            else if (v === "rain") { dataToRender = rains; labelText = "Rainfall (mm)"; }
            else if (v === "wind") { dataToRender = winds; labelText = "Wind Speed (km/h)"; }
            else if (v === "humidity") { dataToRender = humidities; labelText = "Humidity (%)"; }
            else {
                console.warn(`Unknown histogram type selected: ${v}`);
                histogramTitle.innerText = "Histogram (Invalid Type)";
                return;
            }
            histChart = renderHistogram(ctxHist, dataToRender, labelText);
            histogramTitle.innerText = `${e.target.options[e.target.selectedIndex].text} Histogram`;
        });
    } else {
        console.warn("Histogram elements (canvas weather-histogram, select histogram-select, title histogram-title) not found.");
    }

    // 3. Renderizar todos los demás gráficos en sus respectivos canvases/divs del HTML
    // Gráfico Monthly Weather Overview
    const monthlyWeatherCtx = document.getElementById("monthly-weather");
    if (monthlyWeatherCtx) {
        renderMonthlyMulti(monthlyWeatherCtx, weatherResults); // Pasar el contexto directamente
    } else {
        console.warn("#monthly-weather canvas not found.");
    }

    // Gráfico Temp vs Pace
    const tempVsPaceCtx = document.getElementById("temp-vs-pace");
    if (tempVsPaceCtx) {
        renderScatter(tempVsPaceCtx, temps, paces, "Temp (°C)", "Pace (min/km)");
    } else {
        console.warn("#temp-vs-pace canvas not found.");
    }

    // Gráfico Weather Type Distribution
    const conditionPieCtx = document.getElementById("condition-pie");
    if (conditionPieCtx) {
        renderPie(conditionPieCtx, conditions);
    } else {
        console.warn("#condition-pie canvas not found.");
    }

    // Gráfico Temp vs Distance (si lo quieres usar, asegúrate de que exista el canvas en HTML)
    const tempVsDistCtx = document.getElementById("temp-vs-dist");
    if (tempVsDistCtx) {
        renderScatter(tempVsDistCtx, temps, distances, "Temp (°C)", "Distance (km)");
    } else {
        console.warn("#temp-vs-dist canvas not found.");
    }

    // Tabla de Estadísticas Mensuales
    const monthlyTableBody = document.getElementById("monthly-table")?.querySelector("tbody");
    if (monthlyTableBody) {
        renderMonthlyStatsTable(monthlyTableBody, weatherResults); // Pasar el tbody
    } else {
        console.warn("#monthly-table tbody not found.");
    }

    // Matriz de Correlación
    const corrMatrixDiv = document.getElementById("corr-matrix");
    if (corrMatrixDiv) {
        renderCorrelationMatrix(corrMatrixDiv, { temps, rains, winds, humidities, paces, distances }); // Incluir humidities
    } else {
        console.warn("#corr-matrix div not found.");
    }

    // Top Runs
    const topHotDiv = document.getElementById("top-hot");
    const topColdDiv = document.getElementById("top-cold");
    const topWindiestDiv = document.getElementById("top-windy");
    const topRainyDiv = document.getElementById("top-rainy");

    if (topHotDiv && topColdDiv && topWindiestDiv && topRainyDiv) {
        renderTopRuns(
            { hot: topHotDiv, cold: topColdDiv, windy: topWindiestDiv, rainy: topRainyDiv },
            weatherResults
        );
    } else {
        console.warn("One or more top runs containers (top-hot, top-cold, top-windy, top-rainy) not found.");
    }

    // Listado completo de runs
    const runsTableBody = document.getElementById("runs-table")?.querySelector("tbody");
    const toggleRunsButton = document.getElementById("toggle-runs");
    const runsTableContainer = document.getElementById("runs-table-container");

    if (runsTableBody && toggleRunsButton && runsTableContainer) {
        renderRunsList(runsTableBody, weatherResults); // Pasar el tbody
        toggleRunsButton.addEventListener("click", () => {
            runsTableContainer.classList.toggle("hidden");
            toggleRunsButton.textContent = runsTableContainer.classList.contains("hidden") ? "Show/Hide Runs" : "Hide Runs";
        });
    } else {
        console.warn("Runs list elements (runs-table tbody, toggle-runs button, runs-table-container) not found.");
    }
}

// ---------------- FETCH WEATHER ----------------
async function getWeatherForRun(run) {
    const [lat, lon] = run.start_latlng;
    const start = new Date(run.start_date_local);
    const dateStr = start.toISOString().split("T")[0];

    // Ahora solicitamos también la humedad relativa
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,weathercode,relativehumidity_2m&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        const data = await res.json();

        if (!data.hourly || !data.hourly.time || !data.hourly.time.length) {
            console.warn("No hourly weather data available for run", run.name, dateStr);
            return null;
        }

        const hour = start.getHours();
        // Intentar encontrar el índice exacto de la hora de inicio de la carrera
        let idx = data.hourly.time.findIndex(t => new Date(t).getHours() === hour);

        if (idx === -1) {
            // Si no se encuentra la hora exacta, usar el Math.min(hour, length-1) como fallback
            console.warn(`Exact hour ${hour} not found for ${dateStr}. Using closest available index.`);
            idx = Math.min(hour, data.hourly.time.length - 1);
        }

        return {
            temperature: numericSafe(data.hourly.temperature_2m[idx]),
            precipitation: numericSafe(data.hourly.precipitation[idx]),
            wind_speed: numericSafe(data.hourly.wind_speed_10m[idx]),
            weather_code: data.hourly.weathercode ? data.hourly.weathercode[idx] : null,
            weather_text: weatherCodeToText(data.hourly.weathercode ? data.hourly.weathercode[idx] : null),
            humidity: numericSafe(data.hourly.relativehumidity_2m ? data.hourly.relativehumidity_2m[idx] : null)
        };

    } catch (err) {
        console.error(`Weather fetch for ${run.name} (${dateStr}) failed:`, err);
        return null;
    }
}


function weatherCodeToText(code) {
    const map = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog",
        51: "Drizzle (light)", 53: "Drizzle (moderate)", 55: "Drizzle (dense)",
        56: "Freezing Drizzle (light)", 57: "Freezing Drizzle (dense)",
        61: "Rain (slight)", 63: "Rain (moderate)", 65: "Rain (heavy)",
        66: "Freezing Rain (light)", 67: "Freezing Rain (heavy)",
        71: "Snow fall (slight)", 73: "Snow fall (moderate)", 75: "Snow fall (heavy)",
        77: "Snow grains",
        80: "Rain showers (slight)", 81: "Rain showers (moderate)", 82: "Rain showers (violent)",
        85: "Snow showers (slight)", 86: "Snow showers (heavy)",
        95: "Thunderstorm (slight/moderate)",
        96: "Thunderstorm with hail (slight)", 99: "Thunderstorm with hail (heavy)",
    };
    return map[code] || `Unknown (${code})`;
}

// ---------------- CHARTS ----------------
function renderHistogram(ctx, data, label) {
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    const bins = 10;
    if (!data || data.length === 0) {
        console.warn(`No data for histogram: ${label}`);
        const chart = new Chart(ctx, { type: "bar", data: { labels: [], datasets: [{ label, data: [] }] } });
        // Intentar dibujar un mensaje en el canvas si está vacío
        const ctx2d = ctx.getContext('2d');
        if (ctx2d) {
            ctx2d.font = "18px Arial";
            ctx2d.textAlign = "center";
            ctx2d.fillText("No data available", ctx.width / 2, ctx.height / 2);
        }
        return chart;
    }

    const minv = Math.min(...data);
    const maxv = Math.max(...data);

    if (minv === maxv) { // Todos los valores son iguales
        const chart = new Chart(ctx, {
            type: "bar",
            data: { labels: [`${minv.toFixed(1)} ${label.split('(')[1]?.replace(')', '') || ''}`], datasets: [{ label, data: [data.length], backgroundColor: 'rgba(75, 192, 192, 0.6)' }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Number of Runs' } },
                    x: { title: { display: true, text: label } }
                },
                plugins: { legend: { display: false } }
            },
        });
        return chart;
    }

    const width = (maxv - minv) / bins;
    const counts = new Array(bins).fill(0);

    data.forEach((v) => {
        let binIndex = Math.floor((v - minv) / width);
        if (binIndex >= bins) binIndex = bins - 1;
        if (binIndex < 0) binIndex = 0;
        counts[binIndex]++;
    });

    const labels = counts.map((_, i) => {
        const start = minv + i * width;
        const end = minv + (i + 1) * width;
        return `${start.toFixed(1)}–${end.toFixed(1)}`;
    });

    return new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label, data: counts, backgroundColor: 'rgba(75, 192, 192, 0.6)' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Runs' } },
                x: { title: { display: true, text: label } }
            },
            plugins: {
                legend: { display: false }
            }
        },
    });
}

function renderMonthlyMulti(ctx, data) {
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    const byMonth = {};
    data.forEach((w) => {
        const m = new Date(w.run.start_date_local).getMonth();
        if (!byMonth[m]) byMonth[m] = { temp: [], rain: [], wind: [], humidity: [] };
        byMonth[m].temp.push(w.temperature);
        byMonth[m].rain.push(w.precipitation);
        byMonth[m].wind.push(w.wind_speed);
        byMonth[m].humidity.push(w.humidity);
    });
    const months = Object.keys(byMonth).sort((a, b) => a - b);
    const labels = months.map((m) => monthName(+m));
    const avgTemp = months.map((m) => mean(byMonth[m].temp));
    const totalRain = months.map((m) => sum(byMonth[m].rain));
    const avgWind = months.map((m) => mean(byMonth[m].wind));
    const avgHumidity = months.map((m) => mean(byMonth[m].humidity));

    new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { type: "line", label: "Temp (°C)", data: avgTemp, borderColor: "red", backgroundColor: "rgba(255, 99, 132, 0.2)", fill: false, yAxisID: "y1" },
                { label: "Rain (mm)", data: totalRain, backgroundColor: "rgba(0,0,255,0.3)", yAxisID: "y" },
                { type: "line", label: "Wind (km/h)", data: avgWind, borderColor: "green", backgroundColor: "rgba(75, 192, 192, 0.2)", fill: false, yAxisID: "y2" },
                { type: "line", label: "Humidity (%)", data: avgHumidity, borderColor: "purple", backgroundColor: "rgba(153, 102, 255, 0.2)", fill: false, yAxisID: "y3" },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            stacked: false,
            scales: {
                y: { type: "linear", position: "left", title: { text: "Rain (mm)", display: true }, beginAtZero: true },
                y1: { type: "linear", position: "right", grid: { drawOnChartArea: false }, title: { text: "Temp (°C)", display: true }, beginAtZero: false },
                y2: { type: "linear", position: "right", grid: { drawOnChartArea: false }, title: { text: "Wind (km/h)", display: true }, beginAtZero: true },
                y3: { type: "linear", position: "left", grid: { drawOnChartArea: false }, title: { text: "Humidity (%)", display: true }, beginAtZero: true, max: 100 },
            },
        },
    });
}

function renderScatter(ctx, x, y, xlabel, ylabel) {
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [
                { label: `${xlabel} vs ${ylabel}`, data: x.map((v, i) => ({ x: v, y: y[i] })), backgroundColor: 'rgba(255, 99, 132, 0.6)' },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { text: xlabel, display: true } },
                y: { title: { text: ylabel, display: true } },
            },
        },
    });
}

function renderPie(ctx, data) {
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    const counts = {};
    data.forEach((c) => (counts[c] = (counts[c] || 0) + 1));

    const backgroundColors = Object.keys(counts).map(() => `hsl(${Math.random() * 360}, 70%, 70%)`);

    new Chart(ctx, {
        type: "pie",
        data: {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: backgroundColors,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                title: {
                    display: true,
                    text: 'Weather Condition Distribution'
                }
            }
        },
    });
}

function renderMonthlyStatsTable(tbodyElement, data) {
    tbodyElement.innerHTML = "";
    const byMonth = {};
    data.forEach((w) => {
        const m = new Date(w.run.start_date_local).getMonth();
        if (!byMonth[m]) byMonth[m] = [];
        byMonth[m].push(w);
    });
    const months = Object.keys(byMonth).sort((a, b) => a - b);
    months.forEach((m) => {
        const arr = byMonth[m];
        const avgTemp = mean(arr.map((a) => a.temperature)).toFixed(1);
        const avgWind = mean(arr.map((a) => a.wind_speed)).toFixed(1);
        const totalRain = sum(arr.map((a) => a.precipitation)).toFixed(1);
        const avgHumidity = mean(arr.map((a) => a.humidity)).toFixed(1);

        const row = tbodyElement.insertRow();
        row.insertCell().textContent = monthName(+m);
        row.insertCell().textContent = avgTemp;
        row.insertCell().textContent = avgWind;
        row.insertCell().textContent = totalRain;
        row.insertCell().textContent = avgHumidity;
    });
}

function renderCorrelationMatrix(divElement, data) {
    const vars = Object.keys(data);
    let html = `<table class="wa-corr"><thead><tr><th></th>${vars.map((v) => `<th>${v.replace(/s$/, '')}</th>`).join("")}</tr></thead><tbody>`;
    for (let i of vars) {
        html += `<tr><th>${i.replace(/s$/, '')}</th>`;
        for (let j of vars) {
            const corr = correlation(data[i], data[j]);
            const color = corrColor(corr);
            html += `<td style="background:${color}">${corr.toFixed(2)}</td>`;
        }
        html += `</tr>`;
    }
    html += "</tbody></table>";
    divElement.innerHTML = html;
}

function renderTopRuns(containers, data) {
    const hottest = [...data].sort((a, b) => b.temperature - a.temperature).slice(0, 5);
    const coldest = [...data].sort((a, b) => a.temperature - b.temperature).slice(0, 5);
    const windiest = [...data].sort((a, b) => b.wind_speed - a.wind_speed).slice(0, 5);
    const rainy = [...data].sort((a, b) => b.precipitation - a.precipitation).slice(0, 5);

    if (containers.hot) containers.hot.innerHTML = `<h4>Top 5 Hottest</h4>${listRuns(hottest, 'temperature', '°C')}`;
    if (containers.cold) containers.cold.innerHTML = `<h4>Top 5 Coldest</h4>${listRuns(coldest, 'temperature', '°C')}`;
    if (containers.windy) containers.windy.innerHTML = `<h4>Top 5 Windiest</h4>${listRuns(windiest, 'wind_speed', ' km/h')}`;
    if (containers.rainy) containers.rainy.innerHTML = `<h4>Top 5 Rainy</h4>${listRuns(rainy, 'precipitation', ' mm')}`;
}

function renderRunsList(tbodyElement, data) {
    tbodyElement.innerHTML = "";
    data.forEach((w) => {
        const run = w.run;
        const row = tbodyElement.insertRow();
        row.insertCell().textContent = new Date(run.start_date_local).toLocaleDateString();
        row.insertCell().textContent = (run.distance / 1000).toFixed(1) + " km";
        row.insertCell().textContent = runPaceMinPerKm(run).toFixed(1) + " min/km";
        row.insertCell().textContent = w.temperature.toFixed(1) + "°C";
        row.insertCell().textContent = w.wind_speed.toFixed(1) + " km/h";
        row.insertCell().textContent = w.precipitation.toFixed(1) + " mm";
        row.insertCell().textContent = w.weather_text;
    });
}

function listRuns(arr, prop, unit) {
    if (!arr || arr.length === 0) return '<ul><li>No runs found.</li></ul>';
    return `<ul>${arr
        .map(
            (r) =>
                `<li>${new Date(r.run.start_date_local).toLocaleDateString()} — ${r[prop].toFixed(1)}${unit} (${r.weather_text})</li>`
        )
        .join("")}</ul>`;
}

// ---------------- UTILITIES ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => (a.length ? a.reduce((x, y) => x + y, 0) : 0);
const mode = (arr) => {
    if (!arr || arr.length === 0) return "N/A";
    const map = {};
    arr.forEach((v) => (map[v] = (map[v] || 0) + 1));
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : "N/A";
};

function correlation(x, y) {
    const n = x.length;
    if (n === 0 || n !== y.length) return 0;

    const mx = mean(x), my = mean(y);
    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
}

function corrColor(corr) {
    const absCorr = Math.abs(corr);
    let r = 0, g = 0, b = 0;

    if (corr > 0) {
        r = Math.floor(255 * (1 - absCorr));
        g = 255;
        b = Math.floor(255 * (1 - absCorr));
    } else if (corr < 0) {
        r = 255;
        g = Math.floor(255 * (1 - absCorr));
        b = Math.floor(255 * (1 - absCorr));
    } else {
        r = g = b = 220;
    }
    return `rgb(${r},${g},${b})`;
}

function monthName(i) {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i];
}
function runPaceMinPerKm(run) {
    if (!run.distance || run.distance === 0 || !run.moving_time || run.moving_time === 0) return 0;
    const pace = run.moving_time / (run.distance / 1000) / 60;
    return pace;
}

function numericSafe(v) {
    return v === null || v === undefined || isNaN(v) ? 0 : Number(v);
}

