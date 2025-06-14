const params = new URLSearchParams(window.location.search);
const activityId = params.get('id');
const detailsDiv = document.getElementById('activity-details');
const mapDiv = document.getElementById('activity-map');
const splitsSection = document.getElementById('splits-section');
const segmentsSection = document.getElementById('segments-section');

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatPace(speed) {
  if (!speed || speed === 0) return '-';
  const pace = 1000 / speed;
  const min = Math.floor(pace / 60);
  const sec = Math.round(pace % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
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

async function fetchActivity() {
  const accessToken = localStorage.getItem('strava_access_token');
  const refreshToken = localStorage.getItem('strava_refresh_token');
  if (!accessToken) {
    detailsDiv.innerHTML = "<p>You must be logged in to view activity details.</p>";
    return;
  }

  try {
    detailsDiv.innerHTML = "<p>Loading...</p>";

    const response = await fetch(`/api/strava-activity?id=${activityId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-refresh-token': refreshToken || ''
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const act = await response.json();
    renderActivity(act);
    renderStreamsCharts(act.id);

  } catch (err) {
    detailsDiv.innerHTML = `<p>Error: ${err.message}</p>`;
  }
}



async function fetchStreams(activityId) {
  const accessToken = localStorage.getItem('strava_access_token');
  const refreshToken = localStorage.getItem('strava_refresh_token');

  try {
    const res = await fetch(`/api/strava-streams?id=${activityId}&type=heartrate,altitude,distance`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-refresh-token': refreshToken || ''
      }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Stream error ${res.status}: ${err.message || JSON.stringify(err)}`);
    }

    const data = await res.json();

    // 📊 Aquí puedes trabajar con los datos devueltos
    console.log('Streams:', data);

    // Ejemplo: array de HR
    const hrStream = data.heartrate?.data || [];
    const altStream = data.altitude?.data || [];
    const distStream = data.distance?.data || [];

    // Puedes ahora graficarlos, mapearlos, etc.
    return { hrStream, altStream, distStream };

  } catch (err) {
    console.error('Error fetching streams:', err.message);
  }
}





function renderActivity(act) {
  // --- 1. Datos básicos
  const name = act.name;
  const date = act.start_date_local?.split('T')[0];
  const distanceKm = (act.distance / 1000).toFixed(2);
  const duration = formatTime(act.moving_time);
  const pace = formatPace(act.average_speed);
  const hr = act.average_heartrate ? Math.round(act.average_heartrate) : '-';
  const cadence = act.average_cadence ? Math.round(act.average_cadence) : '-';
  const gear = act.gear?.name || '-';
  const device = act.device_name || '-';

  detailsDiv.innerHTML = `
    <h2>${name}</h2>
    <ul>
      <li>📅 <strong>Fecha:</strong> ${date}</li>
      <li>📏 <strong>Distancia:</strong> ${distanceKm} km</li>
      <li>⏱️ <strong>Duración:</strong> ${duration}</li>
      <li>🐢 <strong>Ritmo medio:</strong> ${pace} min/km</li>
      <li>❤️ <strong>FC media:</strong> ${hr} bpm</li>
      <li>⚙️ <strong>Cadencia media:</strong> ${cadence} rpm</li>
      <li>👟 <strong>Zapatillas:</strong> ${gear}</li>
      <li>📱 <strong>Dispositivo:</strong> ${device}</li>
    </ul>
  `;

  // --- 2. Mapa
  if (act.map?.summary_polyline) {
    const coords = decodePolyline(act.map.summary_polyline);
    const map = L.map('activity-map').setView(coords[0], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
  } else {
    mapDiv.innerHTML = '<p>No route available</p>';
  }

  // --- 3. Splits
  if (act.splits_metric?.length > 0) {
    const kmLabels = act.splits_metric.map((_, i) => `Km ${i + 1}`);
    const paceData = act.splits_metric.map(s => parseFloat((1000 / s.average_speed).toFixed(2)));
    const hrData = act.splits_metric.map(s => s.average_heartrate || 0);

    new Chart(document.getElementById('chart-pace'), {
      type: 'line',
      data: {
        labels: kmLabels,
        datasets: [{
          label: 'Pace (min/km)',
          data: paceData,
          borderColor: '#FC5200',
          fill: false,
          tension: 0.2
        }]
      }
    });

    new Chart(document.getElementById('chart-heartrate'), {
      type: 'line',
      data: {
        labels: kmLabels,
        datasets: [{
          label: 'FC Media (bpm)',
          data: hrData,
          borderColor: 'red',
          fill: false,
          tension: 0.2
        }]
      }
    });

    splitsSection.classList.remove('hidden');
  }

  // --- 4. Segmentos
  if (act.segment_efforts?.length > 0) {
    const rows = act.segment_efforts.map(s => {
      const dist = (s.distance / 1000).toFixed(2);
      const time = formatTime(s.moving_time);
      const pace = formatPace(s.distance / s.moving_time);
      const hr = s.average_heartrate ? Math.round(s.average_heartrate) : '-';
      return `<tr>
        <td>${s.name}</td>
        <td>${dist} km</td>
        <td>${time}</td>
        <td>${pace}</td>
        <td>${hr} bpm</td>
      </tr>`;
    }).join('');

    segmentsSection.innerHTML = `
      <h3>Segmentos</h3>
      <table class="df-table">
        <thead>
          <tr>
            <th>Nombre</th><th>Distancia</th><th>Tiempo</th><th>Ritmo</th><th>FC Media</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
}


async function renderStreamsCharts(activityId) {
  const { hrStream, altStream, distStream } = await fetchStreams(activityId);
  if (!distStream.length) return;

  // 1. Altitud vs Distancia
  new Chart(document.getElementById('chart-altitude'), {
    type: 'line',
    data: {
      labels: distStream.map(d => (d / 1000).toFixed(2)), // km
      datasets: [{
        label: 'Altitud (m)',
        data: altStream,
        borderColor: '#888',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      plugins: { title: { display: true, text: 'Altitud vs Distancia (km)' } },
      scales: {
        x: { title: { display: true, text: 'Distancia (km)' } },
        y: { title: { display: true, text: 'Altitud (m)' } }
      }
    }
  });

  // 2. Ritmo vs Distancia (pace = delta tiempo / delta distancia)
  const paceStream = [];
  for (let i = 1; i < distStream.length; i++) {
    const deltaD = distStream[i] - distStream[i - 1];
    if (deltaD <= 0) {
      paceStream.push(null);
      continue;
    }
    const deltaT = 1; // Suponiendo 1s entre puntos
    const speed = deltaD / deltaT;
    const pace = 1000 / speed;
    paceStream.push(pace);
  }

  new Chart(document.getElementById('chart-pace-distance'), {
    type: 'line',
    data: {
      labels: distStream.slice(1).map(d => (d / 1000).toFixed(2)),
      datasets: [{
        label: 'Ritmo (min/km)',
        data: paceStream.map(p => p ? (p / 60).toFixed(2) : null),
        borderColor: '#FC5200',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      plugins: { title: { display: true, text: 'Pace vs Distancia (km)' } },
      scales: {
        x: { title: { display: true, text: 'Distancia (km)' } },
        y: { title: { display: true, text: 'Ritmo (min/km)' } }
      }
    }
  });

  // 3. FC vs Distancia
  new Chart(document.getElementById('chart-heart-distance'), {
    type: 'line',
    data: {
      labels: distStream.map(d => (d / 1000).toFixed(2)),
      datasets: [{
        label: 'FC (bpm)',
        data: hrStream,
        borderColor: 'red',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      plugins: { title: { display: true, text: 'Frecuencia cardíaca vs Distancia (km)' } },
      scales: {
        x: { title: { display: true, text: 'Distancia (km)' } },
        y: { title: { display: true, text: 'BPM' } }
      }
    }
  });
}


fetchActivity();
