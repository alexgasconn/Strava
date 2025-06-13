const params = new URLSearchParams(window.location.search);
const activityId = params.get('id');
const headerDiv = document.getElementById('activity-header');
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
  if (!accessToken) {
    headerDiv.innerHTML = "<p>You must be logged in to view activity details.</p>";
    return;
  }
  try {
    const response = await fetch(`/api/strava-activity?id=${activityId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    const act = await response.json();

    // HEADER
    const distKm = (act.distance / 1000).toFixed(2);
    const pace = formatPace(act.average_speed);
    const duration = formatTime(act.moving_time);
    headerDiv.innerHTML = `
      <h2>${act.name}</h2>
      <p><strong>Date:</strong> ${act.start_date_local.split('T')[0]}</p>
      <p><strong>Distance:</strong> ${distKm} km · <strong>Time:</strong> ${duration} · <strong>Pace:</strong> ${pace} min/km · <strong>HR:</strong> ${Math.round(act.average_heartrate || 0)} bpm · <strong>Cadence:</strong> ${Math.round(act.average_cadence || 0)} rpm</p>
      <p><strong>Gear:</strong> ${act.gear?.name || 'N/A'} · <strong>Device:</strong> ${act.device_name || 'N/A'}</p>
    `;

    // MAP
    if (act.map?.summary_polyline) {
      const coords = decodePolyline(act.map.summary_polyline);
      const map = L.map(mapDiv).setView(coords[0], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
    }

    // SPLITS
    const splits = act.splits_metric || [];
    if (splits.length) {
      const labels = splits.map((s, i) => `Km ${i + 1}`);
      const paceData = splits.map(s => 1000 / s.average_speed);
      const hrData = splits.map(s => s.average_heartrate);

      new Chart(document.getElementById('chart-pace'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Pace (min/km)',
            data: paceData,
            borderColor: '#FC5200',
            fill: false,
            tension: 0.2
          }]
        },
        options: { scales: { y: { reverse: true } } }
      });

      new Chart(document.getElementById('chart-heartrate'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Heart Rate (bpm)',
            data: hrData,
            borderColor: '#0074D9',
            fill: false,
            tension: 0.2
          }]
        }
      });
    }

    // SEGMENTS
    const segs = act.segment_efforts || [];
    if (segs.length) {
      segmentsSection.innerHTML = `<h3>Segments</h3><table class="df-table">
        <thead><tr><th>Name</th><th>Dist</th><th>Time</th><th>Pace</th><th>HR</th></tr></thead><tbody>
        ${segs.map(s => `<tr>
          <td>${s.name}</td>
          <td>${(s.distance / 1000).toFixed(2)} km</td>
          <td>${formatTime(s.moving_time)}</td>
          <td>${formatPace(s.distance / s.moving_time)}</td>
          <td>${Math.round(s.average_heartrate || 0)} bpm</td>
        </tr>`).join('')}
        </tbody></table>`;
    }
  } catch (err) {
    headerDiv.innerHTML = `<p>Error: ${err.message}</p>`;
  }
}
fetchActivity();
