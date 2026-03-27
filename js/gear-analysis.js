// js/gear-analysis.js — Individual Gear Detail Page

import { formatPace, formatTime, formatDate } from './utils.js';

// ===================================================================
// HELPERS
// ===================================================================

function getDefaultValues(type) {
    const defaults = { bike: { price: 1000, durationKm: 15000 }, shoe: { price: 120, durationKm: 700 }, unknown: { price: 100, durationKm: 1000 } };
    return defaults[type] || defaults.unknown;
}
function getCustomData(gearId) { return JSON.parse(localStorage.getItem(`gear-custom-${gearId}`) || '{}'); }
function saveCustomData(gearId, data) { localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify(data)); }

function decodePolyline(str) {
    let index = 0, lat = 0, lng = 0;
    const coords = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);
        shift = 0; result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        coords.push([lat / 1e5, lng / 1e5]);
    }
    return coords;
}

// Simple stat cell (neutral card, no colors)
function statCell(value, label) {
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:0.9rem 0.75rem;text-align:center;">
        <div style="font-size:1.25rem;font-weight:700;color:#0f172a;line-height:1.2;">${value}</div>
        <div style="font-size:0.7rem;color:#64748b;margin-top:0.25rem;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
    </div>`;
}

function statRow(label, value) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid #f1f5f9;">
        <span style="color:#64748b;font-size:0.85rem;">${label}</span>
        <span style="font-weight:600;font-size:0.85rem;color:#1e293b;">${value}</span>
    </div>`;
}

// ===================================================================
// MAIN ENTRY POINT
// ===================================================================

export async function renderGearDetailPage(gearId) {
    const allActivities = JSON.parse(localStorage.getItem('strava_activities') || '[]');
    const allGears = JSON.parse(localStorage.getItem('strava_gears') || '[]');
    const gear = allGears.find(g => g.id === gearId);

    if (!gear) {
        document.body.innerHTML = `<div style="padding:2rem;text-align:center;">
            <h2>Gear not found</h2>
            <p style="color:#64748b;">ID "${gearId}" not in local cache.</p>
            <button onclick="window.history.back()" style="margin-top:1rem;padding:8px 16px;border:1px solid #ddd;border-radius:6px;cursor:pointer;">← Back</button>
        </div>`;
        return;
    }

    gear.type = ('frame_type' in gear || 'weight' in gear) ? 'bike' : 'shoe';

    const gearActivities = allActivities
        .filter(a => a.gear_id === gearId)
        .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));

    renderGearHero(gear, gearActivities);
    renderGearHealth(gear, gearActivities);
    renderGearStats(gearActivities);
    renderGearAdvanced(gear, gearActivities);
    renderGearMap(gearActivities);
    renderGearUsageChart(gearActivities);
    renderGearPaceEvolutionChart(gearActivities, gear.type);
    renderGearCumulativeElevationChart(gearActivities);
    renderGearActivitiesList(gearActivities);
}

// ===================================================================
// HERO SECTION
// ===================================================================

function renderGearHero(gear, activities) {
    const container = document.getElementById('gear-hero');
    if (!container) return;

    const totalKm = activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const totalHours = activities.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600;
    const avgPaceSec = totalKm > 0 ? (totalHours * 3600) / totalKm : 0;

    const frameTypes = { 1: 'Mountain Bike', 2: 'Cyclocross', 3: 'Road', 4: 'Time Trial', 5: 'Gravel' };
    const trailRatio = activities.length
        ? activities.filter(a => a.type === 'TrailRun' || a.sport_type === 'TrailRun').length / activities.length : 0;
    const gearSubtype = gear.type === 'bike'
        ? (frameTypes[gear.frame_type] || 'Bike')
        : (trailRatio > 0.3 ? 'Trail Running Shoe' : 'Road Running Shoe');

    const badgeStyle = (bg, color) => `display:inline-block;padding:0.2rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:700;background:${bg};color:${color};text-transform:uppercase;letter-spacing:0.5px;`;
    const badges = [
        gear.primary ? `<span style="${badgeStyle('#fef3c7','#92400e')}">Primary</span>` : '',
        gear.retired ? `<span style="${badgeStyle('#fee2e2','#991b1b')}">Retired</span>` : '',
    ].filter(Boolean).join(' ');

    const meta = [
        gear.brand_name, gear.model_name,
        gear.type === 'bike' && gear.weight ? `${(gear.weight / 1000).toFixed(2)} kg` : null
    ].filter(Boolean).join(' · ');

    container.innerHTML = `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:1.75rem;margin-bottom:1.5rem;display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap;">
            <div style="font-size:3.5rem;width:72px;height:72px;background:#f1f5f9;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                ${gear.type === 'bike' ? '🚴' : '👟'}
            </div>
            <div style="flex:1;min-width:180px;">
                <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.3rem;">
                    <h2 style="margin:0;font-size:1.45rem;font-weight:700;color:#0f172a;">${gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ') || 'Unnamed Gear'}</h2>
                    ${badges}
                </div>
                <p style="margin:0 0 1.25rem;color:#64748b;font-size:0.875rem;">${gearSubtype}${meta ? ' · ' + meta : ''}</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:0.6rem;">
                    ${statCell(totalKm.toFixed(0) + ' km', 'Total Distance')}
                    ${statCell(activities.length, 'Activities')}
                    ${statCell(totalHours.toFixed(1) + ' h', 'Total Time')}
                    ${avgPaceSec > 0 && gear.type !== 'bike' ? statCell(formatPace(avgPaceSec, 1000), 'Avg Pace') : ''}
                    ${avgPaceSec > 0 && gear.type === 'bike' ? statCell((totalKm / totalHours).toFixed(1) + ' km/h', 'Avg Speed') : ''}
                </div>
            </div>
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
        container.innerHTML = '<p style="color:#64748b;">No activities to assess gear health.</p>';
        return;
    }

    const redraw = () => {
        const custom = getCustomData(gear.id);
        const def = getDefaultValues(gear.type || 'unknown');
        const durationKm = custom.durationKm ?? def.durationKm;
        const price = custom.price ?? def.price;
        const totalKm = activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
        const pct = Math.min((totalKm / durationKm) * 100, 100);
        const remainingKm = Math.max(0, durationKm - totalKm);
        const euroPerKm = (price > 0 && totalKm > 0) ? (price / totalKm).toFixed(2) : '-';

        const dates = activities.map(a => new Date(a.start_date_local));
        const firstUse = new Date(Math.min(...dates));
        const lastUse = new Date(Math.max(...dates));
        const weeksUsed = Math.max(1, (lastUse - firstUse) / (1000 * 60 * 60 * 24 * 7));
        const weeklyKm = totalKm / weeksUsed;
        const weeksLeft = weeklyKm > 0 ? Math.round(remainingKm / weeklyKm) : null;
        const estDate = weeksLeft != null ? (() => { const d = new Date(); d.setDate(d.getDate() + weeksLeft * 7); return formatDate(d); })() : null;

        const barColor = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#22c55e';

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.75rem;margin-bottom:1.25rem;">
                ${statCell(`<span style="color:${barColor};">${pct.toFixed(0)}%</span>`, 'Durability Used')}
                ${statCell(remainingKm.toFixed(0) + ' km', 'Remaining')}
                ${statCell(weeklyKm.toFixed(1) + ' km', 'Weekly Avg')}
                ${weeksLeft != null ? statCell(`<span style="font-size:0.9rem;">${estDate}</span><br><small style="color:#64748b;">~${weeksLeft} wks</small>`, 'Est. End') : ''}
                ${statCell(euroPerKm + ' €', '€ / km')}
            </div>
            <div style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:0.5rem;">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:999px;transition:width 0.6s;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#64748b;margin-bottom:1rem;">
                <span>${totalKm.toFixed(0)} km used</span>
                <span>${durationKm} km lifespan</span>
            </div>
            <details>
                <summary style="cursor:pointer;font-size:0.85rem;color:#64748b;padding:0.25rem 0;user-select:none;">✏️ Edit lifespan &amp; price</summary>
                <div style="margin-top:0.75rem;display:flex;gap:0.75rem;flex-wrap:wrap;align-items:flex-end;">
                    <div>
                        <label style="display:block;font-size:0.8rem;color:#64748b;margin-bottom:0.25rem;">Price (€)</label>
                        <input type="number" id="hp-${gear.id}" value="${price}" min="0" step="0.01"
                            style="width:110px;padding:0.4rem 0.6rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.8rem;color:#64748b;margin-bottom:0.25rem;">Lifespan (km)</label>
                        <input type="number" id="hd-${gear.id}" value="${durationKm}" min="1"
                            style="width:110px;padding:0.4rem 0.6rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem;">
                    </div>
                    <button id="hs-${gear.id}"
                        style="padding:0.45rem 1rem;background:#0f172a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;">
                        Save
                    </button>
                </div>
            </details>
        `;

        document.getElementById(`hs-${gear.id}`)?.addEventListener('click', () => {
            const p = parseFloat(document.getElementById(`hp-${gear.id}`).value);
            const d = parseInt(document.getElementById(`hd-${gear.id}`).value, 10);
            if (isNaN(p) || isNaN(d) || p < 0 || d <= 0) return;
            saveCustomData(gear.id, { price: p, durationKm: d });
            redraw();
        });
    };
    redraw();
}

// ===================================================================
// STATISTICS GRID
// ===================================================================

function renderGearStats(activities) {
    const container = document.getElementById('gear-stats-content');
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = '<p style="color:#64748b;">No activities yet.</p>';
        return;
    }

    const totalKm = activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const totalHours = activities.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600;
    const totalElev = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
    const avgKm = totalKm / activities.length;
    const avgElev = totalElev / activities.length;
    const avgPaceSec = totalKm > 0 ? (totalHours * 3600) / totalKm : 0;

    const dates = activities.map(a => new Date(a.start_date_local));
    const firstUse = new Date(Math.min(...dates));
    const lastUse = new Date(Math.max(...dates));
    const daysSpan = Math.max(1, Math.ceil((lastUse - firstUse) / 86400000));
    const weeksSpan = Math.max(1, daysSpan / 7);

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.65rem;">
            ${statCell(activities.length, 'Activities')}
            ${statCell(totalKm.toFixed(0) + ' km', 'Total Distance')}
            ${statCell(totalHours.toFixed(1) + ' h', 'Total Time')}
            ${statCell(totalElev.toFixed(0) + ' m', 'Total Elevation')}
            ${statCell(avgKm.toFixed(1) + ' km', 'Avg Distance')}
            ${statCell(avgElev.toFixed(0) + ' m', 'Avg Elevation')}
            ${statCell(formatPace(avgPaceSec, 1000), 'Avg Pace')}
            ${statCell((totalKm / weeksSpan).toFixed(1) + ' km', 'km / week')}
            ${statCell(formatDate(firstUse), 'First Use')}
            ${statCell(formatDate(lastUse), 'Last Use')}
            ${statCell(daysSpan + ' days', 'Active Span')}
        </div>
    `;
}

// ===================================================================
// PATTERNS & RECORDS
// ===================================================================

function renderGearAdvanced(gear, activities) {
    const container = document.getElementById('gear-advanced-content');
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = '<p style="color:#64748b;">No activities yet.</p>';
        return;
    }

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayCounts = activities.reduce((acc, a) => { const d = new Date(a.start_date_local).getDay(); acc[d] = (acc[d] || 0) + 1; return acc; }, {});
    const mostUsedDay = weekdayNames[+Object.keys(weekdayCounts).reduce((a, b) => weekdayCounts[a] > weekdayCounts[b] ? a : b)];

    const hourCounts = activities.reduce((acc, a) => { const h = new Date(a.start_date_local).getHours(); acc[h] = (acc[h] || 0) + 1; return acc; }, {});
    const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);

    const bestKm = Math.max(...activities.map(a => a.distance / 1000));
    const paced = activities.filter(a => a.distance > 0 && a.moving_time > 0);
    const bestPaceSec = paced.length ? Math.min(...paced.map(a => a.moving_time / (a.distance / 1000))) : 0;
    const bestClimb = Math.max(...activities.map(a => a.total_elevation_gain || 0));
    const activitiesWithElev = activities.filter(a => a.total_elevation_gain > 0);

    const withHR = activities.filter(a => a.average_heartrate > 0);
    const hrSection = withHR.length ? `
        <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid #f1f5f9;">
            <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin:0 0 0.6rem;">Heart Rate</p>
            ${statRow('Avg HR', (withHR.reduce((s, a) => s + a.average_heartrate, 0) / withHR.length).toFixed(0) + ' bpm')}
            ${statRow('Max HR recorded', Math.max(...withHR.map(a => a.max_heartrate || 0)) + ' bpm')}
            ${statRow('HR data coverage', withHR.length + '/' + activities.length)}
        </div>` : '';

    const speedSection = gear.type === 'bike' ? (() => {
        const ws = activities.filter(a => a.average_speed > 0);
        if (!ws.length) return '';
        const avgSpd = ws.reduce((s, a) => s + a.average_speed, 0) / ws.length * 3.6;
        const maxSpd = Math.max(...ws.map(a => (a.max_speed || 0) * 3.6));
        return `
            <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid #f1f5f9;">
                <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin:0 0 0.6rem;">Speed</p>
                ${statRow('Avg Speed', avgSpd.toFixed(1) + ' km/h')}
                ${statRow('Max Speed', maxSpd.toFixed(1) + ' km/h')}
            </div>`;
    })() : '';

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
            <div>
                <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin:0 0 0.6rem;">Usage Patterns</p>
                ${statRow('Favourite day', mostUsedDay)}
                ${statRow('Peak hour', peakHour + ':00')}
                ${statRow('Activities with elev.', activitiesWithElev.length + '/' + activities.length)}
            </div>
            <div>
                <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin:0 0 0.6rem;">Personal Bests</p>
                ${statRow('Longest activity', bestKm.toFixed(1) + ' km')}
                ${bestPaceSec > 0 ? statRow('Best pace', formatPace(bestPaceSec, 1000)) : ''}
                ${statRow('Biggest climb', bestClimb.toFixed(0) + ' m')}
            </div>
        </div>
        ${hrSection}
        ${speedSection}
    `;
}

// ===================================================================
// MAP
// ===================================================================

function renderGearMap(activities) {
    const mapContainer = document.getElementById('gear-map');
    if (!mapContainer) return;
    if (!activities.length) { mapContainer.innerHTML = '<p style="padding:1rem;color:#64748b;">No location data.</p>'; return; }

    const map = L.map('gear-map').setView([40.7128, -74.006], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);

    const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
    const bounds = [];

    activities.forEach((act, idx) => {
        const color = palette[idx % palette.length];
        let coords = null;
        if (act.map?.summary_polyline || act.map?.polyline) coords = decodePolyline(act.map.summary_polyline || act.map.polyline);
        if (coords?.length) {
            L.polyline(coords, { color, weight: 2.5, opacity: 0.7 }).addTo(map)
                .bindTooltip(`${act.name || 'Activity'} · ${(act.distance / 1000).toFixed(1)} km`);
            coords.forEach(c => bounds.push(c));
        } else if (act.start_latlng?.length === 2) {
            bounds.push(act.start_latlng);
            L.circleMarker(act.start_latlng, { radius: 5, color, fillOpacity: 0.8 }).addTo(map).bindTooltip(act.name || 'Activity');
        }
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
}

// ===================================================================
// USAGE CHART (monthly bar + cumulative line)
// ===================================================================

function renderGearUsageChart(activities) {
    const ctx = document.getElementById('gear-usage-chart');
    if (!ctx || !activities.length) return;

    const monthly = activities.reduce((acc, a) => {
        const m = a.start_date_local.substring(0, 7);
        if (!acc[m]) acc[m] = { distance: 0, count: 0 };
        acc[m].distance += a.distance / 1000;
        acc[m].count++;
        return acc;
    }, {});

    const labels = Object.keys(monthly).sort();
    const distData = labels.map(m => +monthly[m].distance.toFixed(1));
    const countData = labels.map(m => monthly[m].count);
    let cum = 0;
    const cumData = distData.map(d => +(cum += d).toFixed(1));

    ctx.parentElement.style.height = '260px';
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { type: 'line', label: 'Cumulative km', data: cumData, borderColor: '#6366f1', backgroundColor: 'transparent', yAxisID: 'y', tension: 0.4, borderDash: [5, 5], pointRadius: 2, order: 1 },
                { type: 'bar', label: 'Monthly km', data: distData, backgroundColor: 'rgba(99,102,241,0.55)', yAxisID: 'y', order: 2 },
                { type: 'line', label: 'Activities', data: countData, borderColor: '#f59e0b', backgroundColor: 'transparent', yAxisID: 'y1', tension: 0.4, pointRadius: 3, order: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { position: 'left', beginAtZero: true, title: { display: true, text: 'km' } },
                y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Activities' }, grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { display: true, position: 'top' }, tooltip: { mode: 'index', intersect: false } }
        }
    });
}

// ===================================================================
// PACE / SPEED EVOLUTION (with rolling average)
// ===================================================================

function renderGearPaceEvolutionChart(activities, gearType) {
    const ctx = document.getElementById('gear-pace-chart');
    if (!ctx || !activities.length) return;
    ctx.parentElement.style.height = '220px';

    const sorted = [...activities].filter(a => a.distance > 0 && a.moving_time > 0)
        .sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));
    if (!sorted.length) return;

    const isBike = gearType === 'bike';
    const labels = sorted.map(a => formatDate(new Date(a.start_date_local)));
    const values = isBike
        ? sorted.map(a => +((a.distance / 1000) / (a.moving_time / 3600)).toFixed(2))
        : sorted.map(a => +((a.moving_time / 60) / (a.distance / 1000)).toFixed(2));

    const winSize = 5;
    const rolling = values.map((_, i) => {
        const sl = values.slice(Math.max(0, i - winSize + 1), i + 1);
        return +(sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(2);
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: isBike ? 'Speed (km/h)' : 'Pace (min/km)', data: values, borderColor: 'rgba(99,102,241,0.3)', backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 2, borderWidth: 1.5 },
                { label: winSize + '-act avg', data: rolling, borderColor: '#6366f1', backgroundColor: 'transparent', fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2.5 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { reverse: !isBike, title: { display: true, text: isBike ? 'km/h' : 'min/km' } },
                x: { ticks: { maxTicksLimit: 10 } }
            },
            plugins: { legend: { display: true, position: 'top' } }
        }
    });
}

// ===================================================================
// CUMULATIVE ELEVATION
// ===================================================================

function renderGearCumulativeElevationChart(activities) {
    const ctx = document.getElementById('gear-elevation-chart');
    if (!ctx || !activities.length) return;
    ctx.parentElement.style.height = '220px';

    const sorted = [...activities].filter(a => a.total_elevation_gain != null)
        .sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));
    if (!sorted.length) return;

    const labels = sorted.map(a => formatDate(new Date(a.start_date_local)));
    let cum = 0;
    const data = sorted.map(a => (cum += (a.total_elevation_gain || 0)));

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'Cumulative Elevation (m)', data, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, pointRadius: 1 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'm' }, beginAtZero: true },
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
        container.innerHTML = '<p style="color:#64748b;">No activities with this gear.</p>';
        return;
    }

    const typeIcon = t => ({ Run: '🏃', TrailRun: '🏔️', VirtualRun: '🖥️', Ride: '🚴', VirtualRide: '💻', GravelRide: '🪨', MountainBikeRide: '⛰️', Walk: '🚶', Hike: '🥾', Swim: '🏊' }[t] || '🏅');

    const rows = activities.map(a => {
        const km = (a.distance / 1000).toFixed(1);
        const time = formatTime(a.moving_time);
        const pace = a.distance > 0 ? formatPace((a.moving_time / 60) / (a.distance / 1000) * 60, 1000) : '—';
        const elev = a.total_elevation_gain > 0 ? `<span style="color:#64748b;">↑${a.total_elevation_gain.toFixed(0)} m</span>` : '';
        const hr = a.average_heartrate ? `<span style="color:#ef4444;">♥ ${Math.round(a.average_heartrate)}</span>` : '';
        const type = a.sport_type || a.type || '';
        const ach = a.achievement_count > 0 ? `<span style="font-size:0.75rem;color:#f59e0b;margin-left:0.25rem;">🏆${a.achievement_count}</span>` : '';

        return `
            <div onclick="window.open('../activity.html?id=${a.id}', '_blank')"
                 style="display:flex;align-items:center;gap:0.75rem;padding:0.7rem 0.9rem;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:white;transition:background 0.15s;margin-bottom:0.4rem;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                <span style="font-size:1.3rem;width:24px;text-align:center;flex-shrink:0;">${typeIcon(type)}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#0f172a;">
                        ${a.name || 'Unnamed Activity'}${ach}
                    </div>
                    <div style="font-size:0.75rem;color:#94a3b8;">${formatDate(new Date(a.start_date_local))}</div>
                </div>
                <div style="display:flex;gap:0.9rem;font-size:0.85rem;font-weight:500;color:#374151;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                    <span>${km} km</span>
                    <span>${time}</span>
                    <span>${pace}</span>
                    ${elev}
                    ${hr}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <p style="font-size:0.85rem;color:#64748b;margin-bottom:0.75rem;">${activities.length} activities</p>
        ${rows}
    `;
}
