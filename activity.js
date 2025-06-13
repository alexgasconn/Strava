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

    // HEADER (Professional, ordered, more data)
    const distKm = (act.distance / 1000).toFixed(2);
    const duration = formatTime(act.moving_time);
    const elapsed = formatTime(act.elapsed_time);
    const pace = formatPace(act.average_speed);
    const elevGain = Math.round(act.total_elevation_gain || 0);
    const avgHr = act.average_heartrate ? `${Math.round(act.average_heartrate)} bpm` : 'N/A';
    const maxHr = act.max_heartrate ? `${Math.round(act.max_heartrate)} bpm` : 'N/A';
    const avgCad = act.average_cadence ? `${Math.round(act.average_cadence)} rpm` : 'N/A';
    const maxCad = act.max_cadence ? `${Math.round(act.max_cadence)} rpm` : 'N/A';
    const calories = act.calories ? `${Math.round(act.calories)} kcal` : 'N/A';
    const device = act.device_name || 'N/A';
    const gear = act.gear?.name || 'N/A';
    const type = act.type || 'N/A';
    const date = act.start_date_local ? new Date(act.start_date_local).toLocaleString() : 'N/A';
    const location = [act.start_latlng?.[0], act.start_latlng?.[1]].every(Number.isFinite)
      ? `${act.start_latlng[0].toFixed(5)}, ${act.start_latlng[1].toFixed(5)}`
      : 'N/A';

    headerDiv.innerHTML = `
      <h2>${act.name || 'Activity'}</h2>
      <table class="df-table activity-summary">
      <tr>
        <th>Date</th>
        <td>${date}</td>
      </tr>
      <tr>
        <th>Type</th>
        <td>${type}</td>
      </tr>
      <tr>
        <th>Distance</th>
        <td>${distKm} km</td>
      </tr>
      <tr>
        <th>Moving Time</th>
        <td>${duration}</td>
      </tr>
      <tr>
        <th>Elapsed Time</th>
        <td>${elapsed}</td>
      </tr>
      <tr>
        <th>Pace</th>
        <td>${pace} min/km</td>
      </tr>
      <tr>
        <th>Elevation Gain</th>
        <td>${elevGain} m</td>
      </tr>
      <tr>
        <th>Avg HR</th>
        <td>${avgHr}</td>
      </tr>
      <tr>
        <th>Max HR</th>
        <td>${maxHr}</td>
      </tr>
      <tr>
        <th>Avg Cadence</th>
        <td>${avgCad}</td>
      </tr>
      <tr>
        <th>Max Cadence</th>
        <td>${maxCad}</td>
      </tr>
      <tr>
        <th>Calories</th>
        <td>${calories}</td>
      </tr>
      <tr>
        <th>Gear</th>
        <td>${gear}</td>
      </tr>
      <tr>
        <th>Device</th>
        <td>${device}</td>
      </tr>
      <tr>
        <th>Start Location</th>
        <td>${location}</td>
      </tr>
      </table>
    `;

    // MAP
    if (act.map?.summary_polyline) {
      const coords = decodePolyline(act.map.summary_polyline);
      const map = L.map(mapDiv);
      // Calculate bounds
      const lats = coords.map(c => c[0]);
      const lngs = coords.map(c => c[1]);
      const southWest = [Math.min(...lats), Math.min(...lngs)];
      const northEast = [Math.max(...lats), Math.max(...lngs)];
      const bounds = L.latLngBounds(southWest, northEast);
      map.fitBounds(bounds, { padding: [20, 20] });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      L.polyline(coords, { color: '#FC5200', weight: 4 }).addTo(map);
    }

    // SPLITS - User selectable split distance and additional charts for elevation and heart rate variability
    const splits = act.splits_metric || [];
    if (splits.length) {
      // Create split distance selector if not present
      let splitSelector = document.getElementById('split-distance-selector');
      if (!splitSelector) {
      splitSelector = document.createElement('select');
      splitSelector.id = 'split-distance-selector';
      [100, 250, 500, 1000].forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = `${val} m`;
        splitSelector.appendChild(opt);
      });
      splitsSection.prepend(splitSelector);
      }

      function renderSplitsCharts(splitDistance) {
      // Remove old charts if any
      ['chart-pace', 'chart-heartrate', 'chart-elevation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });

      // Create canvases
      ['pace', 'heartrate', 'elevation'].forEach(type => {
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${type}`;
        splitsSection.appendChild(canvas);
      });

      // Aggregate splits by selected distance
      let aggSplits = [];
      let temp = { distance: 0, time: 0, hr: 0, elev: 0, hrArr: [], count: 0 };
      splits.forEach(s => {
        temp.distance += s.distance;
        temp.time += s.moving_time;
        temp.hr += s.average_heartrate || 0;
        temp.elev += s.elevation_difference || 0;
        if (s.average_heartrate) temp.hrArr.push(s.average_heartrate);
        temp.count++;
        if (temp.distance >= splitDistance) {
        aggSplits.push({
          distance: temp.distance,
          time: temp.time,
          hr: temp.hr / temp.count,
          elev: temp.elev / temp.count,
          hrv: temp.hrArr.length > 1
          ? Math.max(...temp.hrArr) - Math.min(...temp.hrArr)
          : 0
        });
        temp = { distance: 0, time: 0, hr: 0, elev: 0, hrArr: [], count: 0 };
        }
      });
      if (temp.count > 0) {
        aggSplits.push({
        distance: temp.distance,
        time: temp.time,
        hr: temp.hr / temp.count,
        elev: temp.elev / temp.count,
        hrv: temp.hrArr.length > 1
          ? Math.max(...temp.hrArr) - Math.min(...temp.hrArr)
          : 0
        });
      }

      let cumulative = 0;
      const labels = aggSplits.map(s => {
        cumulative += s.distance;
        return `${(cumulative / 1000).toFixed(2)} km`;
      });
      const paceData = aggSplits.map(s => s.time / (s.distance / 1000)); // min/km
      const hrData = aggSplits.map(s => s.hr);
      const elevData = aggSplits.map(s => s.elev);
      const hrvData = aggSplits.map(s => s.hrv);

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

      new Chart(document.getElementById('chart-elevation'), {
        type: 'line',
        data: {
        labels,
        datasets: [{
          label: 'Elevation (m)',
          data: elevData,
          borderColor: '#2ECC40',
          fill: false,
          tension: 0.2
        }]
        }
      });
      }

      // Initial render
      renderSplitsCharts(Number(splitSelector.value));

      // Update on selector change
      splitSelector.onchange = () => renderSplitsCharts(Number(splitSelector.value));
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
