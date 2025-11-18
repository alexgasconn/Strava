// wrapped-stats-pro.js

export async function renderWrappedTab(allActivities, options = {}) {
  const fullActivities = options.fullActivities || allActivities; // lista completa

  const cfg = {
    containerIds: {
      summary: 'wrapped-summary',
      personalBests: 'wrapped-personal-bests',
      sportComparison: 'wrapped-sport-comparison',
      temporalStats: 'wrapped-temporal-stats',
      motivation: 'wrapped-motivation', // Hardest Workouts
      extremeStats: 'wrapped-extreme-stats', // Gear & Countries
      allActivities: 'wrapped-all-activities',
      heatmap: 'wrapped-heatmap', // Global Heatmap
      ...options.containerIds
    },
    // Allows custom geocoder. If null, Nominatim is used (but tries to get English country names).
    reverseGeocoder: options.reverseGeocoder || null
  };

  if (!allActivities || allActivities.length === 0) {
    document.getElementById(cfg.containerIds.summary).innerHTML = `
      <div style="text-align:center;padding:3rem;color:#666;">
        <div style="font-size:3rem;margin-bottom:1rem;">📊</div>
        <h3>No activity data available</h3>
        <p>Start tracking your workouts to see your stats here!</p>
      </div>`;
    return;
  }

  // === UTILITIES ===
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
    formatDistance(m) {
      return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
    },
    formatPace(seconds, km) {
      if (!isFinite(seconds) || !isFinite(km) || km <= 0) return 'N/A';
      const pace = seconds / km;
      const min = Math.floor(pace / 60);
      const sec = Math.round(pace % 60);
      return `${min}:${String(sec).padStart(2, '0')} /km`;
    },
    sum(arr, key) {
      return arr.reduce((s, a) => s + (Number(a[key]) || 0), 0);
    },
    // Simple helper to get English country name, might not be exhaustive
    getEnglishCountryName: (countryName) => {
      const countryMap = {
        'España': 'Spain',
        'Francia': 'France',
        'Alemania': 'Germany',
        'Italia': 'Italy',
        'Reino Unido': 'United Kingdom',
        'Estados Unidos': 'United States',
        'Canadá': 'Canada',
        'Australia': 'Australia',
        'Suiza': 'Switzerland',
        'Japón': 'Japan',
        // Add more as needed
      };
      return countryMap[countryName] || countryName;
    }
  };

  // === DATA PROCESSING ===

  // Extract years from activities
  const getYear = dateStr => new Date(dateStr).getFullYear();
  const years = Array.from(new Set(allActivities.map(a => getYear(a.start_date)))).sort((a, b) => b - a);

  // Determine which year to display
  const displayYear = options.selectedYear || years[0];
  const prevYear = years[years.indexOf(displayYear) + 1] || null;

  // Populate year dropdown
  const yearSelect = document.getElementById('wrapped-year');
  if (yearSelect) {
    yearSelect.innerHTML = years
      .map(y => `<option value="${y}" ${y === displayYear ? 'selected' : ''}>${y}</option>`)
      .join('');
    yearSelect.onchange = () => {
      const selectedYear = parseInt(yearSelect.value);
      renderWrappedTab(fullActivities, { selectedYear, fullActivities });
    };
  }

  // Get activities for current and previous year
  function activitiesByYear(year) {
    return fullActivities.filter(a => new Date(a.start_date).getFullYear() === year);
  }
  const currentActs = activitiesByYear(displayYear);
  const prevActs = prevYear ? activitiesByYear(prevYear) : [];

  // Sport aggregation
  function compileSports(acts) {
    const bySport = {};
    acts.forEach(a => {
      const type = a.type || a.sport || 'Unknown';
      if (!bySport[type]) bySport[type] = { activities: [], distance: 0, time: 0, elevation: 0 };
      bySport[type].activities.push(a);
      bySport[type].distance += Number(a.distance) || 0;
      bySport[type].time += Number(a.moving_time) || 0;
      bySport[type].elevation += Number(a.total_elevation_gain) || 0;
    });
    return Object.entries(bySport)
      .map(([sport, data]) => ({ sport, ...data, count: data.activities.length }))
      .sort((a, b) => b.time - a.time);
  }

  const sportsCurrent = compileSports(currentActs);
  const sportsPrev = compileSports(prevActs);

  function pctChange(curr, prev) {
    if (!prev || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }

  // Temporal groupings
  function groupMonthlyHours(acts) {
    const map = {};
    acts.forEach(a => {
      const d = new Date(a.start_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = 0;
      map[key] += utils.secToH(Number(a.moving_time) || 0);
    });
    return Object.entries(map)
      .map(([month, hours]) => ({ month, hours }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  function groupWeekdayHours(acts) {
    const hours = [0, 0, 0, 0, 0, 0, 0];
    acts.forEach(a => {
      const d = new Date(a.start_date);
      hours[d.getDay()] += utils.secToH(Number(a.moving_time) || 0);
    });
    return hours;
  }

  function groupHourCounts(acts) {
    const hours = Array(24).fill(0);
    acts.forEach(a => {
      const h = new Date(a.start_date).getHours();
      hours[h]++;
    });
    return hours;
  }

  const monthlyHours = groupMonthlyHours(currentActs);
  const weekdayHours = groupWeekdayHours(currentActs);
  const hourCounts = groupHourCounts(currentActs);

  // Top efforts (now 10 activities)
  function topByEffort(acts, n = 10) { // Changed default to 10
    const withScore = acts
      .filter(a => a.suffer_score || a.effort || a.trainer_score || a.intensity)
      .map(a => ({
        ...a,
        _score: Number(a.suffer_score || a.effort || a.trainer_score || a.intensity || 0)
      }));
    return withScore.sort((a, b) => b._score - a._score).slice(0, n);
  }

  const topEfforts = topByEffort(currentActs, 10); // Ensure 10 are taken

  // Personal bests
  function findPBs(acts) {
    const runningTargets = { "Mile": 1609, "5K": 5000, "10K": 10000, "Half Marathon": 21097, "Marathon": 42195 };
    const swimTargets = { "1K": 1000, "2K": 2000, "3K": 3000 };
    const rideTargets = { "10K": 10000, "20K": 20000, "30K": 30000, "40K": 40000, "50K": 50000 };

    const res = {
      running: [],
      swimming: [],
      riding: [],
      longest: null,
      mostElevation: null,
      fastest: null
    };

    const runningActs = acts.filter(a => (a.type || a.sport || '').toLowerCase().includes('run'));
    const swimActs = acts.filter(a => (a.type || a.sport || '').toLowerCase().includes('swim'));
    const rideActs = acts.filter(a => {
      const t = (a.type || '').toLowerCase();
      return t.includes('ride') || t.includes('bike') || t.includes('cycling');
    });

    function bestForTargets(targets, list) {
      const out = [];
      Object.entries(targets).forEach(([name, meters]) => {
        const min = meters * 0.93;
        const max = meters * 1.07;
        const candidates = list.filter(a => {
          const d = Number(a.distance) || 0;
          return d >= min && d <= max && Number(a.moving_time) > 0;
        });
        if (candidates.length) {
          candidates.sort((a, b) => Number(a.moving_time) - Number(b.moving_time));
          out.push({ name, best: candidates[0], attempts: candidates.length });
        }
      });
      return out;
    }

    res.running = bestForTargets(runningTargets, runningActs);
    res.swimming = bestForTargets(swimTargets, swimActs);
    res.riding = bestForTargets(rideTargets, rideActs);

    const withDist = acts.filter(a => Number(a.distance) > 0);
    res.longest = withDist.slice().sort((a, b) => Number(b.distance) - Number(a.distance))[0] || null;
    res.mostElevation = acts.slice().sort((a, b) => Number(b.total_elevation_gain || 0) - Number(a.total_elevation_gain || 0))[0] || null;
    res.fastest = acts.slice()
      .filter(a => Number(a.moving_time) > 0)
      .sort((a, b) => ((Number(b.distance) / Number(b.moving_time)) - (Number(a.distance) / Number(a.moving_time))))[0] || null;

    return res;
  }

  const pbs = findPBs(currentActs);

  // Stats
  const soloCount = currentActs.filter(a => Number(a.athlete_count) === 1).length;
  const soloPct = ((soloCount / currentActs.length) * 100).toFixed(1);

  const avgPace = (() => {
    const runs = currentActs.filter(a =>
      (a.type || '').toLowerCase().includes('run') &&
      Number(a.distance) > 0 &&
      Number(a.moving_time) > 0
    );
    if (!runs.length) return null;
    const totalSec = utils.sum(runs, 'moving_time');
    const totalKm = utils.sum(runs, 'distance') / 1000;
    return totalKm > 0 ? utils.formatPace(totalSec, totalKm) : null;
  })();

  // Gear usage
  function gearUsage(acts) {
    const byGear = {};
    acts.forEach(a => {
      const gear = a.gear_id || (a.device_name ? a.device_name : 'Unknown');
      if (!byGear[gear]) byGear[gear] = 0;
      byGear[gear] += utils.secToH(Number(a.moving_time) || 0);
    });
    return Object.entries(byGear)
      .map(([gear, hours]) => ({ gear, hours }))
      .sort((a, b) => b.hours - a.hours);
  }
  const topGears = gearUsage(currentActs).slice(0, 6);

  // Countries (now resolves to English names)
  async function resolveCountries(acts) {
    const map = {};
    const cache = {}; // Cache for geocoding results

    // Round coordinates to group nearby locations (~40 km for 0.5 degree)
    const round = (v) => Math.round(v / 5) * 0.5;

    const uniqueCoords = {};
    const coordCounts = {}; // How many activities map to each rounded coordinate group

    for (const a of acts) {
      const coords = (a.start_latlng && a.start_latlng.length === 2)
        ? a.start_latlng
        : ((a.end_latlng && a.end_latlng.length === 2) ? a.end_latlng : null);
      if (!coords) continue;
      const key = `${round(coords[0])},${round(coords[1])}`;

      uniqueCoords[key] = coords;
      coordCounts[key] = (coordCounts[key] || 0) + 1;
    }

    const coordKeys = Object.keys(uniqueCoords);
    console.log(`Unique coordinate groups for country resolution: ${coordKeys.length}`);

    const concurrency = 5; // Number of parallel geocoding requests
    const chunks = [];
    for (let i = 0; i < coordKeys.length; i += concurrency) {
      chunks.push(coordKeys.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (key) => {
        const [lat, lon] = uniqueCoords[key];
        let country = 'Unknown';

        if (cache[key]) {
          country = cache[key];
        } else if (cfg.reverseGeocoder) {
          try {
            // Use provided reverse geocoder
            country = await cfg.reverseGeocoder(lat, lon);
          } catch (e) {
            console.error("Custom reverse geocoder failed:", e);
            country = 'Unknown';
          }
        } else {
          // Fallback to Nominatim (default)
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`, // Request English
              { headers: { 'User-Agent': 'FastCountryResolver/1.0' } }
            );
            if (res.ok) {
              const data = await res.json();
              country = data.address?.country || 'Unknown';
              country = utils.getEnglishCountryName(country); // Attempt to standardize
            }
          } catch (_) {
            country = 'Unknown';
          }
        }
        cache[key] = country;
        map[country] = (map[country] || 0) + coordCounts[key];
      }));
    }

    return Object.entries(map)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  }

  const countries = await resolveCountries(currentActs);
  console.log('Resolved Countries:', countries);

  // === RENDER COMPONENTS ===

  // Summary cards
  const summaryTotals = {
    total: currentActs.length,
    distance: utils.sum(currentActs, 'distance'),
    time: utils.sum(currentActs, 'moving_time'),
    elevation: utils.sum(currentActs, 'total_elevation_gain')
  };

  const summaryHtml = `
    <div class="stats-year-header">
      <h2>${displayYear} Wrapped</h2>
      <p>Your year in fitness</p>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card fade-in-up" style="animation-delay: 0.1s">
        <div class="stat-icon">🎯</div>
        <div class="stat-value">${summaryTotals.total}</div>
        <div class="stat-label">Activities</div>
      </div>
      
      <div class="stat-card fade-in-up" style="animation-delay: 0.2s">
        <div class="stat-icon">📍</div>
        <div class="stat-value">${utils.formatDistance(summaryTotals.distance)}</div>
        <div class="stat-label">Total Distance</div>
      </div>
      
      <div class="stat-card fade-in-up" style="animation-delay: 0.3s">
        <div class="stat-icon">⏱️</div>
        <div class="stat-value">${utils.formatTime(summaryTotals.time)}</div>
        <div class="stat-label">Total Time</div>
      </div>
      
      <div class="stat-card fade-in-up" style="animation-delay: 0.4s">
        <div class="stat-icon">⛰️</div>
        <div class="stat-value">${utils.formatDistance(summaryTotals.elevation)}</div>
        <div class="stat-label">Elevation Gain</div>
      </div>
    </div>

    <div class="quick-stats fade-in-up" style="animation-delay: 0.5s">
      <div class="quick-stat-item">
        <span class="quick-stat-label">Solo workouts</span>
        <span class="quick-stat-value">${soloPct}%</span>
      </div>
      ${avgPace ? `
        <div class="quick-stat-item">
          <span class="quick-stat-label">Avg pace (runs)</span>
          <span class="quick-stat-value">${avgPace}</span>
        </div>
      ` : ''}
    </div>
  `;

  // Sport comparison with minimum 5h filter
  function renderSportComparison(sportsCurr, sportsPrev) {
    const prevMap = new Map(sportsPrev.map(s => [s.sport, s]));
    const totalTime = utils.sum(sportsCurr, 'time');

    const sportIcons = {
      'Run': '🏃', 'Running': '🏃', 'Ride': '🚴', 'Cycling': '🚴',
      'Swim': '🏊', 'Swimming': '🏊', 'Walk': '🚶', 'Hike': '🥾',
      'Workout': '💪', 'WeightTraining': '🏋️', 'Yoga': '🧘',
      'Rowing': '🚣', 'Elliptical': '🚴‍♂️', 'Ski': '🎿',
      'Snowboard': '🏂', 'Other': '🎯', 'AlpineSki': '⛷️', 'Canoeing': '🛶',
      'Crossfit': '💪', 'Kayaking': '🛶', 'MountainBikeRide': '🚵',
      'RockClimbing': '🧗', 'RollerSkating': '⛸️', 'Snowshoe': '🥾',
      'StandUpPaddling': '🏄‍♀️', 'Surfing': '🏄', 'VirtualRide': '🚴',
      'VirtualRun': '🏃', 'Windsurf': '⛵'
    };

    // Filter sports with at least 5h
    const sportsToShow = sportsCurr.filter(s => s.time >= 5 * 3600);

    return `
  <div class="section-header">
    <h3>📊 Sport Breakdown</h3>
    <p class="section-subtitle">Ranked by total time</p>
  </div>
  
  <div class="sport-breakdown">
    ${sportsToShow.map((s, idx) => {
      const prev = prevMap.get(s.sport) || { time: 0, distance: 0, elevation: 0, count: 0 };
      const timeH = (s.time / 3600).toFixed(1);
      const distanceKm = (s.distance / 1000).toFixed(1);
      const elevation = Math.round(s.elevation);
      const timePct = pctChange(s.time, prev.time);
      const share = totalTime ? ((s.time / totalTime) * 100).toFixed(1) : '0.0';

      const icon = sportIcons[s.sport] || '🎯';
      const trendColor = timePct === null ? '#999' : (timePct > 0 ? '#10b981' : '#ef4444');
      const trendSymbol = timePct === null ? '' : (timePct > 0 ? '↑' : '↓');

      return `
        <div class="sport-card fade-in-up" style="animation-delay: ${0.1 * (idx + 1)}s">
          <div class="sport-card-header">
            <div class="sport-icon">${icon}</div>
            <div class="sport-title">
              <h4>${s.sport}</h4>
              <span class="sport-count">${s.count} activities</span>
            </div>
            <div class="sport-share">${share}%</div>
          </div>
          
          <div class="sport-metrics">
            <div class="metric">
              <div class="metric-label">Time</div>
              <div class="metric-value">${timeH}h</div>
              ${timePct !== null ? `
                <div class="metric-change" style="color: ${trendColor}">
                  ${trendSymbol} ${Math.abs(timePct).toFixed(1)}%
                </div>
              ` : ''}
            </div>
            
            <div class="metric">
              <div class="metric-label">Distance</div>
              <div class="metric-value">${distanceKm} km</div>
            </div>
            
            <div class="metric">
              <div class="metric-label">Elevation</div>
              <div class="metric-value">${elevation} m</div>
            </div>
          </div>
          
          <div class="sport-progress">
            <div class="sport-progress-bar" style="width: ${share}%"></div>
          </div>
        </div>
      `;
    }).join('')}
  </div>
  `;
  }

  // Temporal stats - Combined and more compact
  function renderHistograms(monthlyHours, weekdayHours, hourCounts) {
    const peakMonth = monthlyHours.length ?
      monthlyHours.reduce((a, b) => a.hours > b.hours ? a : b) : null;
    const peakDayIndex = weekdayHours.indexOf(Math.max(...weekdayHours));

    const wkNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxMonth = monthlyHours.length ? Math.max(...monthlyHours.map(m => m.hours)) : 0;
    const maxW = Math.max(...weekdayHours);

    // --- Monthly Bars ---
    const monthBars = monthlyHours.map((m, idx) => {
      const pct = maxMonth ? (m.hours / maxMonth) * 100 : 0;
      const label = new Date(m.month + '-01').toLocaleString(undefined, { month: 'short' });
      return `
      <div class="chart-row fade-in-up" style="animation-delay: ${0.05 * idx}s">
        <div class="chart-label-sm">${label}</div>
        <div class="chart-bar-container chart-bar-container-sm">
          <div class="chart-bar" style="width: ${pct}%"></div>
        </div>
        <span class="chart-value-sm">${m.hours.toFixed(1)}h</span>
      </div>
    `;
    }).join('');

    // --- Weekly Bars (horizontal layout) ---
    const weekdayBars = weekdayHours.map((h, i) => {
      const pct = maxW ? (h / maxW) * 100 : 0;
      return `
      <div class="chart-row fade-in-up" style="animation-delay: ${0.05 * i}s; align-items: center;">
      <div class="chart-label-sm" style="width:72px;text-align:left;padding-right:8px">${wkNames[i]}</div>
      <div class="chart-bar-container chart-bar-container-sm" style="flex:1;display:flex;align-items:center">
        <div class="chart-bar" style="width: ${pct}%;height:14px;border-radius:8px"></div>
      </div>
      <span class="chart-value-sm" style="width:54px;text-align:right;margin-left:8px">${h.toFixed(1)}h</span>
      </div>
    `;
    }).join('');

    // --- Time of Day Bars (6 segments) ---
    const timeRanges = [
      { label: 'Night', start: 0, end: 5 },
      { label: 'Morning', start: 6, end: 9 },
      { label: 'Midday', start: 10, end: 13 },
      { label: 'Afternoon', start: 14, end: 17 },
      { label: 'Evening', start: 18, end: 21 },
      { label: 'Late Night', start: 22, end: 23 },
    ];

    const momentCounts = timeRanges.map(r => {
      const total = hourCounts
        .map((c, h) => (h >= r.start && h <= r.end ? c : 0))
        .reduce((a, b) => a + b, 0);
      return { label: r.label, count: total };
    });

    const maxMoment = Math.max(...momentCounts.map(m => m.count));

    // Build horizontal bars (like monthly/weekly) instead of vertical compact bars
    const momentBars = momentCounts.map((m, i) => {
      const pct = maxMoment ? (m.count / maxMoment) * 100 : 0;
      return `
      <div class="chart-row fade-in-up" style="animation-delay: ${0.03 * i}s; align-items: center;">
        <div class="chart-label-sm" style="width:100px;text-align:left;padding-right:8px">${m.label}</div>
        <div class="chart-bar-container chart-bar-container-sm" style="flex:1;display:flex;align-items:center">
          <div class="chart-bar" style="width: ${pct}%;height:14px;border-radius:8px"></div>
        </div>
        <span class="chart-value-sm" style="width:54px;text-align:right;margin-left:8px">${m.count}</span>
      </div>
    `;
    }).join('');

    // --- Peak Hour (originally by exact hour, optional keep) ---
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    return `
    <div class="section-header">
      <h3>📈 Activity Patterns</h3>
      <p class="section-subtitle">When you train best, by month, week & time of day</p>
    </div>
    
    <div class="insights-grid">
      <div class="insight-card">
        <div class="insight-icon">📅</div>
        <div class="insight-content">
          <div class="insight-label">Peak Month</div>
          <div class="insight-value">
            ${peakMonth ? new Date(peakMonth.month + '-01').toLocaleString(undefined, { month: 'long', year: 'numeric' }) : 'N/A'}
          </div>
          ${peakMonth ? `<div class="insight-detail">${peakMonth.hours.toFixed(1)} hours</div>` : ''}
        </div>
      </div>
      
      <div class="insight-card">
        <div class="insight-icon">📆</div>
        <div class="insight-content">
          <div class="insight-label">Favorite Day</div>
          <div class="insight-value">${wkNames[peakDayIndex]}</div>
        </div>
      </div>
      
      <div class="insight-card">
        <div class="insight-icon">🕐</div>
        <div class="insight-content">
          <div class="insight-label">Peak Hour</div>
          <div class="insight-value">${peakHour}:00</div>
        </div>
      </div>
    </div>

    <div class="temporal-charts-combined">
      <div class="chart-section chart-section-monthly">
        <h4 class="chart-title-sm">Monthly Activity (hours)</h4>
        <div class="chart-container-compact">${monthBars}</div>
      </div>

      <div class="chart-section chart-section-weekly">
        <h4 class="chart-title-sm">Weekly Pattern</h4>
        <div class="chart-container-compact">${weekdayBars}</div>
      </div>

      <div class="chart-section chart-section-hourly">
        <h4 class="chart-title-sm">Time of Day Distribution</h4>
        <div class="chart-container-compact">${momentBars}</div>
      </div>
    </div>
  `;
  }


  // Top efforts (more compact cards for 10 items)
  function renderTopEfforts(topEfforts) {
    if (!topEfforts || !topEfforts.length) {
      return '<div class="empty-state">No effort data available</div>';
    }

    return `
      <div class="section-header">
        <h3>🔥 Hardest Workouts</h3>
        <p class="section-subtitle">Your 10 most intense sessions</p>
      </div>
      
      <div class="efforts-list efforts-list-compact">
        ${topEfforts.map((a, idx) => {
      const score = a._score;
      const maxScore = topEfforts[0]._score;
      const scoreWidth = (maxScore > 0) ? (score / maxScore) * 100 : 0;

      return `
            <div class="effort-card effort-card-compact fade-in-up" style="animation-delay: ${0.05 * idx}s">
              <div class="effort-rank">#${idx + 1}</div>
              <div class="effort-content-compact">
                <h4 class="effort-title-compact">${a.name || 'Untitled'}</h4>
                <div class="effort-meta-compact">
                  ${a.type || a.sport} • ${utils.formatTime(Number(a.moving_time) || 0)}
                </div>
                <div class="effort-score-bar-compact">
                  <div class="effort-score-fill-compact" style="width: ${scoreWidth}%"></div>
                </div>
              </div>
              <div class="effort-score-compact">${Math.round(score)}</div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  }

  // Personal bests
  function renderPersonalBests(pbs) {
    function actSummary(a) {
      if (!a) return 'N/A';
      const date = new Date(a.start_date).toLocaleDateString();
      return `
        <div class="pb-activity">
          <strong>${a.name || 'Untitled'}</strong>
          <div class="pb-details">
            ${utils.formatTime(Number(a.moving_time) || 0)} • ${utils.formatDistance(Number(a.distance) || 0)}
          </div>
          <div class="pb-date">${date}</div>
        </div>
      `;
    }

    // Determine if there are any PBs to show for a category
    const hasRunningPBs = pbs.running.length > 0;
    const hasSwimmingPBs = pbs.swimming.length > 0;
    const hasRidingPBs = pbs.riding.length > 0;
    const hasHighlights = pbs.longest || pbs.mostElevation || pbs.fastest;

    if (!hasRunningPBs && !hasSwimmingPBs && !hasRidingPBs && !hasHighlights) {
      return '<div class="empty-state">No personal bests recorded for this year.</div>';
    }

    return `
      <div class="section-header">
        <h3>🏆 Personal Records</h3>
        <p class="section-subtitle">Your best performances</p>
      </div>
      
      <div class="pb-grid">
        ${hasRunningPBs ? `
          <div class="pb-category fade-in-up" style="animation-delay: 0.1s">
            <div class="pb-category-header">
              <span class="pb-icon">🏃</span>
              <h4>Running</h4>
            </div>
            ${pbs.running.map(r => `
              <div class="pb-item">
                <div class="pb-distance">${r.name}</div>
                <div class="pb-time">${utils.formatTime(r.best.moving_time)}</div>
                <div class="pb-attempts">${r.attempts} attempt${r.attempts > 1 ? 's' : ''}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${hasSwimmingPBs ? `
          <div class="pb-category fade-in-up" style="animation-delay: 0.2s">
            <div class="pb-category-header">
              <span class="pb-icon">🏊</span>
              <h4>Swimming</h4>
            </div>
            ${pbs.swimming.map(r => `
              <div class="pb-item">
                <div class="pb-distance">${r.name}</div>
                <div class="pb-time">${utils.formatTime(r.best.moving_time)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${hasRidingPBs ? `
          <div class="pb-category fade-in-up" style="animation-delay: 0.3s">
            <div class="pb-category-header">
              <span class="pb-icon">🚴</span>
              <h4>Cycling</h4>
            </div>
            ${pbs.riding.map(r => `
              <div class="pb-item">
                <div class="pb-distance">${r.name}</div>
                <div class="pb-time">${utils.formatTime(r.best.moving_time)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${hasHighlights ? `
          <div class="pb-category pb-highlights fade-in-up" style="animation-delay: 0.4s">
            <div class="pb-category-header">
              <span class="pb-icon">⭐</span>
              <h4>Highlights</h4>
            </div>
            ${pbs.longest ? `
              <div class="pb-highlight">
                <div class="pb-highlight-label">Longest</div>
                ${actSummary(pbs.longest)}
              </div>
            ` : ''}
            ${pbs.mostElevation ? `
              <div class="pb-highlight">
                <div class="pb-highlight-label">Most Elevation</div>
                ${actSummary(pbs.mostElevation)}
              </div>
            ` : ''}
            ${pbs.fastest ? `
              <div class="pb-highlight">
                <div class="pb-highlight-label">Fastest</div>
                ${actSummary(pbs.fastest)}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }


  function renderExtras(gears, countries) {
    const hasCountries = countries.length > 0;

    if (!hasCountries) {
      return '<div class="empty-state">No location data for this year.</div>';
    }

    return `
  <div class="extras-grid">
    <div class="extra-section fade-in-up" style="animation-delay: 0.1s">
      <div class="section-header">
        <h3>🗺️ Location Heatmap</h3>
        <p class="section-subtitle">Training density by location</p>
      </div>
      <div id="heatmap-container" style="width: 100%; height: 400px; border-radius: 12px; overflow: hidden;"></div>
    </div>

    <div class="extra-section fade-in-up" style="animation-delay: 0.2s">
      <div class="section-header">
        <h3>🌍 Locations</h3>
        <p class="section-subtitle">Countries where you trained</p>
      </div>
      <div class="country-list">
        ${(() => {
        const total = countries.reduce((sum, c) => sum + c.count, 0);
        const maxCount = countries[0].count;
        return countries.map((c) => {
          const width = (maxCount > 0) ? (c.count / maxCount) * 100 : 0;
          const percent = ((c.count / total) * 100).toFixed(1);
          return `
              <div class="country-item">
                <div class="country-name">${c.country}</div>
                <div class="country-bar-container">
                  <div class="country-bar" style="width: ${width}%"></div>
                </div>
                <div class="country-count">${percent}%</div>
              </div>
            `;
        }).join('');
      })()}
      </div>
    </div>
  </div>
  `;
  }

  function initializeHeatmap(countries) {
    // Esperar a que el DOM esté listo
    setTimeout(() => {
      const container = document.getElementById('heatmap-container');
      if (!container) return;

      // Obtener coordenadas de los países con su intensidad
      const points = countries.map(c => ({
        lat: getCountryLatLng(c.country).lat,
        lng: getCountryLatLng(c.country).lng,
        intensity: c.count
      }));

      // Calcular centro del mapa
      const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
      const avgLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;

      // Inicializar mapa Leaflet
      const map = L.map('heatmap-container', {
        center: [avgLat, avgLng],
        zoom: points.length === 1 ? 10 : 4,
        zoomControl: true,
        attributionControl: true
      });

      // Añadir capa de OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
      }).addTo(map);

      // Preparar datos para el heatmap
      const maxIntensity = Math.max(...points.map(p => p.intensity));
      // Boost intensity so hotspots are more visible; cap to avoid oversaturation
      const heatmapData = points.map(p => [
        p.lat,
        p.lng,
        Math.min(1.6, (p.intensity / (maxIntensity || 1)) * 1.4) // normalize & amplify
      ]);

      // Añadir capa de heatmap con parámetros más agresivos y gradiente más llamativo
      L.heatLayer(heatmapData, {
        radius: 70,
        blur: 25,
        maxZoom: 10,
        max: 1.6,
        gradient: {
          0.0: '#0d47a1',
          0.2: '#1976d2',
          0.4: '#03a9f4',
          0.6: '#00e676',
          0.8: '#ffeb3b',
          1.0: '#ff3d00'
        }
      }).addTo(map);

      // Ajustar vista para mostrar todos los puntos
      if (points.length > 1) {
        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, 100);
  }

  function getCountryLatLng(country) {
    // Coordenadas reales (lat, lng) de capitales/centros de países
    const coords = {
      'Spain': { lat: 40.4168, lng: -3.7038 },
      'France': { lat: 48.8566, lng: 2.3522 },
      'Italy': { lat: 41.9028, lng: 12.4964 },
      'Germany': { lat: 52.5200, lng: 13.4050 },
      'United Kingdom': { lat: 51.5074, lng: -0.1278 },
      'Portugal': { lat: 38.7223, lng: -9.1393 },
      'Netherlands': { lat: 52.3676, lng: 4.9041 },
      'Belgium': { lat: 50.8503, lng: 4.3517 },
      'Switzerland': { lat: 46.9480, lng: 7.4474 },
      'Austria': { lat: 48.2082, lng: 16.3738 },
      'United States': { lat: 38.9072, lng: -77.0369 },
      'Canada': { lat: 45.4215, lng: -75.6972 },
      'Mexico': { lat: 19.4326, lng: -99.1332 },
      'Brazil': { lat: -15.7939, lng: -47.8828 },
      'Argentina': { lat: -34.6037, lng: -58.3816 },
      'Japan': { lat: 35.6762, lng: 139.6503 },
      'China': { lat: 39.9042, lng: 116.4074 },
      'Australia': { lat: -33.8688, lng: 151.2093 },
      'New Zealand': { lat: -41.2865, lng: 174.7762 },
      'India': { lat: 28.6139, lng: 77.2090 },
      'Thailand': { lat: 13.7563, lng: 100.5018 },
      'Singapore': { lat: 1.3521, lng: 103.8198 },
      'UAE': { lat: 25.2048, lng: 55.2708 },
      'South Africa': { lat: -33.9249, lng: 18.4241 },
      'Morocco': { lat: 33.9716, lng: -6.8498 },
      'Egypt': { lat: 30.0444, lng: 31.2357 },
      'Kenya': { lat: -1.2921, lng: 36.8219 },
      'Russia': { lat: 55.7558, lng: 37.6173 },
      'Poland': { lat: 52.2297, lng: 21.0122 },
      'Czech Republic': { lat: 50.0755, lng: 14.4378 },
      'Greece': { lat: 37.9838, lng: 23.7275 },
      'Turkey': { lat: 41.0082, lng: 28.9784 },
      'Norway': { lat: 59.9139, lng: 10.7522 },
      'Sweden': { lat: 59.3293, lng: 18.0686 },
      'Denmark': { lat: 55.6761, lng: 12.5683 },
      'Finland': { lat: 60.1699, lng: 24.9384 },
    };

    return coords[country] || { lat: 40.4168, lng: -3.7038 }; // Default: Madrid
  }




  // Activities table
  function renderActivitiesTable(activities) {
    const sorted = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

    if (!sorted.length) {
      return `
            <div class="section-header">
                <h3>📋 All Activities</h3>
                <p class="section-subtitle">No activities recorded for ${displayYear}.</p>
            </div>
            <div class="empty-state">No activities to display.</div>
        `;
    }

    return `
      <div class="section-header">
        <h3>📋 All Activities</h3>
        <p class="section-subtitle">${activities.length} workouts in ${displayYear}</p>
      </div>
      
      <div class="activities-table-container">
        <table class="activities-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Type</th>
              <th>Distance</th>
              <th>Time</th>
              <th>Pace</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((a, idx) => {
      const pace = (Number(a.distance) > 0 && Number(a.moving_time) > 0 && (a.type || '').toLowerCase().includes('run'))
        ? utils.formatPace(Number(a.moving_time), Number(a.distance) / 1000)
        : '—';

      const date = new Date(a.start_date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      return `
                <tr class="fade-in-up" style="animation-delay: ${Math.min(idx * 0.02, 1)}s">
                  <td class="table-date">${date}</td>
                  <td class="table-name">${a.name || 'Untitled'}</td>
                  <td class="table-type">
                    <span class="type-badge">${a.type || a.sport || 'Unknown'}</span>
                  </td>
                  <td class="table-distance">${utils.formatDistance(Number(a.distance) || 0)}</td>
                  <td class="table-time">${utils.formatTime(Number(a.moving_time) || 0)}</td>
                  <td class="table-pace">${pace}</td>
                  <td class="table-action">
                    <a href="html/activity.html?id=${a.id}" target="_blank" class="table-link">
                      View →
                    </a>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // === INJECT INTO DOM ===
  document.getElementById(cfg.containerIds.summary).innerHTML = summaryHtml;
  document.getElementById(cfg.containerIds.sportComparison).innerHTML = renderSportComparison(sportsCurrent, sportsPrev);
  document.getElementById(cfg.containerIds.temporalStats).innerHTML = renderHistograms(monthlyHours, weekdayHours, hourCounts);
  document.getElementById(cfg.containerIds.motivation).innerHTML = renderTopEfforts(topEfforts);
  document.getElementById(cfg.containerIds.personalBests).innerHTML = renderPersonalBests(pbs);
  document.getElementById(cfg.containerIds.extremeStats).innerHTML = renderExtras(topGears, countries);
  document.getElementById(cfg.containerIds.allActivities).innerHTML = renderActivitiesTable(currentActs);
  initializeHeatmap(countries);
  document.getElementById(cfg.containerIds.heatmap).innerHTML = renderHeatmap();

}