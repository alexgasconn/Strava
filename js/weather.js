// js/weather.js
// Weather tab — analiza las condiciones meteorológicas promedio en tus runs
// usando Open-Meteo Historical API (gratuita, sin clave)

export async function renderWeatherTab(allActivities) {
    console.log("Initializing Weather Tab...");

    const container = document.getElementById("weather-summary");
    if (!container) {
        console.error("Weather container not found!");
        return;
    }

    const runs = allActivities.filter(a => a.type && a.type.includes("Run") && a.start_latlng);
    console.log(`Found ${runs.length} runs with location data.`);

    if (runs.length === 0) {
        container.innerHTML = "<p>No running activities found to analyze weather.</p>";
        return;
    }

    container.innerHTML = "<p>Fetching weather data... this may take a moment ⏳</p>";

    const weatherResults = [];
    for (const run of runs) {
        console.groupCollapsed(`🌤 Fetching weather for run: ${run.name || "Unnamed"} (${run.start_date_local})`);
        const weather = await getWeatherForRun(run);
        console.groupEnd();
        if (weather) {
            console.log("✅ Weather received:", weather);
            weatherResults.push(weather);
        } else {
            console.warn("⚠️ No weather data retrieved for this run.");
        }
        await sleep(300);
    }

    if (weatherResults.length === 0) {
        container.innerHTML = "<p>No weather data could be retrieved.</p>";
        return;
    }

    const avgTemp = mean(weatherResults.map(w => w.temperature));
    const avgWind = mean(weatherResults.map(w => w.wind_speed));
    const avgRain = mean(weatherResults.map(w => w.precipitation));
    const commonCondition = mode(weatherResults.map(w => w.weather_text));

    console.log("🌡️ Average Weather Summary:", {
        avgTemp,
        avgWind,
        avgRain,
        commonCondition,
        count: weatherResults.length
    });

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1em;">
            <div class="stat-card">
                <h3>🌡 Avg Temperature</h3>
                <p>${avgTemp.toFixed(1)} °C</p>
            </div>
            <div class="stat-card">
                <h3>💨 Avg Wind Speed</h3>
                <p>${avgWind.toFixed(1)} km/h</p>
            </div>
            <div class="stat-card">
                <h3>🌧 Avg Rainfall</h3>
                <p>${avgRain.toFixed(2)} mm</p>
            </div>
            <div class="stat-card">
                <h3>☁️ Most Frequent Condition</h3>
                <p>${commonCondition}</p>
            </div>
        </div>
        <p style="margin-top:1em;color:#777;">Based on ${weatherResults.length} runs with available weather data.</p>
    `;
}

// ----------------- helpers -----------------

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
    const url = `${baseUrl}?${params.toString()}`;

    console.log("📡 Fetching weather from:", url);

    try {
        const res = await fetch(url);
        console.log("🔍 Response status:", res.status, res.statusText);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log("📦 Raw data received:", data);

        if (!data.hourly || !data.hourly.time) {
            console.warn("❌ Missing 'hourly' data in response.");
            return null;
        }

        const hour = new Date(run.start_date_local).getHours();
        const idx = data.hourly.time.findIndex(t => new Date(t).getHours() === hour);
        console.log("🕒 Matching hour:", hour, "→ Index found:", idx);

        if (idx === -1) {
            console.warn("⚠️ No matching hour found for this run.");
            return null;
        }

        const result = {
            temperature: data.hourly.temperature_2m[idx],
            precipitation: data.hourly.precipitation[idx],
            wind_speed: data.hourly.wind_speed_10m[idx],
            weather_code: data.hourly.weathercode[idx],
            weather_text: weatherDescription(data.hourly.weathercode[idx])
        };

        console.log("🌤 Extracted weather data:", result);
        return result;

    } catch (err) {
        console.error("🚨 Weather fetch error:", err);
        return null;
    }
}

function weatherDescription(code) {
    const map = {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        51: "Light drizzle",
        61: "Light rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Snow",
        95: "Thunderstorm"
    };
    return map[code] || "Unknown";
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length || 0;
const mode = arr => {
    const freq = {};
    arr.forEach(v => (freq[v] = (freq[v] || 0) + 1));
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
};
