// js/gear-analysis.js — Individual Gear Detail Page

import { formatDistance, formatPace, formatTime, formatDate } from './utils.js';

// ===================================================================
// LOCAL COPIES OF SHARED HELPERS (avoids circular import with gear.js)
// ===================================================================

function getDefaultValues(type) {
    const defaults = {
        bike: { price: 1000, durationKm: 15000 },
        shoe: { price: 120, durationKm: 700 },
        unknown: { price: 100, durationKm: 1000 }
    };
    return defaults[type] || defaults.unknown;
}

function getCustomData(gearId) {
    return JSON.parse(localStorage.getItem(`gear-custom-${gearId}`) || '{}');
}

function saveCustomData(gearId, data) {
    localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify(data));
}

// ===================================================================
// POLYLINE DECODER
// ===================================================================

function decodePolyline(str) {
    let index = 0, lat = 0, lng = 0;
    const coordinates = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);
        shift = 0; result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
}

// ===================================================================
// MAIN ENTRY POINT
// ===================================================================

export async function renderGearDetailPage(gearId) {
    const allActivities = JSON.parse(localStorage.getItem('strava_activities') || '[]');
    const allGears = JSON.parse(localStorage.getItem('strava_gears') || '[]');
    const gear = allGears.find(g => g.id === gearId);

    if (!gear) {
        document.body.innerHTML = `
            <div style="padding:2rem;text-align:center;">
                <h2>Gear not found</h2>
                <p style="color:#6b7280;">The gear ID "${gearId}" was not found in local cache.</p>
                <button onclick="window.history.back()" style="margin-top:1rem;padding:8px 16px;border:1px solid #ddd;border-radius:6px;cursor:pointer;">← Back</button>
            </div>`;
        return;
    }

    // Enrich gear type
    gear.type = ('frame_type' in gear || 'weight' in gear) ? 'bike' : 'shoe';

    const gearActivities = allActivities
        .filter(a => a.gear_id === gearId)
        .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));

    renderGearInfo(gear, gearActivities);
    renderGearStats(gear, gearActivities);
    renderGearAdvanced(gear, gearActivities);
    renderGearHealth(gear, gearActivities);
    renderGearMap(gearActivities);
    renderGearUsageChart(gearActivities, gear.type);
    renderSportTypeChart(gearActivities);
    renderGearPaceEvolutionChart(gearActivities, gear.type);
    renderGearCumulativeElevationChart(gearActivities);
    renderGearActivitiesList(gearActivities);
}

// ===================================================================
// GEAR INFO (top-left card)
// ===================================================================

function renderGearInfo(gear, activities) {
    const container = document.getElementById('gear-info');
    if (!container) return;

    const totalKm = activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const totalHours = activities.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600;
    const avgPaceSecPerKm = totalKm > 0 ? (totalHours * 3600) / totalKm : 0;

    const frameTypes = { 1: 'Mountain Bike', 2: 'Cyclocross', 3: 'Road', 4: 'Time Trial', 5: 'Gravel' };
    const trailRatio = activities.length
        ? activities.filter(a => a.type === 'TrailRun' || a.sport_type === 'TrailRun').length / activities.length
        : 0;
    const gearSubtype = gear.type === 'bike'
        ? (frameTypes[gear.frame_type] || 'Bike')
        : (trailRatio > 0.3 ? 'Trail Running Shoe' : 'Road Running Shoe');

    const badges = [
        gear.primary ? '<span class="status-badge primary">PRIMARY</span>' : '',
        gear.retired ? '<span class="status-badge retired">RETIRED</span>' : '',
    ].filter(Boolean).join('');

    container.innerHTML = `
        <div class="gear-detail-icon">${gear.type === 'bike' ? '🚴' : '👟'}</div>
        <h3>${gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ') || 'Unnamed Gear'}</h3>
        ${badges ? `<div class="status-badges" style="margin-bottom:0.5rem;">${badges}</div>` : ''}
        <p class="gear-subtype-label" style="color:#6b7280;font-size:0.9rem;margin-bottom:0.75rem;">${gearSubtype}</p>
        <div class="info-rows">
            ${gear.brand_name ? `<div class="info-row"><span class="info-label">Brand</span><span class="info-value">${gear.brand_name}</span></div>` : ''}
            ${gear.model_name ? `<div class="info-row"><span class="info-label">Model</span><span class="info-value">${gear.model_name}</span></div>` : ''}
            ${gear.type === 'bike' && gear.weight ? `<div class="info-row"><span class="info-label">Weight</span><span class="info-value">${(gear.weight / 1000).toFixed(2)} kg</span></div>` : ''}
            <div class="info-row"><span class="info-label">Total km</span><span class="info-value">${totalKm.toFixed(1)} km</span></div>
            <div class="info-row"><span class="info-label">Total Time</span><span class="info-value">${totalHours.toFixed(1)} h</span></div>
            <div class="info-row"><span class="info-label">Activities</span><span class="info-value">${activities.length}</span></div>
            ${avgPaceSecPerKm > 0 ? `<div class="info-row"><span class="info-label">Avg Pace</span><span class="info-value">${formatPace(avgPaceSecPerKm, 1000)}</span></div>` : ''}
        </div>
    `;
}

// ===================================================================
// GEAR STATS (top-center card)
// ===================================================================

function renderGearStats(gear, activities) {
    const container = document.getElementById('gear-stats');
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = '<h3>Statistics</h3><p>No activities with this gear yet.</p>';
        return;
    }

    const totalKm = activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const totalHours = activities.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600;
    const totalElev = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
    const avgKm = totalKm / activities.length;
    const avgHours = totalHours / activities.length;
    const avgElev = totalElev / activities.length;
    const avgPaceSec = totalKm > 0 ? (totalHours * 3600) / totalKm : 0;

    const dates = activities.map(a => new Date(a.start_date_local));
    const firstUse = new Date(Math.min(...dates));
    const lastUse = new Date(Math.max(...dates));
    const daysSpan = Math.max(1, Math.ceil((lastUse - firstUse) / (1000 * 60 * 60 * 24)));
    const weeksSpan = daysSpan / 7;

    // Longest consecutive-week streak
    const weekKeys = new Set(activities.map(a => {
        const d = new Date(a.start_date_local);
        const startOfYear = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${week}`;
    }));
    const sortedWeeks = Array.from(weekKeys).sort();
    let longestStreak = sortedWeeks.length ? 1 : 0;
    let currentStreak = 1;
    for (let i = 1; i < sortedWeeks.length; i++) {
        const [y1, w1] = sortedWeeks[i - 1].split('-W').map(Number);
        const [y2, w2] = sortedWeeks[i].split('-W').map(Number);
        const consec = (y1 === y2 && w2 === w1 + 1) || (y2 === y1 + 1 && w1 >= 52 && w2 === 1);
        if (consec) { currentStreak++; longestStreak = Math.max(longestStreak, currentStreak); }
        else currentStreak = 1;
    }

    container.innerHTML = `
        <h3>📊 Statistics</h3>
        <div class="gear-stats-grid">
            <div class="stat-card"><div class="stat-value">${activities.length}</div><div class="stat-label">Activities</div></div>
            <div class="stat-card"><div class="stat-value">${totalKm.toFixed(0)}</div><div class="stat-label">Total km</div></div>
            <div class="stat-card"><div class="stat-value">${totalHours.toFixed(1)}</div><div class="stat-label">Total Hours</div></div>
            <div class="stat-card"><div class="stat-value">${totalElev.toFixed(0)}</div><div class="stat-label">Total Elev (m)</div></div>
            <div class="stat-card"><div class="stat-value">${avgKm.toFixed(1)}</div><div class="stat-label">Avg km</div></div>
            <div class="stat-card"><div class="stat-value">${avgHours.toFixed(1)}</div><div class="stat-label">Avg Hours</div></div>
            <div class="stat-card"><div class="stat-value">${avgElev.toFixed(0)}</div><div class="stat-label">Avg Elev (m)</div></div>
            <div class="stat-card"><div class="stat-value">${formatPace(avgPaceSec, 1000)}</div><div class="stat-label">Avg Pace</div></div>
            <div class="stat-card"><div class="stat-value" style="font-size:0.75rem;">${formatDate(firstUse)}</div><div class="stat-label">First Use</div></div>
            <div class="stat-card"><div class="stat-value" style="font-size:0.75rem;">${formatDate(lastUse)}</div><div class="stat-label">Last Use</div></div>
            <div class="stat-card"><div class="stat-value">${(totalKm / weeksSpan).toFixed(1)}</div><div class="stat-label">km/week</div></div>
            <div class="stat-card"><div class="stat-value">${longestStreak}w</div><div class="stat-label">Longest Streak</div></div>
        </div>
    `;
}

// ===================================================================
// ADVANCED METRICS (top-right card)
// ===================================================================

function renderGearAdvanced(gear, activities) {
    const container = document.getElementById('gear-advanced');
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = '<h3>🔬 Advanced Metrics</h3><p>No activities with this gear yet.</p>';
        return;
    }

    // Weekday analysis
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayCounts = activities.reduce((acc, a) => {
        const d = new Date(a.start_date_local).getDay();
        acc[d] = (acc[d] || 0) + 1;
        return acc;
    }, {});
    const mostUsedDay = weekdayNames[Object.keys(weekdayCounts).reduce((a, b) => weekdayCounts[a] > weekdayCounts[b] ? a : b)];

    // Hour analysis
    const hourCounts = activities.reduce((acc, a) => {
        const h = new Date(a.start_date_local).getHours();
        acc[h] = (acc[h] || 0) + 1;
        return acc;
    }, {});
    const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);

    // Personal Records
    const bestKm = Math.max(...activities.map(a => a.distance / 1000));
    const bestPaceSec = Math.min(...activities
        .filter(a => a.distance > 0 && a.moving_time > 0)
        .map(a => a.moving_time / (a.distance / 1000)));
    const biggestClimb = Math.max(...activities.map(a => a.total_elevation_gain || 0));

    // Elevation analysis
    const activitiesWithElev = activities.filter(a => a.total_elevation_gain > 0);
    const avgElev = activitiesWithElev.length
        ? activitiesWithElev.reduce((s, a) => s + a.total_elevation_gain, 0) / activitiesWithElev.length
        : 0;

    // HR section (only if data available)
    const activitiesWithHR = activities.filter(a => a.average_heartrate > 0);
    const hrSection = activitiesWithHR.length ? (() => {
        const avgHR = activitiesWithHR.reduce((s, a) => s + a.average_heartrate, 0) / activitiesWithHR.length;
        const maxHR = Math.max(...activitiesWithHR.map(a => a.max_heartrate || 0));
        const minHR = Math.min(...activitiesWithHR.map(a => a.average_heartrate));
        return `
            <div class="advanced-section">
                <h4>❤️ Heart Rate</h4>
                <div class="advanced-stats">
                    <div class="stat-item"><span class="stat-label">Avg HR:</span><span class="stat-value">${avgHR.toFixed(0)} bpm</span></div>
                    <div class="stat-item"><span class="stat-label">Max HR:</span><span class="stat-value">${maxHR} bpm</span></div>
                    <div class="stat-item"><span class="stat-label">Min Avg HR:</span><span class="stat-value">${minHR.toFixed(0)} bpm</span></div>
                    <div class="stat-item"><span class="stat-label">Coverage:</span><span class="stat-value">${activitiesWithHR.length}/${activities.length}</span></div>
                </div>
            </div>`;
    })() : '';

    // Speed section (bikes)
    const speedSection = gear.type === 'bike' ? (() => {
        const withSpeed = activities.filter(a => a.average_speed > 0);
        if (!withSpeed.length) return '';
        const avgSpeed = withSpeed.reduce((s, a) => s + a.average_speed, 0) / withSpeed.length * 3.6;
        const maxSpeed = Math.max(...withSpeed.map(a => (a.max_speed || 0) * 3.6));
        return `
            <div class="advanced-section">
                <h4>💨 Speed</h4>
                <div class="advanced-stats">
                    <div class="stat-item"><span class="stat-label">Avg Speed:</span><span class="stat-value">${avgSpeed.toFixed(1)} km/h</span></div>
                    <div class="stat-item"><span class="stat-label">Max Speed:</span><span class="stat-value">${maxSpeed.toFixed(1)} km/h</span></div>
                </div>
            </div>`;
    })() : '';

    container.innerHTML = `
        <h3>🔬 Advanced Metrics</h3>
        <div class="gear-advanced-grid">
            <div class="advanced-section">
                <h4>📅 Usage Patterns</h4>
                <div class="advanced-stats">
                    <div class="stat-item"><span class="stat-label">Favourite day:</span><span class="stat-value">${mostUsedDay}</span></div>
                    <div class="stat-item"><span class="stat-label">Peak hour:</span><span class="stat-value">${peakHour}:00</span></div>
                    <div class="stat-item"><span class="stat-label">Elev activities:</span><span class="stat-value">${activitiesWithElev.length}/${activities.length}</span></div>
                </div>
            </div>
            <div class="advanced-section">
                <h4>🏆 Personal Bests</h4>
                <div class="advanced-stats">
                    <div class="stat-item"><span class="stat-label">Longest:</span><span class="stat-value">${bestKm.toFixed(1)} km</span></div>
                    <div class="stat-item"><span class="stat-label">Best pace:</span><span class="stat-value">${formatPace(bestPaceSec, 1000)}</span></div>
                    <div class="stat-item"><span class="stat-label">Biggest climb:</span><span class="stat-value">${biggestClimb.toFixed(0)} m</span></div>
                </div>
            </div>
            <div class="advanced-section">
                <h4>⛰️ Elevation</h4>
                <div class="advanced-stats">
                    <div class="stat-item"><span class="stat-label">Avg gain:</span><span class="stat-value">${avgElev.toFixed(0)} m</span></div>
                    <div class="stat-item"><span class="stat-label">Max gain:</span><span class="stat-value">${biggestClimb.toFixed(0)} m</span></div>
                    <div class="stat-item"><span class="stat-label">% with elev:</span><span class="stat-value">${((activitiesWithElev.length / activities.length) * 100).toFixed(0)}%</span></div>
                </div>
            </div>
            ${hrSection}
            ${speedSection}
        </div>
    `;
}

// ===================================================================
// GEAR HEALTH
// ===================================================================

function renderGearHealth(gear, activities) {
    const container = document.getElementById('gear-health-content');
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = '<p>No activities to assess gear health.</p>';
        return;
    }

    const redraw = () => {
        const customData = getCustomData(gear.id);
        const defaults = getDefaultValues(gear.type || 'unknown');
        const durationKm = customData.durationKm ?? defaults.durationKm;
        const price = customData.price ?? defaults.price;
        const totalKm = activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
        const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
        const remainingKm = Math.max(0, durationKm - totalKm);
        const euroPerKm = (price > 0 && totalKm > 0) ? (price / totalKm).toFixed(2) : '-';

        const dates = activities.map(a => new Date(a.start_date_local));
        const firstUse = new Date(Math.min(...dates));
        const lastUse = new Date(Math.max(...dates));
        const weeksUsed = Math.max(1, (lastUse - firstUse) / (1000 * 60 * 60 * 24 * 7));
        const weeklyKm = totalKm / weeksUsed;
        const weeksLeft = weeklyKm > 0 ? Math.round(remainingKm / weeklyKm) : null;
        const estDate = weeksLeft != null ? (() => { const d = new Date(); d.setDate(d.getDate() + weeksLeft * 7); return formatDate(d); })() : null;

        const color = durabilityPercent > 90 ? '#ef4444' : durabilityPercent > 75 ? '#f59e0b' : '#10b981';

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1rem;">
                <div class="stat-card"><div class="stat-value" style="color:${color};">${durabilityPercent.toFixed(0)}%</div><div class="stat-label">Durability Used</div></div>
                <div class="stat-card"><div class="stat-value">${remainingKm.toFixed(0)} km</div><div class="stat-label">Remaining Life</div></div>
                <div class="stat-card"><div class="stat-value">${weeklyKm.toFixed(1)} km</div><div class="stat-label">Weekly Avg</div></div>
                ${weeksLeft != null ? `<div class="stat-card"><div class="stat-value" style="font-size:0.75rem;">${estDate}</div><div class="stat-label">Est. End (~${weeksLeft}w)</div></div>` : ''}
                <div class="stat-card"><div class="stat-value">${euroPerKm}</div><div class="stat-label">€/km</div></div>
            </div>
            <div style="margin-bottom:1rem;">
                <div style="height:12px;background:#e5e7eb;border-radius:999px;overflow:hidden;">
                    <div style="width:${durabilityPercent}%;height:100%;background:${color};border-radius:999px;transition:width 0.6s;"></div>
                </div>
                <small style="display:block;text-align:center;margin-top:0.4rem;color:#6b7280;">${totalKm.toFixed(0)} / ${durationKm} km lifespan</small>
            </div>
            <details>
                <summary style="cursor:pointer;font-size:0.85rem;color:#6b7280;padding:0.25rem 0;">✏️ Edit lifespan &amp; price</summary>
                <div class="gear-edit-section" style="margin-top:0.5rem;">
                    <div class="edit-input-group">
                        <label>Price (€)</label>
                        <input type="number" id="health-price-${gear.id}" value="${price}" min="0" step="0.01">
                    </div>
                    <div class="edit-input-group">
                        <label>Lifespan (km)</label>
                        <input type="number" id="health-duration-${gear.id}" value="${durationKm}" min="1">
                    </div>
                    <button id="health-save-${gear.id}" class="save-gear-btn">💾 Save</button>
                </div>
            </details>
        `;

        document.getElementById(`health-save-${gear.id}`)?.addEventListener('click', () => {
            const p = parseFloat(document.getElementById(`health-price-${gear.id}`).value);
            const d = parseInt(document.getElementById(`health-duration-${gear.id}`).value, 10);
            if (isNaN(p) || isNaN(d) || p < 0 || d <= 0) return;
            saveCustomData(gear.id, { price: p, durationKm: d });
            redraw();
        });
    };

    redraw();
}

// ===================================================================
// GEAR MAP (with colored polylines per activity)
// ===================================================================

function renderGearMap(activities) {
    const mapContainer = document.getElementById('gear-map');
    if (!mapContainer) return;

    if (!activities.length) {
        mapContainer.innerHTML = '<p style="padding:1rem;">No activities with location data.</p>';
        return;
    }

    const map = L.map('gear-map').setView([40.7128, -74.006], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
    const heatPoints = [];
    const bounds = [];

    activities.forEach((act, idx) => {
        const color = palette[idx % palette.length];
        let coords = null;
        if (act.map?.summary_polyline || act.map?.polyline) {
            coords = decodePolyline(act.map.summary_polyline || act.map.polyline);
        }
        if (coords?.length) {
            L.polyline(coords, { color, weight: 2.5, opacity: 0.65 })
                .addTo(map)
                .bindTooltip(`${act.name || 'Activity'} · ${(act.distance / 1000).toFixed(1)} km`);
            coords.forEach(c => { heatPoints.push([c[0], c[1], 0.4]); bounds.push(c); });
        } else if (act.start_latlng?.length === 2) {
            const pt = act.start_latlng;
            L.circleMarker(pt, { radius: 5, color, fillOpacity: 0.7 })
                .addTo(map)
                .bindTooltip(act.name || 'Activity');
            heatPoints.push([pt[0], pt[1], 0.4]);
            bounds.push(pt);
        }
    });

    if (typeof L.heatLayer === 'function' && heatPoints.length) {
        try { L.heatLayer(heatPoints, { radius: 10, blur: 15, maxZoom: 12 }).addTo(map); } catch (e) { }
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [25, 25] });
}

// ===================================================================
// USAGE CHART (monthly bar + cumulative line)
// ===================================================================

function renderGearUsageChart(activities) {
    const ctx = document.getElementById('gear-usage-chart');
    if (!ctx || !activities.length) return;

    const monthlyData = activities.reduce((acc, a) => {
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = { distance: 0, count: 0 };
        acc[month].distance += a.distance / 1000;
        acc[month].count += 1;
        return acc;
    }, {});

    const labels = Object.keys(monthlyData).sort();
    const distanceData = labels.map(m => +monthlyData[m].distance.toFixed(1));
    const countData = labels.map(m => monthlyData[m].count);
    let cum = 0;
    const cumulativeData = distanceData.map(d => +(cum += d).toFixed(1));

    ctx.parentElement.style.height = '250px';
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Cumulative km',
                    data: cumulativeData,
                    borderColor: '#6366f1',
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.4,
                    borderDash: [5, 5],
                    pointRadius: 2,
                    order: 1
                },
                {
                    type: 'bar',
                    label: 'Monthly km',
                    data: distanceData,
                    backgroundColor: 'rgba(99,102,241,0.6)',
                    yAxisID: 'y',
                    order: 2
                },
                {
                    type: 'line',
                    label: 'Activities',
                    data: countData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    yAxisID: 'y1',
                    tension: 0.4,
                    pointRadius: 3,
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Distance (km)' } },
                y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Activities' }, grid: { drawOnChartArea: false } }
            },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            }
        }
    });
}

// ===================================================================
// SPORT TYPE DISTRIBUTION (doughnut — shown only if multiple types)
// ===================================================================

function renderSportTypeChart(activities) {
    const section = document.getElementById('gear-sport-type-section');
    const ctx = document.getElementById('gear-sport-type-chart');
    if (!ctx || !activities.length) {
        if (section) section.style.display = 'none';
        return;
    }

    const typeCounts = activities.reduce((acc, a) => {
        const t = a.sport_type || a.type || 'Other';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {});

    const types = Object.keys(typeCounts);
    if (types.length <= 1) {
        if (section) section.style.display = 'none';
        return;
    }

    if (section) section.style.display = '';
    ctx.parentElement.style.height = '200px';

    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: types,
            datasets: [{
                data: types.map(t => typeCounts[t]),
                backgroundColor: colors.slice(0, types.length),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'right' },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} activities` } }
            }
        }
    });
}

// ===================================================================
// PACE / SPEED EVOLUTION CHART (with rolling average)
// ===================================================================

function renderGearPaceEvolutionChart(activities, gearType) {
    const ctx = document.getElementById('gear-pace-chart');
    if (!ctx || !activities.length) return;
    ctx.parentElement.style.height = '200px';

    const sorted = [...activities]
        .filter(a => a.distance > 0 && a.moving_time > 0)
        .sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));

    if (!sorted.length) return;

    const isBike = gearType === 'bike';
    const labels = sorted.map(a => formatDate(new Date(a.start_date_local)));
    const values = isBike
        ? sorted.map(a => +((a.distance / 1000) / (a.moving_time / 3600)).toFixed(2))   // km/h
        : sorted.map(a => +((a.moving_time / 60) / (a.distance / 1000)).toFixed(2));    // min/km

    // 5-activity rolling average
    const winSize = 5;
    const rolling = values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - winSize + 1), i + 1);
        return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: isBike ? 'Speed (km/h)' : 'Pace (min/km)',
                    data: values,
                    borderColor: 'rgba(99,102,241,0.35)',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    pointRadius: 2,
                    borderWidth: 1.5
                },
                {
                    label: `${winSize}-activity avg`,
                    data: rolling,
                    borderColor: '#6366f1',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2.5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { reverse: !isBike, title: { display: true, text: isBike ? 'km/h' : 'min/km' } },
                x: { ticks: { maxTicksLimit: 10 } }
            },
            plugins: { legend: { display: true, position: 'top' } }
        }
    });
}

// ===================================================================
// CUMULATIVE ELEVATION CHART
// ===================================================================

function renderGearCumulativeElevationChart(activities) {
    const ctx = document.getElementById('gear-elevation-chart');
    if (!ctx || !activities.length) return;
    ctx.parentElement.style.height = '200px';

    const sorted = [...activities]
        .filter(a => a.total_elevation_gain != null)
        .sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));

    if (!sorted.length) return;

    const labels = sorted.map(a => formatDate(new Date(a.start_date_local)));
    let cumulative = 0;
    const cumulativeData = sorted.map(a => (cumulative += (a.total_elevation_gain || 0)));

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Cumulative Elevation (m)',
                data: cumulativeData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Elevation (m)' }, beginAtZero: true },
                x: { ticks: { maxTicksLimit: 10 } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ===================================================================
// ACTIVITIES LIST
// ===================================================================

function renderGearActivitiesList(activities) {
    const container = document.getElementById('gear-activities-list');
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = '<p>No activities found with this gear.</p>';
        return;
    }

    const typeIcon = type => {
        const icons = { Run: '🏃', TrailRun: '🏔️', VirtualRun: '🖥️', Ride: '🚴', VirtualRide: '💻', GravelRide: '🪨', MountainBikeRide: '🏔️', Walk: '🚶', Hike: '🥾', Swim: '🏊' };
        return icons[type] || '🏅';
    };

    container.innerHTML = `
        <div class="activities-summary" style="margin-bottom:0.75rem;color:#6b7280;">
            Showing ${activities.length} activities
        </div>
        <div class="gear-activities-grid">
            ${activities.map(activity => {
        const date = new Date(activity.start_date_local);
        const km = (activity.distance / 1000).toFixed(1);
        const time = formatTime(activity.moving_time);
        const pace = activity.distance > 0
            ? formatPace((activity.moving_time / 60) / (activity.distance / 1000) * 60, 1000)
            : 'N/A';
        const elevation = activity.total_elevation_gain || 0;
        const hr = activity.average_heartrate ? Math.round(activity.average_heartrate) : null;
        const type = activity.sport_type || activity.type || '';
        const icon = typeIcon(type);

        return `
                    <div class="gear-activity-card" onclick="window.open('../activity.html?id=${activity.id}', '_blank')" style="cursor:pointer;">
                        <div class="activity-header">
                            <h4>${icon} ${activity.name || 'Unnamed Activity'}</h4>
                            <span class="activity-date">${formatDate(date)}</span>
                        </div>
                        <div class="activity-stats">
                            <div class="activity-stat"><span class="stat-value">${km}</span><span class="stat-unit">km</span></div>
                            <div class="activity-stat"><span class="stat-value">${time}</span><span class="stat-unit">time</span></div>
                            <div class="activity-stat"><span class="stat-value">${pace}</span><span class="stat-unit">pace</span></div>
                            ${elevation > 0 ? `<div class="activity-stat"><span class="stat-value">${elevation}</span><span class="stat-unit">m ↑</span></div>` : ''}
                            ${hr ? `<div class="activity-stat"><span class="stat-value">${hr}</span><span class="stat-unit">bpm</span></div>` : ''}
                        </div>
                        ${activity.achievement_count > 0 ? `<div class="achievement-badge">🏆 ${activity.achievement_count} achievement${activity.achievement_count > 1 ? 's' : ''}</div>` : ''}
                    </div>
                `;
    }).join('')}
        </div>
    `;
}
