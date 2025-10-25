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
    if (runs.length === 0) {
        container.innerHTML = "<p>No running activities found to analyze weather.</p>";
        return;
    }

    container.innerHTML = "<p>Fetching weather data... this may take a moment ⏳</p>";

    // --- Pedir datos climáticos por cada carrera ---
    const weatherResults = [];
    for (const run of runs) {
        const weather = await getWeatherForRun(run);
        if (weather) weatherResults.push(weather);
        await sleep(300); // pequeño delay para evitar demasiadas llamadas seguidas
    }

    if (weatherResults.length === 0) {
        container.innerHTML = "<p>No weather data could be retrieved.</p>";
        return;
    }

    // --- Estadísticas generales ---
    const avgTemp = mean(weatherResults.map(w => w.temperature));
    const avgWind = mean(weatherResults.map(w => w.wind_speed));
    const avgRain = mean(weatherResults.map(w => w.precipitation));
    const commonCondition = mode(weatherResults.map(w => w.weather_text));

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

    try {
        const res = await fetch(`${baseUrl}?${params.toString()}`);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
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
