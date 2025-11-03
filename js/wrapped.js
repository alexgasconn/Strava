// wrapped-updated.js
// Enhanced renderWrappedStats module to replace/augment sport breakdown and add many features.
// Usage: renderWrappedStats(allActivities, {containerIds, reverseGeocoder})
// - allActivities: array of activity objects
// - containerIds: optional map of container element IDs (defaults to existing IDs)
// - reverseGeocoder: optional object with async getCountry(lat,lng) -> { name, code }

export async function renderWrappedTab(allActivities, options = {}) {
  const cfg = {
    containerIds: {
      summary: 'wrapped-summary',
      personalBests: 'wrapped-personal-bests',
      sportComparison: 'wrapped-sport-comparison',
      temporalStats: 'wrapped-temporal-stats',
      motivation: 'wrapped-motivation',
      extremeStats: 'wrapped-extreme-stats',
      allActivities: 'wrapped-all-activities',
      ...options.containerIds
    },
    reverseGeocoder: options.reverseGeocoder || null
  };

  if (!allActivities || allActivities.length === 0) {
    document.getElementById(cfg.containerIds.summary).innerHTML = '<p>No activity data available.</p>';
    return;
  }

  // --- Utilities ---
  const utils = {
    secToH(sec) { return sec / 3600; },
    formatTime(sec) {
      if (!isFinite(sec) || sec <= 0) return 'N/A';
      sec = Math.round(sec);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    },
    formatDistance(m) { return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`; },
    formatPace(seconds, km) {
      if (!isFinite(seconds) || !isFinite(km) || km <= 0) return 'N/A';
      const pace = seconds / km; const min = Math.floor(pace/60); const sec = Math.round(pace%60);
      return `${min}:${String(sec).padStart(2,'0')} /km`;
    },
    avg(arr, key) { const vals = arr.map(a => a[key]).filter(v => Number.isFinite(v)); return vals.length? vals.reduce((s,v)=>s+v,0)/vals.length : null; },
    sum(arr, key) { return arr.reduce((s,a)=> s + (Number(a[key])||0), 0); },
    groupBy(arr, keyFn) {
      const map = new Map();
      arr.forEach(item => {
        const k = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
      });
      return map;
    }
  };

  // --- Helper: year-based filtering ---
  const getYear = dateStr => new Date(dateStr).getFullYear();
  const years = Array.from(new Set(allActivities.map(a => getYear(a.start_date)))).sort((a,b)=>b-a);
  const currentYear = years[0];
  const prevYear = years[1] || null;

  const activitiesByYear = y => allActivities.filter(a => getYear(a.start_date) === y);
  const currentActs = activitiesByYear(currentYear);
  const prevActs = prevYear ? activitiesByYear(prevYear) : [];

  // --- Sport aggregation by total TIME (descending) ---
  function compileSports(acts) {
    const bySport = {};
    acts.forEach(a => {
      const type = a.type || a.sport || 'Unknown';
      if (!bySport[type]) bySport[type] = { activities: [], distance:0, time:0, elevation:0 };
      bySport[type].activities.push(a);
      bySport[type].distance += Number(a.distance) || 0;
      bySport[type].time += Number(a.moving_time) || 0;
      bySport[type].elevation += Number(a.total_elevation_gain) || 0;
    });
    return Object.entries(bySport).map(([sport,data]) => ({ sport, ...data, count: data.activities.length }))
      .sort((a,b)=> b.time - a.time);
  }

  const sportsCurrent = compileSports(currentActs);
  const sportsPrev = compileSports(prevActs);

  function pctChange(curr, prev) {
    if (!prev || prev === 0) return '—';
    return (((curr - prev) / prev) * 100).toFixed(1) + '%';
  }

  // --- Monthly, weekday, hour histograms ---
  function groupMonthlyHours(acts) {
    const map = {};
    acts.forEach(a => {
      const d = new Date(a.start_date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!map[key]) map[key] = 0;
      map[key] += utils.secToH(Number(a.moving_time)||0);
    });
    return Object.entries(map).map(([month,hours])=>({month,hours})).sort((a,b)=>a.month.localeCompare(b.month));
  }

  function groupWeekdayHours(acts) {
    const hours = [0,0,0,0,0,0,0];
    acts.forEach(a=>{ const d = new Date(a.start_date); hours[d.getDay()] += utils.secToH(Number(a.moving_time)||0); });
    return hours; // 0=Sunday..6=Saturday
  }

  function groupHourCounts(acts) {
    const hours = Array(24).fill(0);
    acts.forEach(a=>{ const h = new Date(a.start_date).getHours(); hours[h]++; });
    return hours;
  }

  const monthlyHours = groupMonthlyHours(currentActs);
  const weekdayHours = groupWeekdayHours(currentActs);
  const hourCounts = groupHourCounts(currentActs);

  // --- Top 5 by effort/suffer_score ---
  function topByEffort(acts, n=5) {
    const withScore = acts.filter(a => a.suffer_score || a.effort || a.trainer_score || a.intensity)
      .map(a => ({ ...a, _score: Number(a.suffer_score||a.effort||a.trainer_score||a.intensity||0) }));
    return withScore.sort((a,b)=> b._score - a._score).slice(0,n);
  }

  const topEfforts = topByEffort(currentActs,5);

  // --- Monthly progress stacked by sport (hours) ---
  function monthlyStack(acts) {
    // produce map: month -> sport -> hours
    const m = {};
    acts.forEach(a=>{
      const d = new Date(a.start_date);
      const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const sport = a.type || a.sport || 'Unknown';
      if (!m[month]) m[month] = {};
      if (!m[month][sport]) m[month][sport] = 0;
      m[month][sport] += utils.secToH(Number(a.moving_time)||0);
    });
    const months = Object.keys(m).sort();
    const sports = Array.from(new Set([].concat(...months.map(month=>Object.keys(m[month])))));
    return { months: months.map(month=>({ month, values: sports.map(s=> m[month][s]||0) })), sports };
  }
  const monthlyStacked = monthlyStack(currentActs);

  // --- Personal bests & special rules ---
  function findPBs(acts) {
    const runningTargets = { "Mile":1609, "5K":5000, "10K":10000, "Half":21097, "Marathon":42195 };
    const swimTargets = { "1K":1000, "2K":2000, "3K":3000 };
    const rideTargets = { "10K":10000, "20K":20000, "30K":30000, "40K":40000, "50K":50000 };

    const res = { running: [], swimming: [], riding: [], longest: null, mostElevation: null, fastest: null };

    const runningActs = acts.filter(a => (a.type||a.sport||'').toLowerCase().includes('run'));
    const swimActs = acts.filter(a => (a.type||a.sport||'').toLowerCase().includes('swim'));
    const rideActs = acts.filter(a => (a.type||a.sport||'').toLowerCase().includes('ride') || (a.type||'').toLowerCase().includes('bike') || (a.type||'').toLowerCase().includes('cycling'));

    function bestForTargets(targets, list, sortKey='moving_time', preferLower=true) {
      const out = [];
      Object.entries(targets).forEach(([name, meters]) => {
        // allow small margin +/- 7%
        const min = meters * 0.93; const max = meters * 1.07;
        const candidates = list.filter(a => { const d = Number(a.distance)||0; return d >= min && d <= max && Number(a.moving_time) > 0; });
        if (candidates.length) {
          candidates.sort((a,b)=> preferLower ? (Number(a[sortKey]) - Number(b[sortKey])) : (Number(b[sortKey]) - Number(a[sortKey])));
          out.push({ name, best: candidates[0], attempts: candidates.length });
        }
      });
      return out;
    }

    res.running = bestForTargets(runningTargets, runningActs, 'moving_time', true);
    res.swimming = bestForTargets(swimTargets, swimActs, 'moving_time', true);
    res.riding = bestForTargets(rideTargets, rideActs, 'moving_time', true);

    // longest, most elevation, fastest (by avg speed)
    const withDist = acts.filter(a=> Number(a.distance) > 0);
    res.longest = withDist.slice().sort((a,b)=> Number(b.distance) - Number(a.distance))[0] || null;
    res.mostElevation = acts.slice().sort((a,b)=> Number(b.total_elevation_gain||0) - Number(a.total_elevation_gain||0))[0] || null;
    res.fastest = acts.slice().filter(a => Number(a.moving_time)>0).sort((a,b)=> ((Number(b.distance)/Number(b.moving_time)) - (Number(a.distance)/Number(a.moving_time))))[0] || null;

    return res;
  }

  const pbs = findPBs(currentActs);

  // --- Solo vs group ---
  const soloCount = currentActs.filter(a => Number(a.athlete_count) === 1).length;
  const soloPct = ((soloCount / currentActs.length) * 100).toFixed(1);

  // --- Average pace & "resistance" detection ---
  const avgPace = (()=>{
    const runs = currentActs.filter(a => (a.type||'').toLowerCase().includes('run') && Number(a.distance)>0 && Number(a.moving_time)>0);
    if (!runs.length) return null;
    const totalSec = utils.sum(runs, 'moving_time');
    const totalKm = utils.sum(runs, 'distance')/1000;
    return totalKm > 0 ? utils.formatPace(totalSec, totalKm) : null;
  })();

  const avgResistance = (()=>{
    // try multiple possible keys
    const keyCandidates = ['average_resistance','avg_resistance','resistance','avg_grade','average_grade'];
    for (const k of keyCandidates) {
      const vals = currentActs.map(a=> a[k]).filter(v=> Number.isFinite(Number(v))).map(Number);
      if (vals.length) return (vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(1);
    }
    return null;
  })();

  // --- Gear / Device usage by hours ---
  function gearUsage(acts) {
    const byGear = {};
    acts.forEach(a=>{
      const gear = a.gear_id || (a.device_name ? a.device_name : 'Unknown');
      if (!byGear[gear]) byGear[gear] = 0;
      byGear[gear] += utils.secToH(Number(a.moving_time)||0);
    });
    return Object.entries(byGear).map(([gear,hours])=>({gear,hours})).sort((a,b)=> b.hours - a.hours);
  }
  const topGears = gearUsage(currentActs).slice(0,6);

  // --- Countries from start_latlng / end_latlng ---
  async function resolveCountries(acts) {
    const map = {};
    for (const a of acts) {
      const coords = (a.start_latlng && a.start_latlng.length===2) ? a.start_latlng : ((a.end_latlng && a.end_latlng.length===2) ? a.end_latlng : null);
      if (!coords) continue;
      let countryName = 'Unknown';
      if (cfg.reverseGeocoder && typeof cfg.reverseGeocoder.getCountry === 'function') {
        try {
          const c = await cfg.reverseGeocoder.getCountry(coords[0], coords[1]);
          countryName = (c && c.name) ? c.name : 'Unknown';
        } catch (e) { countryName = 'Unknown'; }
      } else {
        // If no reverseGeocoder provided, skip heavy network calls to avoid surprises.
        countryName = 'Unknown';
      }
      map[countryName] = (map[countryName]||0) + 1;
    }
    return Object.entries(map).map(([country,count])=>({country,count})).sort((a,b)=> b.count - a.count);
  }

  const countries = await resolveCountries(currentActs);

  // --- Render blocks ---
  // Sport Comparison (ordered by time) with % vs previous year
  function renderSportComparison(sportsCurr, sportsPrev) {
    const prevMap = new Map(sportsPrev.map(s=>[s.sport,s]));
    const totalTime = utils.sum(sportsCurr,'time');
    return `
      <h3>📊 Sport Breakdown (by time)</h3>
      <div style="display: grid; gap: 0.5rem;">
        ${sportsCurr.map(s => {
          const prev = prevMap.get(s.sport) || { time:0, distance:0, elevation:0, count:0 };
          const timeH = (s.time/3600).toFixed(1);
          const distanceKm = (s.distance/1000).toFixed(1);
          const elevation = Math.round(s.elevation);
          const count = s.count;
          const timePct = prev.time? pctChange(s.time, prev.time) : '—';
          const distPct = prev.distance? pctChange(s.distance, prev.distance) : '—';
          const elevPct = prev.elevation? pctChange(s.elevation, prev.elevation) : '—';
          const countPct = prev.count? pctChange(s.count, prev.count) : '—';

          const share = totalTime ? ((s.time/totalTime)*100).toFixed(1) : '0.0';

          return `
            <div style="background:#f8f9fa;padding:0.9rem;border-radius:6px;border-left:4px solid #007bff;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <strong>${s.sport}</strong>
                <span style="color:#666;">${count} activities</span>
              </div>
              <div style="display:flex;gap:1rem;font-size:0.9rem;color:#444;">
                <div>Time: <strong>${timeH}h</strong> <small style="color:#666;">(${timePct})</small></div>
                <div>Distance: <strong>${distanceKm} km</strong> <small style="color:#666;">(${distPct})</small></div>
                <div>Elev: <strong>${elevation} m</strong> <small style="color:#666;">(${elevPct})</small></div>
                <div>Count: <strong>${count}</strong> <small style="color:#666;">(${countPct})</small></div>
                <div style="margin-left:auto;color:#999;">Share: ${share}%</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Mini storytelling for histograms
  function renderHistograms(monthlyHours, weekdayHours, hourCounts) {
    const peakMonth = monthlyHours.length ? monthlyHours.reduce((a,b)=> a.hours>b.hours? a:b) : null;
    const peakDayIndex = weekdayHours.indexOf(Math.max(...weekdayHours));
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // month bars simple
    const maxMonth = monthlyHours.length ? Math.max(...monthlyHours.map(m=>m.hours)) : 0;
    const monthBars = monthlyHours.map(m=>{
      const pct = maxMonth? Math.round((m.hours/maxMonth)*100) : 0;
      const label = new Date(m.month + '-01').toLocaleString(undefined,{month:'short', year:'numeric'});
      return `<div style="display:flex;align-items:center;gap:0.6rem;"><div style="width:120px;font-size:0.9rem;color:#333;">${label}</div><div style="flex:1;background:#e9ecef;border-radius:6px;overflow:hidden;"><div style="width:${pct}%;height:14px;background:linear-gradient(90deg,#007bff,#0056b3);"></div></div><div style="width:70px;text-align:right;font-size:0.9rem;color:#666;">${m.hours.toFixed(1)}h</div></div>`;
    }).join('');

    // weekday labels
    const wkNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const maxW = Math.max(...weekdayHours);
    const weekdayBars = weekdayHours.map((h,i)=>{
      const pct = maxW? Math.round((h/maxW)*100):0; return `<div style="display:flex;align-items:center;gap:0.6rem;"><div style="width:60px;font-size:0.9rem;color:#333;">${wkNames[i]}</div><div style="flex:1;background:#e9ecef;border-radius:6px;overflow:hidden;"><div style="width:${pct}%;height:12px;background:#28a745"></div></div><div style="width:50px;text-align:right;font-size:0.9rem;color:#666;">${h.toFixed(1)}h</div></div>`; }).join('');

    const hourBars = hourCounts.map((c,h)=>{
      return `<div style="text-align:center;font-size:0.8rem;color:#666;">${h}<div style="height:40px;margin-top:6px;display:flex;align-items:flex-end;justify-content:center;"><div style="width:18px;height:${Math.max(c,1)*6}px;background:${c>0? '#007bff':'#e9ecef'};border-radius:4px 4px 0 0"></div></div><div style="font-size:0.75rem;color:#999;margin-top:4px;">${h}:00</div></div>`; }).join('');

    const story = `Most active month: ${peakMonth ? (new Date(peakMonth.month+'-01').toLocaleString(undefined,{month:'long',year:'numeric'}) + ' — ' + peakMonth.hours.toFixed(1)+'h') : 'N/A'}. Most frequent day: ${wkNames[peakDayIndex] || 'N/A'}. Typical start hour: ${peakHour || 'N/A'}:00.`;

    return `
      <h3>📈 Temporal Histograms</h3>
      <p style="color:#666;">${story}</p>
      <div style="display:grid;grid-template-columns:1fr;gap:0.6rem;margin-bottom:0.6rem;">${monthBars}</div>
      <div style="display:grid;grid-template-columns:1fr;gap:0.4rem;margin-top:0.6rem;">${weekdayBars}</div>
      <div style="margin-top:1rem;padding:0.6rem;background:#f8f9fa;border-radius:6px;overflow:auto;white-space:nowrap;">${hourBars}</div>
    `;
  }

  // Top efforts render
  function renderTopEfforts(topEfforts) {
    if (!topEfforts || !topEfforts.length) return '<p>No effort/suffer data available.</p>';
    return `
      <h3>💀 Top ${topEfforts.length} Effort Activities</h3>
      <div style="display:grid;gap:0.6rem;">
        ${topEfforts.map(a=>{
          const score = a.suffer_score || a.effort || a.trainer_score || a.intensity || a._score;
          return `<div style="background:#fff;padding:0.8rem;border-radius:6px;display:flex;justify-content:space-between;align-items:center;"><div><strong>${a.name||'Untitled'}</strong><div style="font-size:0.9rem;color:#666;">${a.type || a.sport} • ${utils.formatTime(Number(a.moving_time)||0)} • ${utils.formatDistance(Number(a.distance)||0)}</div></div><div style="text-align:right;color:#d9534f;font-weight:bold;">${score}</div></div>`;
        }).join('')}
      </div>
    `;
  }

  // Monthly progress hybrid (stacked + line total)
  function renderMonthlyHybrid(monthlyStacked) {
    const months = monthlyStacked.months;
    const sports = monthlyStacked.sports;
    const totals = months.map(m=> m.values.reduce((s,v)=>s+v,0));
    const maxTotal = Math.max(...totals,1);

    return `
      <h3>📆 Monthly Progress (stacked hours)</h3>
      <div style="display:grid;gap:0.6rem;">
        ${months.map((m,idx)=>{
          const monthLabel = new Date(m.month+'-01').toLocaleString(undefined,{month:'short',year:'numeric'});
          const parts = m.values.map(v=> Math.round((v/maxTotal)*100));
          // small stacked bar rendering
          let inner = '';
          parts.forEach((p,i)=>{ if (p>0) inner += `<div title="${sports[i]}: ${((m.values[i])||0).toFixed(1)}h" style="display:inline-block;height:14px;width:${p}%;background:linear-gradient(90deg,#007bff,#28a745);"></div>`; });
          return `<div style="display:flex;align-items:center;gap:0.6rem;"><div style="width:110px;font-size:0.9rem;">${monthLabel}</div><div style="flex:1;background:#e9ecef;border-radius:6px;overflow:hidden;">${inner}</div><div style="width:70px;text-align:right;font-size:0.9rem;color:#666;">${totals[idx].toFixed(1)}h</div></div>`;
        }).join('')}
      </div>
    `;
  }

  // Personal bests render
  function renderPersonalBests(pbs) {
    function actSummary(a) { if (!a) return 'N/A'; return `${a.name||'Untitled'} • ${utils.formatDistance(Number(a.distance)||0)} • ${utils.formatTime(Number(a.moving_time)||0)}`; }
    return `
      <h3>🏆 Personal Bests & Notables</h3>
      <div style="display:grid;gap:0.6rem;">
        <div style="background:#fff8e1;padding:0.8rem;border-radius:6px;">
          <strong>Running PBs</strong>
          <div style="margin-top:0.4rem;">${pbs.running.length? pbs.running.map(r=>`<div>${r.name}: <strong>${utils.formatTime(r.best.moving_time)}</strong> • ${new Date(r.best.start_date).toLocaleDateString()} (${r.attempts} attempts)</div>`).join('') : '<div>No running PBs found</div>'}</div>
        </div>
        <div style="background:#e8f7ff;padding:0.8rem;border-radius:6px;">
          <strong>Swimming Highlights</strong>
          <div style="margin-top:0.4rem;">${pbs.swimming.length? pbs.swimming.map(r=>`<div>${r.name}: ${actSummary(r.best)}</div>`).join('') : '<div>No swims found</div>'}</div>
        </div>
        <div style="background:#fff0f6;padding:0.8rem;border-radius:6px;">
          <strong>Riding Highlights</strong>
          <div style="margin-top:0.4rem;">${pbs.riding.length? pbs.riding.map(r=>`<div>${r.name}: ${actSummary(r.best)}</div>`).join('') : '<div>No rides found</div>'}</div>
        </div>
        <div style="background:#f8f9fa;padding:0.8rem;border-radius:6px;">
          <div>Longest: ${pbs.longest? actSummary(pbs.longest): 'N/A'}</div>
          <div>Most elevation: ${pbs.mostElevation? actSummary(pbs.mostElevation): 'N/A'}</div>
          <div>Fastest: ${pbs.fastest? actSummary(pbs.fastest): 'N/A'}</div>
        </div>
      </div>
    `;
  }

  function renderGears(gears) {
    if (!gears.length) return '<p>No gear/device data available.</p>';
    return `
      <h3>⚙️ Gear & Device Usage (hours)</h3>
      <div style="display:grid;gap:0.4rem;">
        ${gears.map(g=> `<div style="display:flex;justify-content:space-between;padding:0.6rem;background:#f8f9fa;border-radius:6px;"><div>${g.gear}</div><div style="color:#666;">${g.hours.toFixed(1)}h</div></div>`).join('')}
      </div>
    `;
  }

  function renderCountries(countries) {
    if (!countries.length) return '<p>No geolocation data (or reverseGeocoder not provided).</p>';
    return `
      <h3>🌍 Countries</h3>
      <div style="display:grid;gap:0.4rem;">
        ${countries.map(c=> `<div style="display:flex;justify-content:space-between;padding:0.6rem;background:#fff;border-radius:6px;"><div>${c.country}</div><div style="color:#666">${c.count}</div></div>`).join('')}
      </div>
    `;
  }

  // Summary top line
  const summaryTotals = {
    total: currentActs.length,
    distance: utils.sum(currentActs,'distance'),
    time: utils.sum(currentActs,'moving_time'),
    elevation: utils.sum(currentActs,'total_elevation_gain')
  };

  const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1rem;">
      <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:8px;"><div style="font-size:1.6rem;font-weight:bold">${summaryTotals.total}</div><div style="color:#666">Activities (${currentYear})</div></div>
      <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:8px;"><div style="font-size:1.6rem;font-weight:bold">${utils.formatDistance(summaryTotals.distance)}</div><div style="color:#666">Total Distance</div></div>
      <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:8px;"><div style="font-size:1.6rem;font-weight:bold">${utils.formatTime(summaryTotals.time)}</div><div style="color:#666">Total Time</div></div>
      <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:8px;"><div style="font-size:1.6rem;font-weight:bold">${utils.formatDistance(summaryTotals.elevation)}</div><div style="color:#666">Elevation Gain</div></div>
    </div>
    <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;"><div style="padding:0.6rem;background:#fff;border-radius:8px;">Solo: <strong>${soloPct}%</strong></div><div style="padding:0.6rem;background:#fff;border-radius:8px;">Avg pace (runs): <strong>${avgPace||'N/A'}</strong></div><div style="padding:0.6rem;background:#fff;border-radius:8px;">Avg resistance: <strong>${avgResistance||'N/A'}</strong></div></div>
  `;

  // Insert into DOM
  document.getElementById(cfg.containerIds.summary).innerHTML = summaryHtml;
  document.getElementById(cfg.containerIds.sportComparison).innerHTML = renderSportComparison(sportsCurrent, sportsPrev);
  document.getElementById(cfg.containerIds.temporalStats).innerHTML = renderHistograms(monthlyHours, weekdayHours, hourCounts) + renderMonthlyHybrid(monthlyStacked);
  document.getElementById(cfg.containerIds.motivation).innerHTML = renderTopEfforts(topEfforts);
  document.getElementById(cfg.containerIds.personalBests).innerHTML = renderPersonalBests(pbs);
  document.getElementById(cfg.containerIds.extremeStats).innerHTML = renderGears(topGears) + renderCountries(countries);
  document.getElementById(cfg.containerIds.allActivities).innerHTML = renderActivitiesTable(currentActs);

  // Activities table (simpler)
  function renderActivitiesTable(activities) {
    const sorted = activities.slice().sort((a,b)=> new Date(b.start_date)-new Date(a.start_date));
    const rows = sorted.map(a=>{
      const pace = (Number(a.distance)>0 && Number(a.moving_time)>0 && (a.type||'').toLowerCase().includes('run')) ? utils.formatPace(Number(a.moving_time), Number(a.distance)/1000) : '-';
      return `<tr style="background:${sorted.indexOf(a)%2===0? '#fff':'#f8f9fa'};"><td style="padding:0.6rem;border-bottom:1px solid #e9ecef">${new Date(a.start_date).toLocaleDateString()}</td><td style="padding:0.6rem;border-bottom:1px solid #e9ecef">${a.name||'Untitled'}</td><td style="padding:0.6rem;border-bottom:1px solid #e9ecef">${a.type||a.sport||'Unknown'}</td><td style="padding:0.6rem;border-bottom:1px solid #e9ecef">${utils.formatDistance(Number(a.distance)||0)}</td><td style="padding:0.6rem;border-bottom:1px solid #e9ecef">${utils.formatTime(Number(a.moving_time)||0)}</td><td style="padding:0.6rem;border-bottom:1px solid #e9ecef">${pace}</td><td style="padding:0.6rem;border-bottom:1px solid #e9ecef"><a href="activity.html?id=${a.id}" target="_blank" style="background:#007bff;color:#fff;padding:0.35rem 0.7rem;border-radius:4px;text-decoration:none;font-size:0.85rem;">View</a></td></tr>`;
    }).join('');
    return `<h3>📋 All Activities</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8f9fa;text-align:left"><th style="padding:0.6rem">Date</th><th style="padding:0.6rem">Name</th><th style="padding:0.6rem">Sport</th><th style="padding:0.6rem">Distance</th><th style="padding:0.6rem">Time</th><th style="padding:0.6rem">Pace</th><th style="padding:0.6rem">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // Done
}
