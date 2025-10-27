// weather-analytics.js
// Complete Weather Analytics tab for Chart.js + Open-Meteo
// Drop this into your project and import or load as a module.

export async function renderWeatherTab(allActivities) {
  console.log('Initializing Weather Analytics — received', allActivities.length, 'activities');
  const container = document.getElementById('weather-summary');
  if (!container) return console.error('weather-summary container not found');

  // Basic UI skeleton (will be replaced once data is ready)
  container.innerHTML = `
    <div class="wa-stats-row" id="wa-stats-row">Loading summary...</div>
    <div id="wa-charts" class="wa-charts-grid"></div>
    <div id="wa-extra" class="wa-extra-grid"></div>
    <div id="wa-topruns"></div>
    <div id="wa-runslist" class="wa-runslist"></div>
  `;

  // Filter runs with GPS and a start date
  const runs = allActivities.filter(a => a.type?.toLowerCase().includes('run') && a.start_latlng && a.start_date_local);
  if (!runs.length) {
    container.innerHTML = '<p>No running activities with GPS/time found.</p>';
    return;
  }

  container.querySelector('#wa-stats-row').innerText = `Fetching weather for ${runs.length} runs...`;

  // Fetch weather for each run (concurrent with small throttle)
  const weatherResults = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    try {
      const w = await getWeatherForRun(run);
      if (w) weatherResults.push({ run, ...w });
    } catch (e) {
      console.warn('weather fetch failed for', run.name, e);
    }
    await sleep(150); // gentle throttle
    container.querySelector('#wa-stats-row').innerText = `Fetched ${i + 1}/${runs.length}`;
  }

  if (!weatherResults.length) {
    container.innerHTML = '<p>No weather data retrieved.</p>';
    return;
  }

  // Prepare arrays for charts
  const temps = weatherResults.map(r => r.temperature);
  const rains = weatherResults.map(r => r.precipitation);
  const winds = weatherResults.map(r => r.wind_speed);
  const conditions = weatherResults.map(r => r.weather_text);
  const paces = weatherResults.map(r => runPaceMinPerKm(r.run));
  const distances = weatherResults.map(r => (r.run.distance || 0) / 1000);
  const startDates = weatherResults.map(r => r.run.start_date_local);

  // SUMMARY CARDS
  const avgTemp = mean(temps).toFixed(1);
  const avgWind = mean(winds).toFixed(1);
  const totalRain = sum(rains).toFixed(2);
  const common = mode(conditions);

  const statsRow = document.getElementById('wa-stats-row');
  statsRow.innerHTML = `
    <div class="wa-card"><h4>Avg Temp</h4><div class="wa-val">${avgTemp}°C</div></div>
    <div class="wa-card"><h4>Avg Wind</h4><div class="wa-val">${avgWind} km/h</div></div>
    <div class="wa-card"><h4>Total Rain</h4><div class="wa-val">${totalRain} mm</div></div>
    <div class="wa-card"><h4>Mode Condition</h4><div class="wa-val">${common}</div></div>
  `;

  // Inject chart canvases + tables (extend your HTML grid if desired)
  const charts = document.getElementById('wa-charts');
  charts.innerHTML = `
    <div class="wa-chart"><h5>Temperature Histogram</h5><canvas id="temp-hist"></canvas></div>
    <div class="wa-chart"><h5>Rainfall Histogram</h5><canvas id="rain-hist"></canvas></div>
    <div class="wa-chart"><h5>Wind Speed Histogram</h5><canvas id="wind-hist"></canvas></div>
    <div class="wa-chart"><h5>Pace Distribution</h5><canvas id="pace-hist"></canvas></div>
    <div class="wa-chart"><h5>Temp vs Distance</h5><canvas id="temp-vs-dist"></canvas></div>
    <div class="wa-chart"><h5>Temp vs Pace</h5><canvas id="temp-vs-pace"></canvas></div>
    <div class="wa-chart"><h5>Weather Type Distribution</h5><canvas id="condition-pie"></canvas></div>
    <div class="wa-chart"><h5>Monthly Avg Temperature</h5><canvas id="monthly-avg"></canvas></div>
    <div class="wa-chart"><h5>Monthly Stats Table</h5><div id="monthly-stats-table"></div></div>
    <div class="wa-chart"><h5>Correlation Matrix</h5><div id="corr-matrix"></div></div>
    <div class="wa-chart"><h5>Wind Rose (binned)</h5><canvas id="wind-rose"></canvas></div>
  `;

  // EXTRA: top runs and full runs list
  renderTopRuns(document.getElementById('wa-topruns'), weatherResults);
  renderRunsList(document.getElementById('wa-runslist'), weatherResults);

  // CHARTS
  renderHistogram('temp-hist', temps, 'Temperature (°C)');
  renderHistogram('rain-hist', rains, 'Rainfall (mm)');
  renderHistogram('wind-hist', winds, 'Wind Speed (km/h)');
  renderHistogram('pace-hist', paces.filter(Boolean), 'Pace (min/km)');
  renderScatter('temp-vs-dist', temps, distances, 'Temperature (°C)', 'Distance (km)');
  renderScatter('temp-vs-pace', temps, paces, 'Temperature (°C)', 'Pace (min/km)');
  renderPie('condition-pie', conditions);
  renderMonthlyLine('monthly-avg', weatherResults);
  renderMonthlyStatsTable('monthly-stats-table', weatherResults);
  renderCorrelationMatrix('corr-matrix', { temps, rains, winds, paces, distances });
  renderWindRose('wind-rose', winds);

  container.querySelector('#wa-stats-row').insertAdjacentHTML('beforeend', `<div style="margin-left:16px;color:#666">Based on ${weatherResults.length} runs</div>`);

  console.log('Weather analytics rendered.');
}

// ----------------- Helpers: data fetching -----------------
async function getWeatherForRun(run) {
  const [lat, lon] = run.start_latlng;
  const date = run.start_date_local.split('T')[0];
  const base = 'https://archive-api.open-meteo.com/v1/archive';
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    start_date: date,
    end_date: date,
    hourly: 'temperature_2m,precipitation,weathercode,wind_speed_10m,winddirection_10m',
    timezone: 'auto'
  });
  try {
    const res = await fetch(`${base}?${params.toString()}`);
    if (!res.ok) throw new Error('weather fetch failed');
    const data = await res.json();
    if (!data.hourly || !data.hourly.time) return null;
    const hr = new Date(run.start_date_local).getHours();
    // pick nearest hour index
    let idx = data.hourly.time.findIndex(t => new Date(t).getHours() === hr);
    if (idx === -1) idx = 0;
    return {
      temperature: numericSafe(data.hourly.temperature_2m[idx]),
      precipitation: numericSafe(data.hourly.precipitation[idx]),
      wind_speed: numericSafe(data.hourly.wind_speed_10m[idx]),
      wind_dir: numericSafe(data.hourly.winddirection_10m ? data.hourly.winddirection_10m[idx] : null),
      weather_code: data.hourly.weathercode ? data.hourly.weathercode[idx] : null,
      weather_text: weatherDescription(data.hourly.weathercode ? data.hourly.weathercode[idx] : null)
    };
  } catch (e) {
    console.warn('getWeatherForRun error', e);
    return null;
  }
}

// ----------------- Rendering & charts -----------------
function renderHistogram(id, data, label) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  // binning
  const bins = 10;
  const minv = Math.min(...data);
  const maxv = Math.max(...data);
  const width = (maxv - minv) / bins || 1;
  const counts = new Array(bins).fill(0);
  data.forEach(v => {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v - minv) / width)));
    counts[i]++;
  });
  const labels = counts.map((_, i) => `${(minv + i * width).toFixed(1)}–${(minv + (i + 1) * width).toFixed(1)}`);
  new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label, data: counts }] }, options: { responsive: true } });
}

function renderScatter(id, x, y, xlabel, ylabel) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const points = x.map((v, i) => ({ x: v, y: y[i] }));
  new Chart(ctx, { type: 'scatter', data: { datasets: [{ label: `${ylabel} vs ${xlabel}`, data: points }] }, options: { responsive: true, scales: { x: { title: { display: true, text: xlabel } }, y: { title: { display: true, text: ylabel } } } } });
}

function renderPie(id, arr) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const freq = {};
  arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
  new Chart(ctx, { type: 'pie', data: { labels: Object.keys(freq), datasets: [{ data: Object.values(freq) }] }, options: { responsive: true } });
}

function renderMonthlyLine(id, data) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const byMonth = {};
  data.forEach(w => {
    const m = new Date(w.run.start_date_local).getMonth();
    if (!byMonth[m]) byMonth[m] = { temp: [], rain: [], wind: [] };
    byMonth[m].temp.push(w.temperature);
    byMonth[m].rain.push(w.precipitation);
    byMonth[m].wind.push(w.wind_speed);
  });
  const months = Object.keys(byMonth).sort((a,b)=>a-b);
  const labels = months.map(m => monthName(+m));
  const avgTemp = months.map(m => mean(byMonth[m].temp));
  new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Avg Temp (°C)', data: avgTemp, fill: false }] }, options: { responsive: true } });
}

function renderMonthlyStatsTable(containerId, data) {
  const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!el) return;
  const byMonth = {};
  data.forEach(w => {
    const m = new Date(w.run.start_date_local).getMonth();
    if (!byMonth[m]) byMonth[m] = { temps: [], rains: [], winds: [], counts: 0 };
    byMonth[m].temps.push(w.temperature);
    byMonth[m].rains.push(w.precipitation);
    byMonth[m].winds.push(w.wind_speed);
    byMonth[m].counts++;
  });
  const months = Object.keys(byMonth).sort((a,b)=>a-b);
  let html = '<table class="wa-table"><thead><tr><th>Month</th><th>Count</th><th>AvgTemp</th><th>MinTemp</th><th>MaxTemp</th><th>AvgRain</th><th>TotalRain</th><th>AvgWind</th></tr></thead><tbody>';
  months.forEach(m => {
    const d = byMonth[m];
    html += `<tr><td>${monthName(+m)}</td><td>${d.counts}</td><td>${mean(d.temps).toFixed(1)}</td><td>${Math.min(...d.temps).toFixed(1)}</td><td>${Math.max(...d.temps).toFixed(1)}</td><td>${mean(d.rains).toFixed(2)}</td><td>${sum(d.rains).toFixed(2)}</td><td>${mean(d.winds).toFixed(1)}</td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderCorrelationMatrix(containerId, varsObj) {
  const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!el) return;
  const keys = Object.keys(varsObj);
  const corr = keys.map(kx => keys.map(ky => correlation(varsObj[kx], varsObj[ky])));
  // create table with color scale
  let html = '<table class="wa-corr"><thead><tr><th></th>' + keys.map(k=>`<th>${k}</th>`).join('') + '</tr></thead><tbody>';
  for (let i = 0; i < keys.length; i++) {
    html += `<tr><th>${keys[i]}</th>`;
    for (let j = 0; j < keys.length; j++) {
      const v = corr[i][j];
      const color = heatColor((v + 1) / 2); // normalize -1..1 to 0..1
      html += `<td style="background:${color};color:${contrastColor(color)}">${v.toFixed(2)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderWindRose(id, winds) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  // bins of wind speed
  const labels = ['0-5','5-10','10-15','15-20','20+'];
  const bins = [0,5,10,15,20,9999];
  const counts = new Array(labels.length).fill(0);
  winds.forEach(v => {
    for (let i = 0; i < bins.length-1; i++) {
      if (v >= bins[i] && v < bins[i+1]) { counts[i]++; break; }
    }
  });
  new Chart(ctx, { type: 'polarArea', data: { labels, datasets: [{ data: counts }] }, options: { responsive: true } });
}

// ----------------- Top runs & Runs list -----------------
function renderTopRuns(container, data, topN = 5) {
  if (!container) return;
  const byWind = [...data].sort((a,b)=>b.wind_speed - a.wind_speed).slice(0, topN);
  const byTempHigh = [...data].sort((a,b)=>b.temperature - a.temperature).slice(0, topN);
  const byTempLow = [...data].sort((a,b)=>a.temperature - b.temperature).slice(0, topN);

  let html = '<div class="wa-topruns-grid">';
  html += makeTopCard('Top wind', byWind, 'wind_speed', ' km/h');
  html += makeTopCard('Top temp (high)', byTempHigh, 'temperature', '°C');
  html += makeTopCard('Top temp (low)', byTempLow, 'temperature', '°C');
  html += '</div>';
  container.innerHTML = html;
}

function makeTopCard(title, list, key, unit) {
  return `<div class="wa-topcard"><h4>${title}</h4><ol>${list.map(r=>`<li><strong>${r.run.name}</strong> — ${r[key]}${unit} <span class="muted">(${shortDate(r.run.start_date_local)})</span></li>`).join('')}</ol></div>`;
}

function renderRunsList(container, data, initial = 6) {
  if (!container) return;
  let html = '<div class="wa-runs-header"><h4>All runs</h4><button id="wa-toggle-all">Show more</button></div>';
  html += '<div id="wa-runs-rows">';
  data.slice(0, initial).forEach(r => html += runRowHtml(r));
  html += '</div>';
  container.innerHTML = html;
  const btn = container.querySelector('#wa-toggle-all');
  let expanded = false;
  btn.addEventListener('click', () => {
    expanded = !expanded;
    const rows = container.querySelector('#wa-runs-rows');
    if (expanded) {
      rows.innerHTML = data.map(r => runRowHtml(r)).join('');
      btn.innerText = 'Show less';
    } else {
      rows.innerHTML = data.slice(0, initial).map(r => runRowHtml(r)).join('');
      btn.innerText = 'Show more';
    }
  });
}

function runRowHtml(r) {
  const pace = runPaceMinPerKm(r.run);
  const hr = r.run.average_heartrate ? `${r.run.average_heartrate} bpm` : '—';
  const dist = r.run.distance ? `${(r.run.distance/1000).toFixed(2)} km` : '—';
  return `<div class="wa-run-row"><div class="wa-run-main"><strong>${r.run.name}</strong><div class="muted">${shortDate(r.run.start_date_local)}</div></div><div class="wa-run-metrics">${dist} • ${formatTime(r.run.moving_time)} • ${pace? pace.toFixed(2) + ' min/km': '—'} • HR ${hr}</div><div class="wa-run-weather">${r.weather_text} • ${r.temperature}°C • ${r.wind_speed} km/h • ${r.precipitation} mm</div></div>`;
}

// ----------------- UTILITIES -----------------
function runPaceMinPerKm(run) {
  // Strava: average_speed in m/s, convert to min/km
  if (!run) return null;
  if (run.average_speed) return 1000 / (run.average_speed * 60);
  if (run.distance && run.moving_time) return (run.moving_time / 60) / (run.distance / 1000);
  return null;
}

function formatTime(s) { if (!s && s !== 0) return '—'; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return h? `${h}h ${m}m` : `${m}m ${sec}s`; }
function shortDate(d){ return new Date(d).toLocaleString(); }
function numericSafe(v){ return v === null || v === undefined ? 0 : Number(v); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mean = arr => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
const sum = arr => arr && arr.length ? arr.reduce((a,b)=>a+b,0) : 0;
const mode = arr => { const m = arr.reduce((acc,v)=> (acc[v]=(acc[v]||0)+1,acc),{}); return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0] || ''; };

function correlation(x, y) {
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0,n); const ys = y.slice(0,n);
  const mx = mean(xs); const my = mean(ys);
  const num = xs.reduce((a,v,i)=>a + (v - mx)*(ys[i]-my),0);
  const den = Math.sqrt(xs.reduce((a,v)=>a+(v-mx)**2,0) * ys.reduce((a,v)=>a+(v-my)**2,0));
  return den ? num/den : 0;
}

function heatColor(t) { // t in [0,1], blue->white->red
  const r = Math.round(255 * Math.max(0, Math.min(1, (t-0.5)*2)));
  const b = Math.round(255 * Math.max(0, Math.min(1, (0.5-t)*2)));
  const g = 255 - Math.abs(Math.round((t-0.5)*510));
  return `rgb(${r},${g},${b})`;
}
function contrastColor(rgb){ // simple luminosity
  const nums = rgb.replace(/[rgb()]/g,'').split(',').map(n=>+n);
  const lum = (0.299*nums[0] + 0.587*nums[1] + 0.114*nums[2]);
  return lum > 140 ? '#000' : '#fff';
}

function monthName(i){ return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i] || i; }
function shortNum(n){ return Number.isFinite(n) ? n.toFixed(2) : '—'; }

function weatherDescription(code){
  const map = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',80:'Rain showers',95:'Thunderstorm'};
  return map[code] || 'Unknown';
}

function shortDateOnly(d){ return new Date(d).toLocaleDateString(); }

// ----------------- small CSS you can drop in your app for a nicer layout -----------------
export const WEATHER_CSS = `
.wa-stats-row{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.wa-card{background:#fff;border-radius:8px;padding:10px 12px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.wa-val{font-size:1.1rem;font-weight:600}
.wa-charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.wa-chart{background:#fff;padding:8px;border-radius:8px}
.wa-topruns-grid{display:flex;gap:10px;flex-wrap:wrap}
.wa-topcard{background:#fff;padding:8px;border-radius:6px;min-width:180px}
.wa-runslist{margin-top:12px}
.wa-run-row{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee}
.wa-run-main{font-weight:600}
.wa-run-metrics{color:#555}
.wa-run-weather{color:#333;font-size:0.9rem}
.wa-table{width:100%;border-collapse:collapse}
.wa-table th, .wa-table td{padding:6px;border:1px solid #eee}
.wa-corr{border-collapse:collapse;width:100%}
.wa-corr th, .wa-corr td{padding:6px;border:1px solid #ddd;text-align:center}
`;

// END OF FILE
