// weather-analytics.js
// Versión completa y mejorada — lista para usar con tu HTML actual

export async function renderWeatherTab(allActivities) {
  console.log("Initializing Weather Analytics — received", allActivities.length, "activities");
  const container = document.getElementById("weather-summary");
  if (!container) return console.error("weather-summary container not found");

  container.innerHTML = `
    <div class="wa-stats-row" id="wa-stats-row">Loading summary...</div>
    <div id="wa-hist-selector" class="wa-selector"></div>
    <div id="wa-charts" class="wa-charts-grid"></div>
    <div id="wa-topruns"></div>
    <div id="wa-runslist"></div>
  `;

  const runs = allActivities.filter(
    (a) => a.type?.toLowerCase().includes("run") && a.start_latlng && a.start_date_local
  );
  if (!runs.length) {
    container.innerHTML = "<p>No running activities with GPS/time found.</p>";
    return;
  }

  // Fetch weather data
  const weatherResults = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const w = await getWeatherForRun(run);
    if (w) weatherResults.push({ run, ...w });
    await sleep(100);
  }
  if (!weatherResults.length)
    return (container.innerHTML = "<p>No weather data retrieved.</p>");

  // Arrays for analysis
  const temps = weatherResults.map((r) => r.temperature);
  const rains = weatherResults.map((r) => r.precipitation);
  const winds = weatherResults.map((r) => r.wind_speed);
  const conditions = weatherResults.map((r) => r.weather_text);
  const paces = weatherResults.map((r) => runPaceMinPerKm(r.run));
  const distances = weatherResults.map((r) => (r.run.distance || 0) / 1000);

  // Summary cards
  const statsRow = document.getElementById("wa-stats-row");
  statsRow.innerHTML = `
    <div class="wa-card"><h4>Avg Temp</h4><div class="wa-val">${mean(temps).toFixed(1)}°C</div></div>
    <div class="wa-card"><h4>Avg Wind</h4><div class="wa-val">${mean(winds).toFixed(1)} km/h</div></div>
    <div class="wa-card"><h4>Total Rain</h4><div class="wa-val">${sum(rains).toFixed(1)} mm</div></div>
    <div class="wa-card"><h4>Common</h4><div class="wa-val">${mode(conditions)}</div></div>
  `;

  // Selector
  document.getElementById("wa-hist-selector").innerHTML = `
    <label>Select histogram: </label>
    <select id="hist-select">
      <option value="temp">Temperature</option>
      <option value="rain">Rainfall</option>
      <option value="wind">Wind Speed</option>
    </select>
  `;

  // Charts grid
  const charts = document.getElementById("wa-charts");
  charts.innerHTML = `
    <div class="wa-chart"><h5 id="hist-title">Temperature Histogram</h5><canvas id="histogram"></canvas></div>
    <div class="wa-chart"><h5>Monthly Weather Overview</h5><canvas id="monthly-multi"></canvas></div>
    <div class="wa-chart"><h5>Temp vs Pace</h5><canvas id="temp-vs-pace"></canvas></div>
    <div class="wa-chart"><h5>Conditions</h5><canvas id="condition-pie"></canvas></div>
    <div class="wa-chart"><h5>Monthly Stats</h5><div id="monthly-stats-table"></div></div>
    <div class="wa-chart"><h5>Correlation Matrix</h5><div id="corr-matrix"></div></div>
  `;

  // Histogram + selector
  const ctxHist = document.getElementById("histogram");
  let histChart = renderHistogram(ctxHist, temps, "Temperature (°C)");
  document.getElementById("hist-select").addEventListener("change", (e) => {
    histChart.destroy();
    const v = e.target.value;
    if (v === "temp") histChart = renderHistogram(ctxHist, temps, "Temperature (°C)");
    if (v === "rain") histChart = renderHistogram(ctxHist, rains, "Rainfall (mm)");
    if (v === "wind") histChart = renderHistogram(ctxHist, winds, "Wind Speed (km/h)");
    document.getElementById("hist-title").innerText =
      `${e.target.options[e.target.selectedIndex].text} Histogram`;
  });

  // Render all charts
  renderMonthlyMulti("monthly-multi", weatherResults);
  renderScatter("temp-vs-pace", temps, paces, "Temp (°C)", "Pace (min/km)");
  renderPie("condition-pie", conditions);
  renderMonthlyStatsTable("monthly-stats-table", weatherResults);
  renderCorrelationMatrix("corr-matrix", { temps, rains, winds, paces, distances });

  renderTopRuns(document.getElementById("wa-topruns"), weatherResults);
  renderRunsList(document.getElementById("wa-runslist"), weatherResults);
}

// ---------------- FETCH WEATHER ----------------
async function getWeatherForRun(run) {
  const [lat, lon] = run.start_latlng;
  const start = new Date(run.start_date_local);
  const dateStr = start.toISOString().split("T")[0];

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,weathercode&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.hourly || !data.hourly.time || !data.hourly.time.length) {
      console.warn("No weather data for run", run.name, dateStr);
      return null;
    }

    const idx = Math.min(start.getHours(), data.hourly.time.length - 1);

    return {
      temperature: numericSafe(data.hourly.temperature_2m[idx]),
      precipitation: numericSafe(data.hourly.precipitation[idx]),
      wind_speed: numericSafe(data.hourly.wind_speed_10m[idx]),
      weather_code: data.hourly.weathercode ? data.hourly.weathercode[idx] : null,
      weather_text: weatherCodeToText(data.hourly.weathercode ? data.hourly.weathercode[idx] : null),
    };

  } catch (err) {
    console.error("Weather fetch failed:", err);
    return null;
  }
}


function weatherCodeToText(code) {
  const map = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 51: "Drizzle", 61: "Rain", 71: "Snow", 95: "Thunderstorm",
  };
  return map[code] || "Unknown";
}

// ---------------- CHARTS ----------------
function renderHistogram(ctx, data, label) {
  const bins = 10, minv = Math.min(...data), maxv = Math.max(...data);
  const width = (maxv - minv) / bins || 1, counts = new Array(bins).fill(0);
  data.forEach((v) => counts[Math.min(bins - 1, Math.max(0, Math.floor((v - minv) / width)))]++);
  const labels = counts.map((_, i) => `${(minv + i * width).toFixed(1)}–${(minv + (i + 1) * width).toFixed(1)}`);
  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label, data: counts }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } },
  });
}

function renderMonthlyMulti(id, data) {
  const ctx = document.getElementById(id);
  const byMonth = {};
  data.forEach((w) => {
    const m = new Date(w.run.start_date_local).getMonth();
    if (!byMonth[m]) byMonth[m] = { temp: [], rain: [], wind: [] };
    byMonth[m].temp.push(w.temperature);
    byMonth[m].rain.push(w.precipitation);
    byMonth[m].wind.push(w.wind_speed);
  });
  const months = Object.keys(byMonth).sort((a, b) => a - b);
  const labels = months.map((m) => monthName(+m));
  const avgTemp = months.map((m) => mean(byMonth[m].temp));
  const totalRain = months.map((m) => sum(byMonth[m].rain));
  const avgWind = months.map((m) => mean(byMonth[m].wind));

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { type: "line", label: "Temp (°C)", data: avgTemp, borderColor: "red", yAxisID: "y1" },
        { label: "Rain (mm)", data: totalRain, backgroundColor: "rgba(0,0,255,0.3)", yAxisID: "y" },
        { type: "line", label: "Wind (km/h)", data: avgWind, borderColor: "green", yAxisID: "y2" },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { type: "linear", position: "left", title: { text: "Rain (mm)", display: true } },
        y1: { type: "linear", position: "right", grid: { drawOnChartArea: false }, title: { text: "Temp (°C)", display: true } },
        y2: { type: "linear", position: "right", grid: { drawOnChartArea: false }, title: { text: "Wind (km/h)", display: true } },
      },
    },
  });
}

function renderScatter(id, x, y, xlabel, ylabel) {
  new Chart(document.getElementById(id), {
    type: "scatter",
    data: {
      datasets: [
        { label: `${xlabel} vs ${ylabel}`, data: x.map((v, i) => ({ x: v, y: y[i] })) },
      ],
    },
    options: {
      scales: {
        x: { title: { text: xlabel, display: true } },
        y: { title: { text: ylabel, display: true } },
      },
    },
  });
}

function renderPie(id, data) {
  const counts = {};
  data.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
  new Chart(document.getElementById(id), {
    type: "pie",
    data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts) }] },
  });
}

function renderMonthlyStatsTable(id, data) {
  const byMonth = {};
  data.forEach((w) => {
    const m = new Date(w.run.start_date_local).getMonth();
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(w);
  });
  const months = Object.keys(byMonth).sort((a, b) => a - b);
  let html = `<table class="wa-table"><tr><th>Month</th><th>Avg Temp</th><th>Avg Wind</th><th>Rain</th></tr>`;
  months.forEach((m) => {
    const arr = byMonth[m];
    html += `<tr><td>${monthName(+m)}</td><td>${mean(arr.map((a) => a.temperature)).toFixed(1)}</td><td>${mean(arr.map((a) => a.wind_speed)).toFixed(1)}</td><td>${sum(arr.map((a) => a.precipitation)).toFixed(1)}</td></tr>`;
  });
  html += "</table>";
  document.getElementById(id).innerHTML = html;
}

function renderCorrelationMatrix(id, data) {
  const vars = Object.keys(data);
  let html = `<table class="wa-corr"><tr><th></th>${vars.map((v) => `<th>${v}</th>`).join("")}</tr>`;
  for (let i of vars) {
    html += `<tr><th>${i}</th>`;
    for (let j of vars) {
      const corr = correlation(data[i], data[j]);
      const color = corrColor(corr);
      html += `<td style="background:${color}">${corr.toFixed(2)}</td>`;
    }
    html += `</tr>`;
  }
  html += "</table>";
  document.getElementById(id).innerHTML = html;
}

function renderTopRuns(container, data) {
  const hottest = [...data].sort((a, b) => b.temperature - a.temperature).slice(0, 5);
  const coldest = [...data].sort((a, b) => a.temperature - b.temperature).slice(0, 5);
  const windiest = [...data].sort((a, b) => b.wind_speed - a.wind_speed).slice(0, 5);
  container.innerHTML = `
    <h3>Top 5 Hottest</h3>${listRuns(hottest)}
    <h3>Top 5 Coldest</h3>${listRuns(coldest)}
    <h3>Top 5 Windiest</h3>${listRuns(windiest)}
  `;
}

function renderRunsList(container, data) {
  let html = "<h3>All Runs with Weather</h3>";
  data.forEach((w) => {
    const run = w.run;
    html += `<div class="wa-run-row"><span>${new Date(run.start_date_local).toLocaleDateString()}</span>
      <span>${(run.distance / 1000).toFixed(1)} km</span>
      <span>${runPaceMinPerKm(run).toFixed(1)} min/km</span>
      <span>${w.temperature.toFixed(1)}°C</span>
      <span>${w.wind_speed.toFixed(1)} km/h</span>
      <span>${w.precipitation.toFixed(1)} mm</span>
      <span>${w.weather_text}</span></div>`;
  });
  container.innerHTML = html;
}

function listRuns(arr) {
  return `<ul>${arr
    .map(
      (r) =>
        `<li>${new Date(r.run.start_date_local).toLocaleDateString()} — ${r.temperature.toFixed(
          1
        )}°C, ${r.wind_speed.toFixed(1)} km/h</li>`
    )
    .join("")}</ul>`;
}

// ---------------- UTILITIES ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => (a.length ? a.reduce((x, y) => x + y, 0) : 0);
const mode = (arr) => {
  const map = {};
  arr.forEach((v) => (map[v] = (map[v] || 0) + 1));
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0][0];
};
function correlation(x, y) {
  const n = x.length;
  const mx = mean(x), my = mean(y);
  const num = x.reduce((a, _, i) => a + (x[i] - mx) * (y[i] - my), 0);
  const den = Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
  return den === 0 ? 0 : num / den;
}
function corrColor(corr) {
    // Escala de -1 (rojo) a 1 (azul), pasando por blanco/gris en 0
    const red = Math.floor(255 * (1 - corr)); // Más rojo para corr baja
    const blue = Math.floor(255 * (1 + corr)); // Más azul para corr alta
    const green = 255 - Math.abs(corr) * 100; // Mantener un poco de verde para neutral

    // Asegurarse de que los valores estén en el rango 0-255
    return `rgb(${Math.max(0, Math.min(255, red))}, ${Math.max(0, Math.min(255, green))}, ${Math.max(0, Math.min(255, blue))})`;
}
function monthName(i) {
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i];
}
function runPaceMinPerKm(run) {
  const pace = run.moving_time / (run.distance / 1000) / 60;
  return pace;
}

function numericSafe(v) {
  return v === null || v === undefined ? 0 : Number(v);
}