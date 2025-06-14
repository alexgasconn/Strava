// =================================================================
// activity.js - VERSIÓN REFACTORIZADA Y CORREGIDA
// =================================================================

// --- 1. CONFIGURACIÓN Y REFERENCIAS AL DOM ---
const params = new URLSearchParams(window.location.search);
const activityId = params.get('id');
const accessToken = localStorage.getItem('strava_access_token');
const charts = {}; // Para gestionar las instancias de los gráficos

// --- 2. FUNCIONES DE UTILIDAD ---

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 3600 % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatPace(secondsPerKm) {
  if (isNaN(secondsPerKm) || secondsPerKm <= 0) return 'N/A';
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}'${sec.toString().padStart(2, '0')}"/km`;
}

function decodePolyline(str) {
  let index = 0, lat = 0, lng = 0, coordinates = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

function binStreamByDistance(distanceArr, valueArr, binSize = 100) {
  if (!distanceArr || !valueArr) return [];
  const bins = [];
  let binStart = 0;
  let binValues = [];
  for (let i = 0; i < distanceArr.length; i++) {
    const currentDist = distanceArr[i];
    const currentValue = valueArr[i];
    if (typeof currentDist !== 'number' || isNaN(currentDist)) continue;

    if (currentDist - binStart < binSize) {
      if (typeof currentValue === 'number' && !isNaN(currentValue)) {
        binValues.push(currentValue);
      }
    } else {
      if (binValues.length > 0) {
        bins.push({
          distance: binStart + binSize / 2,
          min: Math.min(...binValues),
          max: Math.max(...binValues),
          avg: binValues.reduce((a, b) => a + b, 0) / binValues.length,
        });
      }
      binStart += binSize;
      // Reiniciar con el valor actual si es válido
      binValues = (typeof currentValue === 'number' && !isNaN(currentValue)) ? [currentValue] : [];
    }
  }
  // Añadir el último bin
  if (binValues.length > 0) {
    bins.push({
      distance: binStart + binSize / 2,
      min: Math.min(...binValues),
      max: Math.max(...binValues),
      avg: binValues.reduce((a, b) => a + b, 0) / binValues.length,
    });
  }
  return bins;
}


// --- 3. FUNCIONES DE RENDERIZADO ---

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas con ID "${canvasId}" no encontrado.`);
        return;
    }
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas.getContext('2d'), config);
}

function renderHeader(act) {
    document.getElementById('activity-name-title').textContent = act.name || 'Detalles de la Actividad';
    const headerDiv = document.getElementById('activity-header');
    const paceSeconds = act.distance > 0 ? act.moving_time / (act.distance / 1000) : 0;
    headerDiv.innerHTML = `
      <table class="df-table activity-summary">
        <tr><th>Distancia</th><td>${(act.distance / 1000).toFixed(2)} km</td></tr>
        <tr><th>Tiempo en Mov.</th><td>${formatTime(act.moving_time)}</td></tr>
        <tr><th>Ritmo Medio</th><td>${formatPace(paceSeconds)}</td></tr>
        <tr><th>Desnivel</th><td>${Math.round(act.total_elevation_gain || 0)} m</td></tr>
        <tr><th>FC Media</th><td>${act.average_heartrate ? `${Math.round(act.average_heartrate)} bpm` : 'N/A'}</td></tr>
        <tr><th>Calorías</th><td>${act.calories ? `${Math.round(act.calories)} kcal` : 'N/A'}</td></tr>
        <tr><th>Fecha</th><td>${act.start_date_local ? new Date(act.start_date_local).toLocaleString() : 'N/A'}</td></tr>
        <tr><th>Material</th><td>${act.gear?.name || 'N/A'}</td></tr>
      </table>
    `;
}

function renderMap(act) {
    if (act.map?.summary_polyline) {
      const coords = decodePolyline(act.map.summary_polyline);
      if (coords.length === 0) return;
      const map = L.map('activity-map').fitBounds(coords, {padding: [20, 20]});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
    }
}

function renderSplits(act) {
    const splits = act.splits_metric || [];
    if (splits.length === 0) return;

    const labels = splits.map((s, i) => `${i + 1} km`);
    const paceData = splits.map(s => s.distance > 0 ? s.moving_time / (s.distance / 1000) : null);
    const hrData = splits.map(s => s.average_heartrate || null);
    const elevData = splits.map(s => s.elevation_difference || 0);

    createChart('chart-pace', {
        type: 'line',
        data: { labels, datasets: [{ label: 'Ritmo (seg/km)', data: paceData, borderColor: '#FC5200', fill: false }] },
        options: { scales: { y: { reverse: true, title: { display: true, text: "Ritmo" } } } }
    });
    createChart('chart-heartrate', {
        type: 'line',
        data: { labels, datasets: [{ label: 'FC (bpm)', data: hrData, borderColor: '#e10000', fill: false }] },
        options: { scales: { y: { title: { display: true, text: "FC" } } } }
    });
    createChart('chart-elevation', {
        type: 'line',
        data: { labels, datasets: [{ label: 'Desnivel (m)', data: elevData, borderColor: '#2ECC40', fill: 'start', backgroundColor: 'rgba(46, 204, 64, 0.1)' }] },
        options: { scales: { y: { title: { display: true, text: "Desnivel" } } } }
    });
}

function renderSegments(act) {
    const segs = act.segment_efforts || [];
    if (segs.length === 0) return;
    const segmentsSection = document.getElementById('segments-section');
    const paceSeconds = (s) => s.distance > 0 ? s.moving_time / (s.distance / 1000) : 0;
    segmentsSection.innerHTML = `<h3>Segmentos</h3><table class="df-table">
        <thead><tr><th>Nombre</th><th>Dist.</th><th>Tiempo</th><th>Ritmo</th><th>FC</th></tr></thead><tbody>
        ${segs.map(s => `<tr>
          <td>${s.name}</td>
          <td>${(s.distance / 1000).toFixed(2)} km</td>
          <td>${formatTime(s.moving_time)}</td>
          <td>${formatPace(paceSeconds(s))}</td>
          <td>${s.average_heartrate ? Math.round(s.average_heartrate) : '-'}</td>
        </tr>`).join('')}
        </tbody></table>`;
}

function renderStreamCharts(streamsData) {
    const { heartrate, velocity_smooth, distance } = streamsData;
    
    if (heartrate?.data && distance?.data) {
        const hrBins = binStreamByDistance(distance.data, heartrate.data, 100);
        plotRangeChart('hr-range-chart', hrBins, 'Frecuencia Cardíaca', '#ff6384', 'FC (bpm)');
    }
    
    if (velocity_smooth?.data && distance?.data) {
        const paceInSecondsPerKm = velocity_smooth.data.map(speed => speed > 0 ? 1000 / speed : null);
        const paceBins = binStreamByDistance(distance.data, paceInSecondsPerKm, 100);
        plotRangeChart('pace-range-chart', paceBins, 'Ritmo', '#36a2eb', 'Ritmo (seg/km)');
    }
}

function plotRangeChart(canvasId, bins, label, color, yLabel) {
    if (bins.length === 0) return;
    const labels = bins.map(b => (b.distance / 1000).toFixed(1));
    createChart(canvasId, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: `${label} Max`, data: bins.map(b => b.max), fill: '-1', backgroundColor: color + '33', borderColor: 'transparent', pointRadius: 0 },
          { label: `${label} Min`, data: bins.map(b => b.min), fill: false, borderColor: 'transparent', pointRadius: 0 },
          { label: `${label} Media`, data: bins.map(b => b.avg), borderColor: color, fill: false, borderWidth: 2, pointRadius: 0 }
        ]
      },
      options: { scales: { x: { title: { display: true, text: 'Distancia (km)' } }, y: { title: { display: true, text: yLabel } } } }
    });
}


// --- 4. LÓGICA PRINCIPAL DE LA PÁGINA ---
async function main() {
    if (!activityId || !accessToken) {
        document.body.innerHTML = "<h1>Error: Falta ID de actividad o no has iniciado sesión.</h1>";
        return;
    }

    try {
        // Fetch principal de la actividad
        const activityResponse = await fetch(`/api/strava-activity?id=${activityId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!activityResponse.ok) throw new Error(`Error al obtener actividad: ${activityResponse.statusText}`);
        const activityData = await activityResponse.json();
        console.log("Datos de actividad recibidos:", activityData);

        // Renderizar todo lo que no depende de streams
        renderHeader(activityData);
        renderMap(activityData);
        renderSplits(activityData);
        renderSegments(activityData);

        // Fetch de todos los streams necesarios EN PARALELO
        const streamTypes = 'heartrate,velocity_smooth,distance';
        const streamsResponse = await fetch(`/api/strava-streams?id=${activityId}&type=${streamTypes}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (streamsResponse.ok) {
            const streamsData = await streamsResponse.json();
            console.log("Datos de streams recibidos:", streamsData);
            // Ahora que tenemos TODOS los streams, renderizamos los gráficos que dependen de ellos
            renderStreamCharts(streamsData);
        } else {
            console.warn("No se pudieron obtener los datos de streams para esta actividad.");
        }

    } catch (error) {
        console.error("Fallo en la carga de la página de actividad:", error);
        document.body.innerHTML = `<h1>Error al cargar la actividad</h1><p>${error.message}</p>`;
    }
}

// Iniciar la carga de la página
main();