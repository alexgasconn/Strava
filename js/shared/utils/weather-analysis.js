const WEATHER_CACHE = new Map();

function pad(value) {
    return String(value).padStart(2, '0');
}

function toLocalDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatClock(date) {
    const normalized = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(normalized.getTime())) return '--:--';
    return `${pad(normalized.getHours())}:${pad(normalized.getMinutes())}`;
}

function mean(values) {
    const valid = values.filter(value => Number.isFinite(value));
    if (!valid.length) return null;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function mode(values) {
    const counts = new Map();
    for (const value of values) {
        if (!value) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [value, count] of counts.entries()) {
        if (count > bestCount) {
            best = value;
            bestCount = count;
        }
    }
    return best;
}

function clampIndex(value, max) {
    return Math.max(0, Math.min(max, value));
}

function decodePolyline(str) {
    if (!str) return [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates = [];

    while (index < str.length) {
        let byte;
        let shift = 0;
        let result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += deltaLat;

        shift = 0;
        result = 0;
        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += deltaLng;

        coordinates.push([lat / 1e5, lng / 1e5]);
    }

    return coordinates;
}

function bearing(fromLat, fromLon, toLat, toLon) {
    const startLat = (fromLat * Math.PI) / 180;
    const endLat = (toLat * Math.PI) / 180;
    const deltaLon = ((toLon - fromLon) * Math.PI) / 180;

    const y = Math.sin(deltaLon) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDiff(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
}

function weatherCodeToMeta(code) {
    const map = {
        0: { text: 'Clear', icon: '☀️' },
        1: { text: 'Mostly clear', icon: '🌤️' },
        2: { text: 'Partly cloudy', icon: '⛅' },
        3: { text: 'Overcast', icon: '☁️' },
        45: { text: 'Fog', icon: '🌫️' },
        48: { text: 'Fog', icon: '🌫️' },
        51: { text: 'Drizzle', icon: '🌦️' },
        53: { text: 'Drizzle', icon: '🌦️' },
        55: { text: 'Drizzle', icon: '🌦️' },
        61: { text: 'Rain', icon: '🌧️' },
        63: { text: 'Rain', icon: '🌧️' },
        65: { text: 'Rain', icon: '🌧️' },
        71: { text: 'Snow', icon: '🌨️' },
        73: { text: 'Snow', icon: '🌨️' },
        75: { text: 'Snow', icon: '🌨️' },
        80: { text: 'Showers', icon: '🌦️' },
        81: { text: 'Showers', icon: '🌦️' },
        82: { text: 'Showers', icon: '⛈️' },
        95: { text: 'Thunderstorm', icon: '⛈️' },
        96: { text: 'Thunderstorm', icon: '⛈️' },
        99: { text: 'Thunderstorm', icon: '⛈️' },
    };

    return map[code] || { text: code === null || code === undefined ? 'Unknown' : `Code ${code}`, icon: '🌡️' };
}

function windIntensityColor(speed) {
    if (!Number.isFinite(speed) || speed <= 0) return '#94a3b8';
    if (speed < 8) return '#22c55e';
    if (speed < 16) return '#84cc16';
    if (speed < 24) return '#f59e0b';
    if (speed < 32) return '#f97316';
    return '#ef4444';
}

function classifyWindRelation(routeBearing, windFromDirection) {
    if (!Number.isFinite(routeBearing) || !Number.isFinite(windFromDirection)) {
        return { key: 'unknown', label: 'Unknown', icon: '•' };
    }

    const windToDirection = (windFromDirection + 180) % 360;
    const diff = angleDiff(routeBearing, windToDirection);

    if (diff <= 45) return { key: 'tail', label: 'Tailwind', icon: '⬆️' };
    if (diff >= 135) return { key: 'head', label: 'Headwind', icon: '⬇️' };
    return { key: 'cross', label: 'Crosswind', icon: '↔️' };
}

function resolveWeatherSampleCount(activity, coords) {
    const coordCount = Array.isArray(coords) ? coords.length : 0;
    if (coordCount < 2) return 0;

    const movingMinutes = Number(activity?.moving_time || 0) / 60;
    const durationBoost = Math.floor(movingMinutes / 20);
    const baseCount = 5 + durationBoost;
    return Math.max(2, Math.min(coordCount, Math.min(14, baseCount)));
}

function buildRouteSamples(activity, coords, sampleCount = 5) {
    if (!Array.isArray(coords) || coords.length < 2) return [];

    const count = Math.max(2, Math.min(sampleCount, coords.length));
    const points = [];
    const startTime = new Date(activity.start_date_local || activity.start_date || Date.now());
    const movingTimeMs = Math.max(1, Number(activity.moving_time || 0) * 1000);

    for (let i = 0; i < count; i++) {
        const progress = count === 1 ? 0 : i / (count - 1);
        const index = clampIndex(Math.round(progress * (coords.length - 1)), coords.length - 1);
        const [lat, lon] = coords[index];
        const nextIndex = clampIndex(index + 1, coords.length - 1);
        const prevIndex = clampIndex(index - 1, coords.length - 1);
        const [nextLat, nextLon] = coords[nextIndex];
        const [prevLat, prevLon] = coords[prevIndex];
        const routeBearing = index < coords.length - 1
            ? bearing(lat, lon, nextLat, nextLon)
            : bearing(prevLat, prevLon, lat, lon);

        points.push({
            index,
            lat,
            lon,
            progress,
            time: new Date(startTime.getTime() + Math.round(progress * movingTimeMs)),
            routeBearing,
        });
    }

    return points;
}

function createWeatherMarkerHtml(point) {
    const meta = weatherCodeToMeta(point.weather_code);
    const windDirection = Number.isFinite(point.wind_direction) ? point.wind_direction : 0;
    const windToDirection = (windDirection + 180) % 360;
    const windColor = windIntensityColor(point.wind_speed);
    const temperature = Number.isFinite(point.temperature) ? `${Math.round(point.temperature)}°` : 'N/A';
    const precipitation = Number.isFinite(point.precipitation) && point.precipitation > 0.05
        ? `${point.precipitation.toFixed(1)} mm`
        : '';

    return `
        <div class="weather-map-marker" title="${meta.text}" style="--wind-color: ${windColor};">
            <div class="weather-map-marker__wind-arrow" style="transform: rotate(${windToDirection}deg)">➤</div>
            <div class="weather-map-marker__body">
                <span class="weather-map-marker__icon">${meta.icon}</span>
                <span class="weather-map-marker__temp">${temperature}</span>
                ${precipitation ? `<span class="weather-map-marker__rain">🌧️ ${precipitation}</span>` : ''}
            </div>
        </div>
    `;
}

async function buildWeatherPoints(activity, coords) {
    const sampleCount = resolveWeatherSampleCount(activity, coords);
    const samples = buildRouteSamples(activity, coords, sampleCount);
    const points = [];

    for (const sample of samples) {
        const dateKey = toLocalDateKey(sample.time);
        const weather = await fetchWeatherPoint(sample.lat, sample.lon, dateKey, sample.time);
        if (!weather) continue;

        points.push({
            ...sample,
            ...weather,
            time: sample.time,
            relation: classifyWindRelation(sample.routeBearing, weather.wind_direction),
        });
    }

    return points;
}

async function fetchWeatherPoint(lat, lon, dateKey, sampleTime) {
    const cacheKey = `${lat.toFixed(3)}:${lon.toFixed(3)}:${dateKey}`;
    if (WEATHER_CACHE.has(cacheKey)) {
        return selectNearestWeatherRecord(WEATHER_CACHE.get(cacheKey), sampleTime);
    }

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,weathercode,cloudcover,relativehumidity_2m,surface_pressure&start_date=${dateKey}&end_date=${dateKey}&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    WEATHER_CACHE.set(cacheKey, data);
    return selectNearestWeatherRecord(data, sampleTime);
}

function selectNearestWeatherRecord(data, sampleTime) {
    const hourly = data?.hourly;
    if (!hourly?.time?.length) return null;

    let bestIndex = 0;
    let bestDistance = Infinity;
    const target = sampleTime.getTime();

    hourly.time.forEach((timeValue, index) => {
        const current = new Date(timeValue).getTime();
        const distance = Math.abs(current - target);
        if (distance < bestDistance) {
            bestIndex = index;
            bestDistance = distance;
        }
    });

    return {
        temperature: Number(hourly.temperature_2m?.[bestIndex]),
        precipitation: Number(hourly.precipitation?.[bestIndex]),
        wind_speed: Number(hourly.wind_speed_10m?.[bestIndex]),
        wind_direction: Number(hourly.wind_direction_10m?.[bestIndex]),
        weather_code: hourly.weathercode?.[bestIndex] ?? null,
        weather_text: weatherCodeToMeta(hourly.weathercode?.[bestIndex]).text,
        weather_icon: weatherCodeToMeta(hourly.weathercode?.[bestIndex]).icon,
        humidity: Number(hourly.relativehumidity_2m?.[bestIndex]),
        cloudcover: Number(hourly.cloudcover?.[bestIndex]),
        pressure: Number(hourly.surface_pressure?.[bestIndex]),
        weather_time: hourly.time?.[bestIndex] || null,
    };
}

function relationSummary(points) {
    const counts = points.reduce((acc, point) => {
        acc[point.relation.key] = (acc[point.relation.key] || 0) + 1;
        return acc;
    }, {});

    const tail = counts.tail || 0;
    const head = counts.head || 0;
    const cross = counts.cross || 0;

    if (tail > head && tail >= cross) {
        return { label: 'Mostly favorable', detail: 'Tailwind is more common than headwind.', icon: '🟢' };
    }
    if (head > tail && head >= cross) {
        return { label: 'Mostly against', detail: 'Headwind is more common than tailwind.', icon: '🔴' };
    }
    return { label: 'Mixed winds', detail: 'Crosswinds and mixed conditions dominate.', icon: '🟡' };
}

function tabButton(label, panel, active = false) {
    return `<button type="button" class="weather-tab${active ? ' is-active' : ''}" data-weather-panel="${panel}">${label}</button>`;
}

function renderPointCard(point) {
    const meta = weatherCodeToMeta(point.weather_code);
    return `
        <article class="weather-point-card">
            <div class="weather-point-card__top">
                <span class="weather-point-card__badge">${Math.round(point.progress * 100)}%</span>
                <span class="weather-point-card__time">${formatClock(point.time)}</span>
            </div>
            <div class="weather-point-card__icon">${meta.icon}</div>
            <div class="weather-point-card__title">${meta.text}</div>
            <div class="weather-point-card__grid">
                <span>🌡️ ${Number.isFinite(point.temperature) ? point.temperature.toFixed(1) + '°C' : 'N/A'}</span>
                <span>💨 ${Number.isFinite(point.wind_speed) ? point.wind_speed.toFixed(1) + ' km/h' : 'N/A'}</span>
                <span>🌧️ ${Number.isFinite(point.precipitation) ? point.precipitation.toFixed(1) + ' mm' : 'N/A'}</span>
                <span>${point.relation.icon} ${point.relation.label}</span>
            </div>
        </article>
    `;
}

export async function renderWeatherAnalysis(activity, coords) {
    const section = document.getElementById('weather-analysis-section');
    if (!section) return;

    try {
        if (!activity?.id || !Array.isArray(coords) || coords.length < 2) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        const body = section.querySelector('.weather-analysis__body');
        if (!body) return;

        body.innerHTML = '<p class="empty-state">Loading weather analysis...</p>';

        const points = await buildWeatherPoints(activity, coords);

        if (!points.length) {
            body.innerHTML = '<p class="empty-state">No weather data available for this route.</p>';
            return;
        }

        const tempValues = points.map(point => point.temperature);
        const windValues = points.map(point => point.wind_speed);
        const rainValues = points.map(point => point.precipitation);
        const humidityValues = points.map(point => point.humidity);
        const conditionText = mode(points.map(point => point.weather_text));
        const windSummary = relationSummary(points);

        const panels = `
        <div class="weather-panel" data-weather-panel-content="summary">
            <div class="weather-summary-grid">
                <div class="weather-summary-card"><span>🌡️ Avg Temp</span><strong>${(mean(tempValues) ?? 0).toFixed(1)}°C</strong></div>
                <div class="weather-summary-card"><span>💨 Avg Wind</span><strong>${(mean(windValues) ?? 0).toFixed(1)} km/h</strong></div>
                <div class="weather-summary-card"><span>🌧️ Total Rain</span><strong>${rainValues.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0).toFixed(1)} mm</strong></div>
                <div class="weather-summary-card"><span>☁️ Common</span><strong>${conditionText || 'N/A'}</strong></div>
                <div class="weather-summary-card"><span>${windSummary.icon} Wind</span><strong>${windSummary.label}</strong></div>
                <div class="weather-summary-card"><span>💧 Avg Humidity</span><strong>${(mean(humidityValues) ?? 0).toFixed(1)}%</strong></div>
            </div>
            <p class="weather-summary-note">${windSummary.detail}</p>
        </div>
        <div class="weather-panel hidden" data-weather-panel-content="points">
            <div class="weather-point-grid">
                ${points.map(renderPointCard).join('')}
            </div>
        </div>
        <div class="weather-panel hidden" data-weather-panel-content="wind">
            <div class="weather-wind-block">
                <div class="weather-summary-card">
                    <span>Tailwind samples</span>
                    <strong>${points.filter(point => point.relation.key === 'tail').length}</strong>
                </div>
                <div class="weather-summary-card">
                    <span>Headwind samples</span>
                    <strong>${points.filter(point => point.relation.key === 'head').length}</strong>
                </div>
                <div class="weather-summary-card">
                    <span>Crosswind samples</span>
                    <strong>${points.filter(point => point.relation.key === 'cross').length}</strong>
                </div>
            </div>
            <p class="weather-summary-note">Wind direction is compared against the local route bearing at each sampled point.</p>
        </div>
    `;

        body.innerHTML = `
            <div class="weather-tabs" role="tablist" aria-label="Weather analysis tabs">
                ${tabButton('Summary', 'summary', true)}
                ${tabButton('Route points', 'points')}
                ${tabButton('Wind', 'wind')}
            </div>
            ${panels}
        `;

        const tabs = Array.from(body.querySelectorAll('.weather-tab'));
        const panelsEls = Array.from(body.querySelectorAll('.weather-panel'));

        const activate = (panelName) => {
            tabs.forEach(tab => tab.classList.toggle('is-active', tab.dataset.weatherPanel === panelName));
            panelsEls.forEach(panel => panel.classList.toggle('hidden', panel.dataset.weatherPanelContent !== panelName));
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => activate(tab.dataset.weatherPanel));
        });

        activate('summary');
    } catch (error) {
        console.error('Weather analysis render failed:', error);
        section.classList.remove('hidden');
        const body = section.querySelector('.weather-analysis__body');
        if (body) {
            body.innerHTML = '<p class="empty-state">Weather analysis could not be loaded.</p>';
        }
    }
}

export async function renderWeatherMapDetails(activity, coords, map, enabled) {
    if (!map) return;

    if (map._weatherDetailsLayer) {
        map._weatherDetailsLayer.remove();
        map._weatherDetailsLayer = null;
    }

    if (!enabled || !activity?.id || !Array.isArray(coords) || coords.length < 2) {
        return;
    }

    try {
        const points = await buildWeatherPoints(activity, coords);
        if (!points.length || !window.L) return;

        const layer = L.layerGroup().addTo(map);
        map._weatherDetailsLayer = layer;

        points.forEach(point => {
            const marker = L.marker([point.lat, point.lon], {
                icon: L.divIcon({
                    className: 'weather-map-divicon',
                    html: createWeatherMarkerHtml(point),
                    iconSize: [54, 54],
                    iconAnchor: [27, 27],
                }),
            });

            marker.bindPopup(`
                <div class="weather-popup">
                    <strong>${weatherCodeToMeta(point.weather_code).icon} ${weatherCodeToMeta(point.weather_code).text}</strong><br>
                    <span>🌡️ ${Number.isFinite(point.temperature) ? point.temperature.toFixed(1) + '°C' : 'N/A'}</span><br>
                    <span>💨 ${Number.isFinite(point.wind_speed) ? point.wind_speed.toFixed(1) + ' km/h' : 'N/A'}</span><br>
                    <span>🌧️ ${Number.isFinite(point.precipitation) ? point.precipitation.toFixed(1) + ' mm' : 'N/A'}</span><br>
                    <span>${point.relation.icon} ${point.relation.label}</span>
                </div>
            `);

            marker.addTo(layer);
        });
    } catch (error) {
        console.error('Weather map overlay failed:', error);
    }
}