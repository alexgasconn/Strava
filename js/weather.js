// weather-analytics.js

export async function renderWeatherTab(allActivities) {
    console.log("Initializing Weather Analytics — received", allActivities.length, "activities");


    const weatherTabContainer = document.getElementById("weather-tab");
    const summaryCardsContainer = document.getElementById("wa-stats-row");

    if (!weatherTabContainer) {
        return console.error("weather-tab container not found. Ensure the main container has this ID.");
    }

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
  

    async function fetchWeatherForRuns(runs) {
        const results = [];
        const batches = 5;
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
            sleep(10);
        }
        return results;
    }


    // Uso:
    const weatherResults = await fetchWeatherForRuns(runs);

    // --- IMPORTANTE: Crear combinedWeatherData con TODAS las variables ---
    const combinedWeatherData = weatherResults.map((wr, index) => {
        const run = wr.run; // Acceder al objeto run directamente
        return {
            temperature: wr.temperature,
            precipitation: wr.precipitation,
            wind_speed: wr.wind_speed,
            wind_direction: wr.wind_direction,
            weather_code: wr.weather_code,
            weather_text: wr.weather_text,
            humidity: wr.humidity,
            cloudcover: wr.cloudcover,
            pressure: wr.pressure,

            run_name: run.name || 'Unnamed Run', // Nombre de la carrera
            run_date: run.start_date_local,    // Fecha de la carrera
            distance: (run.distance || 0) / 1000, // Distancia en km
            pace: runPaceMinPerKm(run),        // Pace en min/km
            moving_time: (run.moving_time || 0) / 60, // Tiempo en minutos
        };
    });


    // Arrays para el análisis (usando combinedWeatherData para consistencia si es posible)
    const temps = combinedWeatherData.map((r) => r.temperature);
    const rains = combinedWeatherData.map((r) => r.precipitation);
    const winds = combinedWeatherData.map((r) => r.wind_speed);
    const humidities = combinedWeatherData.map((r) => r.humidity);
    const pressures = combinedWeatherData.map((r) => r.pressure);
    const cloudcovers = combinedWeatherData.map((r) => r.cloudcover);
    const conditions = combinedWeatherData.map((r) => r.weather_text);
    const windDirections = combinedWeatherData.map((r) => r.wind_direction);
    const paces = combinedWeatherData.map((r) => r.pace);
    const distances = combinedWeatherData.map((r) => r.distance);



    // 1. Summary cards (rellenar el div #wa-stats-row existente)
    if (summaryCardsContainer) {
        summaryCardsContainer.innerHTML = `
        <div class="wa-card"><h4>🌡️ Avg Temp</h4><div class="wa-val">${mean(temps).toFixed(1)}°C</div></div>
        <div class="wa-card"><h4>💨 Avg Wind</h4><div class="wa-val">${mean(winds).toFixed(1)} km/h</div></div>
        <div class="wa-card"><h4>💧 Avg Humidity</h4><div class="wa-val">${mean(humidities).toFixed(1)}%</div></div>
        <div class="wa-card"><h4>🌧️ Total Rain</h4><div class="wa-val">${sum(rains).toFixed(1)} mm</div></div>
        <div class="wa-card"><h4>☁️ Common</h4><div class="wa-val">${mode(conditions)}</div></div>
        <div class="wa-card"><h4>🌬️ Common Wind Dir</h4><div class="wa-val">${mode(windDirections)}°</div></div>
        <div class="wa-card"><h4>🧭 Pressure Avg</h4><div class="wa-val">${mean(pressures).toFixed(1)} hPa</div></div>
    `;
    }


    const histogramSelect = document.getElementById("histogram-select");
    const histogramTitle = document.getElementById("histogram-title");
    const ctxHist = document.getElementById("weather-histogram")
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
            else if (v === "cloudcover") { dataToRender = cloudcovers; labelText = "Cloud Cover (%)"; }
            else if (v === "pressure") { dataToRender = pressures; labelText = "Pressure (hPa)"; }
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
        renderMonthlyMulti(monthlyWeatherCtx, weatherResults);
    } else {
        console.warn("#monthly-weather canvas not found.");
    }


    // Gráfico Weather Type Distribution
    const conditionPieCtx = document.getElementById("condition-pie");
    if (conditionPieCtx) {
        renderPie(conditionPieCtx, conditions);
    } else {
        console.warn("#condition-pie canvas not found.");
    }

    // Tabla de Estadísticas Mensuales
    const monthlyTableBody = document.getElementById("monthly-table")?.querySelector("tbody");
    if (monthlyTableBody) {
        renderMonthlyStatsTable(monthlyTableBody, weatherResults);
    } else {
        console.warn("#monthly-table tbody not found.");
    }

    // Matriz de Correlación
    const corrMatrixDiv = document.getElementById("corr-matrix");
    if (corrMatrixDiv) {
        renderCorrelationMatrix(corrMatrixDiv, { temps, rains, winds, humidities, paces, distances, pressures, cloudcovers });
    } else {
        console.warn("#corr-matrix div not found.");
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

    // --- NUEVA SECCIÓN: Interactive Scatter Plot ---
    const customScatterCtx = document.getElementById("custom-scatter-chart");
    const scatterXSelect = document.getElementById("scatter-x-select");
    const scatterYSelect = document.getElementById("scatter-y-select");
    const scatterSizeInput = document.getElementById("scatter-size-input");
    const scatterColorSelect = document.getElementById("scatter-color-select");

    if (customScatterCtx && scatterXSelect && scatterYSelect && scatterSizeInput && scatterColorSelect) {
        const scatterVariables = [
            { value: 'temperature', text: 'Temperature (°C)' },
            { value: 'precipitation', text: 'Rainfall (mm)' },
            { value: 'wind_speed', text: 'Wind Speed (km/h)' },
            { value: 'wind_direction', text: 'Wind Direction (°)' }, // Ahora disponible
            { value: 'humidity', text: 'Humidity (%)' },
            { value: 'cloudcover', text: 'Cloud Cover (%)' },
            { value: 'pressure', text: 'Pressure (hPa)' },
            { value: 'pace', text: 'Pace (min/km)' },
            { value: 'distance', text: 'Distance (km)' },
            { value: 'moving_time', text: 'Time (min)' },
            // Añade aquí cualquier otra variable numérica que hayas incluido en combinedWeatherData
        ];

        // Llenar los selectores de los ejes X e Y
        scatterVariables.forEach(v => {
            const optX = document.createElement('option');
            optX.value = v.value;
            optX.textContent = v.text;
            scatterXSelect.appendChild(optX);

            const optY = document.createElement('option');
            optY.value = v.value;
            optY.textContent = v.text;
            scatterYSelect.appendChild(optY);
        });

        // Opciones de color adicionales
        const colorOptions = [
            { value: 'temp_gradient', text: 'Temperature Gradient' },
            { value: 'pace_gradient', text: 'Pace Gradient' },
            { value: 'fixed_red', text: 'Fixed Red' },
            { value: 'fixed_blue', text: 'Fixed Blue' },
            { value: 'fixed_green', text: 'Fixed Green' },
            // Puedes añadir más si lo deseas
        ];
        colorOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            scatterColorSelect.appendChild(option);
        });


        // Establecer valores iniciales
        scatterXSelect.value = 'temperature';
        scatterYSelect.value = 'pace';
        scatterSizeInput.value = '5';
        scatterColorSelect.value = 'temp_gradient';


        // Función para renderizar el gráfico interactivo
        const updateScatterChart = () => {
            const xVar = scatterXSelect.value;
            const yVar = scatterYSelect.value;
            const pointSize = parseInt(scatterSizeInput.value, 10);
            const colorScheme = scatterColorSelect.value;

            // Pasa combinedWeatherData a la función
            renderCustomScatter(customScatterCtx, combinedWeatherData, xVar, yVar, pointSize, colorScheme);
        };

        // Escuchadores de eventos
        scatterXSelect.addEventListener('change', updateScatterChart);
        scatterYSelect.addEventListener('change', updateScatterChart);
        scatterSizeInput.addEventListener('input', updateScatterChart); // Usa 'input' para actualización en tiempo real al arrastrar
        scatterColorSelect.addEventListener('change', updateScatterChart);

        // Renderizar el gráfico inicial
        updateScatterChart();

    } else {
        console.warn("Interactive Scatter Plot elements (canvas custom-scatter-chart, selects, inputs) not found.");
    }
    // --- FIN NUEVA SECCIÓN ---
}

// ---------------- FETCH WEATHER ----------------
async function getWeatherForRun(run) {
    if (!run.start_latlng || run.start_latlng.length < 2) {
        console.warn(`Run ${run.name} does not have valid start latitude/longitude.`);
        return null;
    }

    const [lat, lon] = run.start_latlng;
    const start = new Date(run.start_date_local);
    const dateStr = start.toISOString().split("T")[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,weathercode,cloudcover,surface_pressure,relativehumidity_2m&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        const data = await res.json();

        if (!data.hourly || !data.hourly.time || !data.hourly.time.length) {
            console.warn("No hourly weather data available for run", run.name, dateStr);
            return null;
        }

        const hour = start.getHours();
        let idx = data.hourly.time.findIndex(t => new Date(t).getHours() === hour);

        if (idx === -1) {
            console.warn(`Exact hour ${hour} not found for ${dateStr}. Using closest available index.`);
            idx = Math.min(hour, data.hourly.time.length - 1);
        }

        return {
            temperature: numericSafe(data.hourly.temperature_2m[idx]),
            precipitation: numericSafe(data.hourly.precipitation[idx]),
            wind_speed: numericSafe(data.hourly.wind_speed_10m[idx]),
            wind_direction: numericSafe(data.hourly.wind_direction_10m[idx]),
            weather_code: data.hourly.weathercode ? data.hourly.weathercode[idx] : null,
            weather_text: weatherCodeToText(data.hourly.weathercode ? data.hourly.weathercode[idx] : null),
            humidity: numericSafe(data.hourly.relativehumidity_2m ? data.hourly.relativehumidity_2m[idx] : null),
            cloudcover: numericSafe(data.hourly.cloudcover ? data.hourly.cloudcover[idx] : null),
            pressure: numericSafe(data.hourly.surface_pressure ? data.hourly.surface_pressure[idx] : null),
        };

    } catch (err) {
        console.error(`Weather fetch for ${run.name} (${dateStr}) failed:`, err);
        return null;
    }
}



function weatherCodeToText(code, general = true) {
    const specificMap = {
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

    if (!general) return specificMap[code] || `Unknown (${code})`;

    // Map general categories
    const generalMap = {
        0: "Clear", 1: "Clear", 2: "Cloudy", 3: "Cloudy",
        45: "Fog", 48: "Fog",
        51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
        56: "Drizzle", 57: "Drizzle",
        61: "Rain", 63: "Rain", 65: "Rain",
        66: "Rain", 67: "Rain",
        71: "Snowfall", 73: "Snowfall", 75: "Snowfall",
        77: "Snowfall",
        80: "Rain", 81: "Rain", 82: "Rain",
        85: "Snowfall", 86: "Snowfall",
        95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
    };

    return generalMap[code] || `Unknown (${code})`;
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
        if (!byMonth[m]) byMonth[m] = { temp: [], rain: [], wind: [], humidity: [], pressure: [], cloudcover: [] };
        byMonth[m].temp.push(w.temperature);
        byMonth[m].rain.push(w.precipitation);
        byMonth[m].wind.push(w.wind_speed);
        byMonth[m].humidity.push(w.humidity);
        byMonth[m].pressure.push(w.pressure);
        byMonth[m].cloudcover.push(w.cloudcover);
    });
    const months = Object.keys(byMonth).sort((a, b) => a - b);
    const labels = months.map((m) => monthName(+m));
    const avgTemp = months.map((m) => mean(byMonth[m].temp));
    const totalRain = months.map((m) => sum(byMonth[m].rain));
    const avgWind = months.map((m) => mean(byMonth[m].wind));
    const avgHumidity = months.map((m) => mean(byMonth[m].humidity));
    const avgPressure = months.map((m) => mean(byMonth[m].pressure));
    const avgCloudcover = months.map((m) => mean(byMonth[m].cloudcover));

    new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { type: "line", label: "Temp (°C)", data: avgTemp, borderColor: "red", backgroundColor: "rgba(255, 99, 132, 0.2)", fill: false, yAxisID: "y1" },
                { label: "Rain (mm)", data: totalRain, backgroundColor: "rgba(0,0,255,0.3)", yAxisID: "y" },
                { type: "line", label: "Wind (km/h)", data: avgWind, borderColor: "green", backgroundColor: "rgba(75, 192, 192, 0.2)", fill: false, yAxisID: "y2" },
                { type: "line", label: "Humidity (%)", data: avgHumidity, borderColor: "purple", backgroundColor: "rgba(153, 102, 255, 0.2)", fill: false, yAxisID: "y3" },
                { type: "line", label: "Pressure (hPa)", data: avgPressure, borderColor: "orange", backgroundColor: "rgba(255, 159, 64, 0.2)", fill: false, yAxisID: "y4" },
                { type: "line", label: "Cloud Cover (%)", data: avgCloudcover, borderColor: "blue", backgroundColor: "rgba(54, 162, 235, 0.2)", fill: false, yAxisID: "y5" },
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
                y4: { type: "linear", position: "right", grid: { drawOnChartArea: false }, title: { text: "Pressure (hPa)", display: true }, beginAtZero: false },
                y5: { type: "linear", position: "left", grid: { drawOnChartArea: false }, title: { text: "Cloud Cover (%)", display: true }, beginAtZero: true, max: 100 },
            },
        },
    });
}

// Asegúrate de que estas funciones de utilidad estén presentes en tu archivo weather.js
// --- UTILITIES FOR SCATTER ---
function getGradientColor(value, min, max, type = 'temp') {
    let r, g, b;
    const ratio = (value - min) / (max - min);

    if (type === 'temp') {
        // Frío (azul) a cálido (rojo)
        r = Math.floor(255 * ratio);
        g = 0;
        b = Math.floor(255 * (1 - ratio));
    } else if (type === 'pace') {
        // Más rápido (verde) a más lento (rojo)
        r = Math.floor(255 * ratio); // Aumenta el rojo con mayor pace (más lento)
        g = Math.floor(255 * (1 - ratio)); // Disminuye el verde
        b = 0;
    } else {
        // Por defecto, un simple gradiente
        r = Math.floor(255 * ratio);
        g = Math.floor(255 * (1 - ratio));
        b = 100;
    }
    return `rgb(${r}, ${g}, ${b}, 0.8)`;
}

function getMinMax(dataArray, prop) {
    if (!dataArray || dataArray.length === 0) return { min: 0, max: 1 };
    const values = dataArray.map(item => item[prop]).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
}
// --- END UTILITIES FOR SCATTER ---


function renderCustomScatter(ctx, data, xVar, yVar, pointSize, colorScheme) {
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    if (!data || data.length === 0 || !xVar || !yVar) {
        console.warn(`No data or variables for custom scatter plot: ${xVar} vs ${yVar}`);
        const chart = new Chart(ctx, { type: "scatter", data: { datasets: [] } });
        const ctx2d = ctx.getContext('2d');
        if (ctx2d) {
            ctx2d.font = "18px Arial";
            ctx2d.textAlign = "center";
            ctx2d.fillStyle = "#888";
            ctx2d.clearRect(0, 0, ctx.width, ctx.height);
            ctx2d.fillText("No data or selection available", ctx.width / 2, ctx.height / 2);
        }
        return chart;
    }

    // Etiquetas para los ejes (¡actualizadas con todas las variables!)
    const labelsMap = {
        'temperature': 'Temperature (°C)',
        'precipitation': 'Rainfall (mm)',
        'wind_speed': 'Wind Speed (km/h)',
        'humidity': 'Humidity (%)',
        'cloudcover': 'Cloud Cover (%)',
        'pressure': 'Pressure (hPa)',
        'pace': 'Pace (min/km)',
        'distance': 'Distance (km)',
        'moving_time': 'Time (min)',
        'wind_direction': 'Wind Direction (°)',
        // Agrega aquí cualquier otra propiedad que quieras que se muestre con un texto bonito
    };

    // Fallback más elegante para etiquetas si no están en labelsMap
    const getAxisLabel = (variable) => labelsMap[variable] || variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const xlabel = getAxisLabel(xVar);
    const ylabel = getAxisLabel(yVar);

    // Calcular el color de los puntos
    let pointBackgroundColors = 'rgba(255, 99, 132, 0.6)'; // Color por defecto
    if (colorScheme === 'temp_gradient') {
        const { min, max } = getMinMax(data, 'temperature');
        pointBackgroundColors = data.map(item => getGradientColor(item.temperature, min, max, 'temp'));
    } else if (colorScheme === 'pace_gradient') {
        const { min, max } = getMinMax(data, 'pace');
        pointBackgroundColors = data.map(item => getGradientColor(item.pace, min, max, 'pace'));
    } else if (colorScheme === 'fixed_red') {
        pointBackgroundColors = 'rgba(255, 0, 0, 0.6)';
    } else if (colorScheme === 'fixed_blue') {
        pointBackgroundColors = 'rgba(0, 0, 255, 0.6)';
    } else if (colorScheme === 'fixed_green') {
        pointBackgroundColors = 'rgba(0, 255, 0, 0.6)';
    }


    return new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [
                {
                    label: `${xlabel} vs ${ylabel}`,
                    data: data.map((item) => ({
                        x: item[xVar],
                        y: item[yVar]
                    })),
                    backgroundColor: pointBackgroundColors,
                    pointRadius: pointSize, // Aplicar el tamaño de los puntos
                    pointHoverRadius: pointSize + 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { text: xlabel, display: true },
                    beginAtZero: false // Por si las temperaturas o paces no empiezan en 0
                },
                y: {
                    title: { text: ylabel, display: true },
                    beginAtZero: false
                },
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = data[context.dataIndex]; // Usa 'data' directamente
                            if (item) {
                                const tooltipLines = [
                                    `${item.run_name || 'Unnamed Run'}`,
                                    `Date: ${new Date(item.run_date).toLocaleDateString()}`,
                                    `${xlabel}: ${item[xVar]?.toFixed(item[xVar] < 10 ? 2 : 1) ?? 'N/A'}`, // Formato dinámico
                                    `${ylabel}: ${item[yVar]?.toFixed(item[yVar] < 10 ? 2 : 1) ?? 'N/A'}`, // Formato dinámico
                                    `Pace: ${item.pace?.toFixed(2) ?? 'N/A'} min/km`,
                                    `Distance: ${item.distance?.toFixed(2) ?? 'N/A'} km`,
                                    `Time: ${item.moving_time?.toFixed(0) ?? 'N/A'} min`,
                                    `Temp: ${item.temperature?.toFixed(1) ?? 'N/A'}°C`,
                                    `Humidity: ${item.humidity?.toFixed(0) ?? 'N/A'}%`,
                                    `Wind: ${item.wind_speed?.toFixed(1) ?? 'N/A'} km/h`,
                                    `Rain: ${item.precipitation?.toFixed(1) ?? 'N/A'} mm`,
                                    `Pressure: ${item.pressure?.toFixed(0) ?? 'N/A'} hPa`,
                                    `Cloud Cover: ${item.cloudcover?.toFixed(0) ?? 'N/A'}%`,
                                    `Condition: ${item.weather_text ?? 'N/A'}`
                                ];
                                return tooltipLines.filter(line => !line.includes('N/A')); // Filtra líneas si el dato no está disponible
                            }
                            return `${xlabel}: ${context.raw.x}, ${ylabel}: ${context.raw.y}`;
                        }
                    }
                }
            },
            // Añadir animación para un mejor UX al cambiar los datos
            animation: {
                duration: 500,
                easing: 'easeOutQuart'
            }
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
        const avgPressure = mean(arr.map((a) => a.pressure)).toFixed(1);
        const avgCloudcover = mean(arr.map((a) => a.cloudcover)).toFixed(1);

        const row = tbodyElement.insertRow();
        row.insertCell().textContent = monthName(+m);
        row.insertCell().textContent = avgTemp;
        row.insertCell().textContent = avgWind;
        row.insertCell().textContent = totalRain;
        row.insertCell().textContent = avgHumidity;
        row.insertCell().textContent = avgPressure;
        row.insertCell().textContent = avgCloudcover;
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


function renderRunsByMetric(data) {
    const metric = document.getElementById("metric-select").value;
    const container = document.getElementById("runs-container");
    if (!container) return;

    const sorted = [...data].sort((a, b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity));
    const top5 = sorted.slice(0, 5);
    const bottom5 = sorted.slice(-5).reverse(); // últimos 5 en orden ascendente

    container.innerHTML = `
        <h4>Top 5 ${capitalize(metric)}</h4>${listRuns(top5, metric, getUnit(metric))}
        <h4>Bottom 5 ${capitalize(metric)}</h4>${listRuns(bottom5, metric, getUnit(metric))}
    `;
}

// helpers
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getUnit(metric) {
    switch(metric) {
        case "temperature": return "°C";
        case "wind_speed": return " km/h";
        case "precipitation": return " mm";
        case "pressure": return " hPa";
        case "cloudcover": return " %";
        default: return "";
    }
}

// actualizar al cambiar la selección
document.getElementById("metric-select").addEventListener("change", () => renderRunsByMetric(weatherResults));

// también puedes llamar al cargar la página
renderRunsByMetric(weatherResults);


function renderRunsList(tbodyElement, weatherResults) {
    tbodyElement.innerHTML = "";

    weatherResults.forEach((item) => {
        const { run, temperature, precipitation, wind_speed, humidity, pressure, cloudcover, weather_text } = item;

        const row = tbodyElement.insertRow();
        row.insertCell().textContent = run.name || "Unnamed";
        row.insertCell().textContent = new Date(run.start_date_local).toLocaleDateString();
        row.insertCell().textContent = ((run.distance || 0) / 1000).toFixed(2);
        row.insertCell().textContent = runPaceMinPerKm(run).toFixed(2);
        row.insertCell().textContent = `${temperature?.toFixed(1) ?? "–"}°C`;
        row.insertCell().textContent = `${humidity?.toFixed(0) ?? "–"}%`;
        row.insertCell().textContent = `${wind_speed?.toFixed(1) ?? "–"} km/h`;
        row.insertCell().textContent = `${precipitation?.toFixed(1) ?? "–"} mm`;
        row.insertCell().textContent = `${pressure?.toFixed(0) ?? "–"} hPa`;
        row.insertCell().textContent = `${cloudcover?.toFixed(0) ?? "–"}%`;
        row.insertCell().textContent = weather_text || "–";
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

