// wrapped-stats-pro.js
// Professional Wrapped Stats Dashboard with enhanced visuals and animations
// Usage: renderWrappedTab(allActivities, {containerIds, reverseGeocoder})

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
        }
    };

    // === DATA PROCESSING ===
    const getYear = dateStr => new Date(dateStr).getFullYear();
    const years = Array.from(new Set(allActivities.map(a => getYear(a.start_date)))).sort((a, b) => b - a);
    const currentYear = years[0];
    const prevYear = years[1] || null;

    const activitiesByYear = y => allActivities.filter(a => getYear(a.start_date) === y);
    const currentActs = activitiesByYear(currentYear);
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

    // Top efforts
    function topByEffort(acts, n = 5) {
        const withScore = acts
            .filter(a => a.suffer_score || a.effort || a.trainer_score || a.intensity)
            .map(a => ({
                ...a,
                _score: Number(a.suffer_score || a.effort || a.trainer_score || a.intensity || 0)
            }));
        return withScore.sort((a, b) => b._score - a._score).slice(0, n);
    }

    const topEfforts = topByEffort(currentActs, 5);

    // Personal bests
    function findPBs(acts) {
        const runningTargets = { "Mile": 1609, "5K": 5000, "10K": 10000, "Half": 21097, "Marathon": 42195 };
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

    // Countries
    async function resolveCountries(acts) {
        const map = {};

        for (const a of acts) {
            const coords = (a.start_latlng && a.start_latlng.length === 2)
                ? a.start_latlng
                : ((a.end_latlng && a.end_latlng.length === 2) ? a.end_latlng : null);
            if (!coords) continue;

            const [lat, lon] = coords;
            let countryName = 'Unknown';

            try {
                // Use OpenStreetMap’s Nominatim reverse geocoding API
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
                    { headers: { 'User-Agent': 'YourAppName/1.0' } }
                );

                if (res.ok) {
                    const data = await res.json();
                    countryName = data.address?.country || 'Unknown';
                }
            } catch (e) {
                countryName = 'Unknown';
            }

            map[countryName] = (map[countryName] || 0) + 1;
        }

        return Object.entries(map)
            .map(([country, count]) => ({ country, count }))
            .sort((a, b) => b.count - a.count);
    }

    // Example usage:
    const countries = await resolveCountries(currentActs);
    console.log(countries);


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
      <h2>${currentYear} Wrapped</h2>
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

    // Sport comparison
    function renderSportComparison(sportsCurr, sportsPrev) {
        const prevMap = new Map(sportsPrev.map(s => [s.sport, s]));
        const totalTime = utils.sum(sportsCurr, 'time');

        const sportIcons = {
            'Run': '🏃',
            'Running': '🏃',
            'Ride': '🚴',
            'Cycling': '🚴',
            'Swim': '🏊',
            'Swimming': '🏊',
            'Walk': '🚶',
            'Hike': '🥾',
            'Workout': '💪',
            'WeightTraining': '🏋️',
            'Yoga': '🧘'
        };

        return `
      <div class="section-header">
        <h3>📊 Sport Breakdown</h3>
        <p class="section-subtitle">Ranked by total time</p>
      </div>
      
      <div class="sport-breakdown">
        ${sportsCurr.map((s, idx) => {
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

    // Temporal stats
    function renderHistograms(monthlyHours, weekdayHours, hourCounts) {
        const peakMonth = monthlyHours.length ?
            monthlyHours.reduce((a, b) => a.hours > b.hours ? a : b) : null;
        const peakDayIndex = weekdayHours.indexOf(Math.max(...weekdayHours));
        const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

        const wkNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const maxMonth = monthlyHours.length ? Math.max(...monthlyHours.map(m => m.hours)) : 0;
        const maxW = Math.max(...weekdayHours);

        const monthBars = monthlyHours.map((m, idx) => {
            const pct = maxMonth ? (m.hours / maxMonth) * 100 : 0;
            const label = new Date(m.month + '-01').toLocaleString(undefined, { month: 'short', year: 'numeric' });
            return `
        <div class="chart-row fade-in-up" style="animation-delay: ${0.05 * idx}s">
          <div class="chart-label">${label}</div>
          <div class="chart-bar-container">
            <div class="chart-bar" style="width: ${pct}%">
              <span class="chart-bar-value">${m.hours.toFixed(1)}h</span>
            </div>
          </div>
        </div>
      `;
        }).join('');

        const weekdayBars = weekdayHours.map((h, i) => {
            const pct = maxW ? (h / maxW) * 100 : 0;
            return `
        <div class="chart-row">
          <div class="chart-label chart-label-small">${wkNames[i]}</div>
          <div class="chart-bar-container">
            <div class="chart-bar chart-bar-secondary" style="width: ${pct}%">
              <span class="chart-bar-value">${h.toFixed(1)}h</span>
            </div>
          </div>
        </div>
      `;
        }).join('');

        const maxHour = Math.max(...hourCounts);
        const hourBars = hourCounts.map((c, h) => {
            const height = maxHour > 0 ? (c / maxHour) * 60 : 0;
            return `
        <div class="hour-bar" title="${h}:00 - ${c} activities">
          <div class="hour-bar-fill" style="height: ${height}px">
            ${c > 0 ? `<span class="hour-bar-count">${c}</span>` : ''}
          </div>
          <div class="hour-label">${h}</div>
        </div>
      `;
        }).join('');

        return `
      <div class="section-header">
        <h3>📈 Activity Patterns</h3>
        <p class="section-subtitle">When you train best</p>
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

      <div class="chart-section">
        <h4 class="chart-title">Monthly Activity (hours)</h4>
        <div class="chart-container">${monthBars}</div>
      </div>

      <div class="chart-section">
        <h4 class="chart-title">Weekly Pattern</h4>
        <div class="chart-container chart-container-compact">${weekdayBars}</div>
      </div>

      <div class="chart-section">
        <h4 class="chart-title">Time of Day Distribution</h4>
        <div class="hour-chart">${hourBars}</div>
      </div>
    `;
    }

    // Top efforts
    function renderTopEfforts(topEfforts) {
        if (!topEfforts || !topEfforts.length) {
            return '<div class="empty-state">No effort data available</div>';
        }

        return `
      <div class="section-header">
        <h3>🔥 Hardest Workouts</h3>
        <p class="section-subtitle">Your most intense sessions</p>
      </div>
      
      <div class="efforts-list">
        ${topEfforts.map((a, idx) => {
            const score = a._score;
            const maxScore = topEfforts[0]._score;
            const scoreWidth = (score / maxScore) * 100;

            return `
            <div class="effort-card fade-in-up" style="animation-delay: ${0.1 * idx}s">
              <div class="effort-rank">#${idx + 1}</div>
              <div class="effort-content">
                <h4 class="effort-title">${a.name || 'Untitled'}</h4>
                <div class="effort-meta">
                  ${a.type || a.sport} • ${utils.formatTime(Number(a.moving_time) || 0)} • ${utils.formatDistance(Number(a.distance) || 0)}
                </div>
                <div class="effort-score-bar">
                  <div class="effort-score-fill" style="width: ${scoreWidth}%"></div>
                </div>
              </div>
              <div class="effort-score">${Math.round(score)}</div>
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

        return `
      <div class="section-header">
        <h3>🏆 Personal Records</h3>
        <p class="section-subtitle">Your best performances</p>
      </div>
      
      <div class="pb-grid">
        ${pbs.running.length > 0 ? `
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

        ${pbs.swimming.length > 0 ? `
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

        ${pbs.riding.length > 0 ? `
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
      </div>
    `;
    }

    // Gear and countries
    function renderExtras(gears, countries) {
        return `
      <div class="extras-grid">
        ${gears.length > 0 ? `
          <div class="extra-section fade-in-up" style="animation-delay: 0.1s">
            <div class="section-header">
              <h3>⚙️ Equipment</h3>
              <p class="section-subtitle">Most used gear</p>
            </div>
            <div class="gear-list">
              ${gears.map((g, idx) => {
            const maxHours = gears[0].hours;
            const width = (g.hours / maxHours) * 100;
            return `
                  <div class="gear-item">
                    <div class="gear-name">${g.gear}</div>
                    <div class="gear-bar-container">
                      <div class="gear-bar" style="width: ${width}%"></div>
                    </div>
                    <div class="gear-hours">${g.hours.toFixed(1)}h</div>
                  </div>
                `;
        }).join('')}
            </div>
          </div>
        ` : ''}

        ${countries.length > 0 ? `
          <div class="extra-section fade-in-up" style="animation-delay: 0.2s">
            <div class="section-header">
              <h3>🌍 Locations</h3>
              <p class="section-subtitle">Where you trained</p>
            </div>
            <div class="country-list">
              ${countries.map((c, idx) => {
            const maxCount = countries[0].count;
            const width = (c.count / maxCount) * 100;
            return `
                  <div class="country-item">
                    <div class="country-name">${c.country}</div>
                    <div class="country-bar-container">
                      <div class="country-bar" style="width: ${width}%"></div>
                    </div>
                    <div class="country-count">${c.count}</div>
                  </div>
                `;
        }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    }

    // Activities table
    function renderActivitiesTable(activities) {
        const sorted = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

        return `
      <div class="section-header">
        <h3>📋 All Activities</h3>
        <p class="section-subtitle">${activities.length} workouts in ${currentYear}</p>
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
                    <a href="activity.html?id=${a.id}" target="_blank" class="table-link">
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
}

