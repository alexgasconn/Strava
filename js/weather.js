// js/weather.js
// Complete Weather Analytics tab using Open-Meteo + Chart.js
// Uses data from your runs to visualize weather trends

export async function renderWeatherTab(allActivities) {
    console.log("Initializing Weather Tab... received activities:", allActivities.length);

    const container = document.getElementById("weather-summary");
    if (!container) {
        console.error("Weather container not found!");
        return;
    }

    const runs = allActivities.filter(a => a.type?.includes("Run") && a.start_latlng);
    console.log("Filtered runs with location:", runs.length);

    if (runs.length === 0) {
        container.innerHTML = "<p>No running activities found with GPS data.</p>";
        return;
    }

    container.innerHTML = "<p>Fetching weather data for your runs ⏳</p>";

    const weatherResults = [];
    for (const [i, run] of runs.entries()) {
        console.log(`Fetching weather ${i + 1}/${runs.length}: ${run.name}`);
        const w = await getWeatherForRun(run);
        if (w) weatherResults.push({ ...w, run });
        await sleep(300);
    }

    console.log("✅ Weather fetch completed:", weatherResults.length, "records");
    if (weatherResults.length === 0) {
        container.innerHTML = "<p>No weather data could be retrieved.</p>";
        return;
    }

    // === SUMMARY ===
    const avgTemp = mean(weatherResults.map(w => w.temperature));
    const avgWind = mean(weatherResults.map(w => w.wind_speed));
    const avgRain = mean(weatherResults.map(w => w.precipitation));
    const commonCondition = mode(weatherResults.map(w => w.weather_text));

    container.innerHTML = `
        <div class="stat-grid">
            <div class="stat-card"><h3>🌡 Avg Temp</h3><p>${avgTemp.toFixed(1)} °C</p></div>
            <div class="stat-card"><h3>💨 Avg Wind</h3><p>${avgWind.toFixed(1)} km/h</p></div>
            <div class="stat-card"><h3>🌧 Avg Rain</h3><p>${avgRain.toFixed(2)} mm</p></div>
            <div class="stat-card"><h3>☁️ Common Condition</h3><p>${commonCondition}</p></div>
        </div>
        <p style="margin-top:1em;color:#777;">Based on ${weatherResults.length} runs.</p>
    `;

    // === CHARTS ===
    const temps = weatherResults.map(w => w.temperature);
    const rains = weatherResults.map(w => w.precipitation);
    const winds = weatherResults.map(w => w.wind_speed);
    const conditions = weatherResults.map(w => w.weather_text);
    const paces = weatherResults.map(w => w.run.average_speed ? 1000 / (w.run.average_speed * 60) : null); // convert m/s to min/km
    const distances = weatherResults.map(w => w.run.distance / 1000);
    const months = weatherResults.map(w => new Date(w.run.start_date_local).getMonth());

    renderHistogram("temp-hist", temps, "Temperature (°C)");
    renderHistogram("rain-hist", rains, "Rainfall (mm)");
    renderHistogram("wind-hist", winds, "Wind Speed (km/h)");
    renderScatter("temp-vs-dist", temps, distances, "Temperature", "Distance (km)");
    renderScatter("temp-vs-pace", temps, paces, "Temperature", "Pace (min/km)");
    renderPie("condition-pie", conditions);
    renderMonthly("monthly-avg", weatherResults);

    console.log("✅ All weather charts rendered.");
}

// === WEATHER FETCH ===
async function getWeatherForRun(run) {
    const [lat, lon] = run.start_latlng;
    const date = run.start_date_local.split("T")[0];
    const baseUrl = "https://archive-api.open-meteo.com/v1/archive";
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        start_date: date,
        end_date: date,
        hourly: "temperature_2m,precipitation,weathercode,wind_speed_10m",
        timezone: "auto"
    });

    try {
        console.log("Fetching weather from Open-Meteo:", date, lat, lon);
        const res = await fetch(`${baseUrl}?${params.toString()}`);
        const data = await res.json();
        console.log("Response received for", run.name, data);

        if (!data.hourly || !data.hourly.time) return null;
        const hour = new Date(run.start_date_local).getHours();
        const idx = data.hourly.time.findIndex(t => new Date(t).getHours() === hour);
        if (idx === -1) return null;

        return {
            temperature: data.hourly.temperature_2m[idx],
            precipitation: data.hourly.precipitation[idx],
            wind_speed: data.hourly.wind_speed_10m[idx],
            weather_code: data.hourly.weathercode[idx],
            weather_text: weatherDescription(data.hourly.weathercode[idx])
        };
    } catch (err) {
        console.warn("Weather fetch error:", err);
        return null;
    }
}

// === CHART HELPERS ===
function renderHistogram(id, data, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.map((_, i) => i + 1),
            datasets: [{ label, data }]
        },
        options: { responsive: true }
    });
}

function renderScatter(id, x, y, xlabel, ylabel) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const points = x.map((v, i) => ({ x: v, y: y[i] }));
    new Chart(ctx, {
        type: "scatter",
        data: { datasets: [{ label: `${ylabel} vs ${xlabel}`, data: points }] },
        options: {
            scales: { x: { title: { display: true, text: xlabel } },
                      y: { title: { display: true, text: ylabel } } }
        }
    });
}

function renderPie(id, arr) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const freq = {};
    arr.forEach(v => (freq[v] = (freq[v] || 0) + 1));
    new Chart(ctx, {
        type: "pie",
        data: {
            labels: Object.keys(freq),
            datasets: [{ data: Object.values(freq) }]
        },
        options: { responsive: true }
    });
}

function renderMonthly(id, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const monthData = {};
    data.forEach(w => {
        const m = new Date(w.run.start_date_local).getMonth();
        if (!monthData[m]) monthData[m] = [];
        monthData[m].push(w.temperature);
    });
    const labels = Object.keys(monthData).map(m => monthName(parseInt(m)));
    const temps = Object.values(monthData).map(arr => mean(arr));
    new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label: "Avg Temp by Month", data: temps }] },
        options: { responsive: true }
    });
}

// === UTILS ===
function weatherDescription(code) {
    const map = {
        0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 51: "Light drizzle", 61: "Light rain", 63: "Moderate rain",
        65: "Heavy rain", 71: "Snow", 95: "Thunderstorm"
    };
    return map[code] || "Unknown";
}

function monthName(i) {
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i];
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length || 0;
const mode = arr => Object.entries(arr.reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{})).sort((a,b)=>b[1]-a[1])[0][0];
