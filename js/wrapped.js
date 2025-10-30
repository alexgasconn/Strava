// js/wrapped.js

export function renderWrappedTab(allActivities) {
    console.log("Initializing Wrapped Year in Sport...");

    if (!allActivities || allActivities.length === 0) {
        document.getElementById('wrapped-summary').innerHTML = '<p>No activity data available.</p>';
        return;
    }

    // --- Utilities ---
    const utils = {
        formatTime(sec) {
            if (!isFinite(sec) || sec <= 0) return 'N/A';
            sec = Math.round(sec);
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return h > 0 
                ? `${h}h ${m}m ${s}s` 
                : m > 0 
                    ? `${m}m ${s}s` 
                    : `${s}s`;
        },

        formatDistance(meters) {
            return meters >= 1000 
                ? `${(meters / 1000).toFixed(2)} km` 
                : `${meters.toFixed(0)} m`;
        },

        formatPace(seconds, km) {
            if (!isFinite(seconds) || !isFinite(km) || km <= 0) return 'N/A';
            const pace = seconds / km;
            const min = Math.floor(pace / 60);
            const sec = Math.round(pace % 60);
            return `${min}:${sec.toString().padStart(2,'0')} /km`;
        },

        formatSpeed(meters, seconds) {
            if (!isFinite(meters) || !isFinite(seconds) || seconds <= 0) return 'N/A';
            return ((meters / 1000) / (seconds / 3600)).toFixed(2) + ' km/h';
        },

        formatElevation(meters) {
            return meters ? `${Math.round(meters)} m` : 'N/A';
        },

        groupByPeriod(activities, period) {
            const groups = {};
            activities.forEach(a => {
                const date = new Date(a.start_date);
                let key;
                if (period === 'month') {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;
                } else if (period === 'week') {
                    const weekNum = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
                    key = `${date.getFullYear()}-W${weekNum}`;
                } else if (period === 'day') {
                    key = date.toISOString().split('T')[0];
                }
                if (!groups[key]) groups[key] = [];
                groups[key].push(a);
            });
            return groups;
        }
    };

    // --- Data Analysis ---
    const analyze = {
        getSummary(activities) {
            return {
                total: activities.length,
                distance: activities.reduce((acc, a) => acc + (a.distance || 0), 0),
                time: activities.reduce((acc, a) => acc + (a.moving_time || 0), 0),
                elevation: activities.reduce((acc, a) => acc + (a.total_elevation_gain || 0), 0),
                calories: activities.reduce((acc, a) => acc + (a.calories || 0), 0)
            };
        },

        getBySport(activities) {
            const sports = {};
            activities.forEach(a => {
                if (!sports[a.type]) {
                    sports[a.type] = { activities: [], distance: 0, time: 0, elevation: 0 };
                }
                sports[a.type].activities.push(a);
                sports[a.type].distance += a.distance || 0;
                sports[a.type].time += a.moving_time || 0;
                sports[a.type].elevation += a.total_elevation_gain || 0;
            });
            return Object.entries(sports)
                .map(([sport, data]) => ({ sport, ...data, count: data.activities.length }))
                .sort((a, b) => b.distance - a.distance);
        },

        getPersonalBests(activities) {
            const distances = [
                { name: '1K', km: 1, margin: 0.1 },
                { name: '5K', km: 5, margin: 0.07 },
                { name: '10K', km: 10, margin: 0.07 },
                { name: 'Half Marathon', km: 21.097, margin: 0.05 },
                { name: 'Marathon', km: 42.195, margin: 0.05 }
            ];

            const results = [];
            distances.forEach(({ name, km, margin }) => {
                const min = km * (1 - margin);
                const max = km * (1 + margin);
                const candidates = activities
                    .filter(a => {
                        const actKm = a.distance / 1000;
                        return actKm >= min && actKm <= max && a.moving_time > 0;
                    })
                    .sort((a, b) => a.moving_time - b.moving_time);
                
                if (candidates.length > 0) {
                    results.push({
                        distance: name,
                        best: candidates[0],
                        attempts: candidates.length
                    });
                }
            });
            return results;
        },

        getMonthlyProgress(activities) {
            const monthly = utils.groupByPeriod(activities, 'month');
            return Object.entries(monthly).map(([month, acts]) => ({
                month,
                count: acts.length,
                distance: acts.reduce((acc, a) => acc + (a.distance || 0), 0),
                time: acts.reduce((acc, a) => acc + (a.moving_time || 0), 0)
            })).sort((a, b) => a.month.localeCompare(b.month));
        },

        getStreaks(activities) {
            const sorted = [...activities].sort((a, b) => 
                new Date(a.start_date) - new Date(b.start_date)
            );
            
            let current = 1, max = 1;
            const streaks = [];
            let streakStart = sorted[0]?.start_date;

            for (let i = 1; i < sorted.length; i++) {
                const diff = new Date(sorted[i].start_date) - new Date(sorted[i-1].start_date);
                const daysDiff = diff / (1000 * 60 * 60 * 24);
                
                if (daysDiff <= 2) {
                    current++;
                } else {
                    if (current >= 3) {
                        streaks.push({ start: streakStart, end: sorted[i-1].start_date, length: current });
                    }
                    current = 1;
                    streakStart = sorted[i].start_date;
                }
                max = Math.max(max, current);
            }
            
            return { longest: max, streaks: streaks.sort((a, b) => b.length - a.length).slice(0, 3) };
        },

        getHourDistribution(activities) {
            const hours = Array(24).fill(0);
            activities.forEach(a => {
                const hour = new Date(a.start_date).getHours();
                hours[hour]++;
            });
            const maxHour = hours.indexOf(Math.max(...hours));
            return { hours, favorite: maxHour };
        }
    };

    // --- Renderers ---
    const render = {
        summary(data) {
            return `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                    <div style="text-align: center; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #007bff;">${data.total}</div>
                        <div style="color: #6c757d;">Activities</div>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #28a745;">${utils.formatDistance(data.distance)}</div>
                        <div style="color: #6c757d;">Total Distance</div>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #fd7e14;">${utils.formatTime(data.time)}</div>
                        <div style="color: #6c757d;">Total Time</div>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #6f42c1;">${utils.formatElevation(data.elevation)}</div>
                        <div style="color: #6c757d;">Elevation Gain</div>
                    </div>
                </div>
            `;
        },

        personalBests(bests) {
            if (bests.length === 0) return '<p>Complete more activities to unlock personal bests!</p>';
            
            return `
                <h3>🏆 Personal Bests</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                    ${bests.map(pb => `
                        <div style="border: 2px solid #ffc107; padding: 1rem; border-radius: 8px; background: #fff8e1;">
                            <h4 style="margin: 0 0 0.5rem 0; color: #f57c00;">${pb.distance}</h4>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #e65100;">${utils.formatTime(pb.best.moving_time)}</div>
                            <div style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">
                                ${utils.formatPace(pb.best.moving_time, pb.best.distance / 1000)} • 
                                ${new Date(pb.best.start_date).toLocaleDateString()}
                            </div>
                            <div style="font-size: 0.8rem; color: #999; margin-top: 0.3rem;">
                                ${pb.attempts} attempt${pb.attempts !== 1 ? 's' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        sportComparison(sports) {
            return `
                <h3>📊 Sport Breakdown</h3>
                <div style="display: grid; gap: 0.5rem;">
                    ${sports.map((s, idx) => {
                        const percentage = (s.distance / sports.reduce((acc, sp) => acc + sp.distance, 0) * 100).toFixed(1);
                        return `
                            <div style="background: #f8f9fa; padding: 1rem; border-radius: 6px; border-left: 4px solid ${['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1'][idx % 5]};">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <strong>${s.sport}</strong>
                                    <span style="color: #666;">${s.count} activities</span>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                                    <div>
                                        <div style="color: #666;">Distance</div>
                                        <strong>${utils.formatDistance(s.distance)}</strong>
                                        <span style="color: #999; font-size: 0.8rem;">(${percentage}%)</span>
                                    </div>
                                    <div>
                                        <div style="color: #666;">Time</div>
                                        <strong>${utils.formatTime(s.time)}</strong>
                                    </div>
                                    <div>
                                        <div style="color: #666;">Elevation</div>
                                        <strong>${utils.formatElevation(s.elevation)}</strong>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        monthlyProgress(monthly) {
            const maxDist = Math.max(...monthly.map(m => m.distance));
            return `
                <h3>📈 Monthly Progress</h3>
                <div style="display: grid; gap: 0.5rem;">
                    ${monthly.map(m => {
                        const percentage = (m.distance / maxDist * 100).toFixed(0);
                        const date = new Date(m.month + '-01');
                        const monthName = date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
                        return `
                            <div style="background: #f8f9fa; padding: 0.8rem; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                                    <strong>${monthName}</strong>
                                    <span>${m.count} activities</span>
                                </div>
                                <div style="background: #e9ecef; height: 20px; border-radius: 10px; overflow: hidden;">
                                    <div style="background: linear-gradient(90deg, #007bff, #0056b3); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-top: 0.3rem; font-size: 0.85rem; color: #666;">
                                    <span>${utils.formatDistance(m.distance)}</span>
                                    <span>${utils.formatTime(m.time)}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        streaks(data) {
            return `
                <h3>🔥 Activity Streaks</h3>
                <div style="background: #fff3cd; padding: 1.5rem; border-radius: 8px; border: 2px solid #ffc107; margin-bottom: 1rem;">
                    <div style="font-size: 3rem; text-align: center; margin-bottom: 0.5rem;">🔥</div>
                    <div style="font-size: 2rem; font-weight: bold; text-align: center; color: #f57c00;">
                        ${data.longest} Days
                    </div>
                    <div style="text-align: center; color: #666;">Longest Streak</div>
                </div>
                ${data.streaks.length > 0 ? `
                    <div style="display: grid; gap: 0.5rem;">
                        ${data.streaks.map((s, idx) => `
                            <div style="background: #f8f9fa; padding: 0.8rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                                <span>${['🥇','🥈','🥉'][idx] || '🏅'} ${s.length} days</span>
                                <span style="font-size: 0.85rem; color: #666;">
                                    ${new Date(s.start).toLocaleDateString()} - ${new Date(s.end).toLocaleDateString()}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
        },

        hourDistribution(data) {
            const max = Math.max(...data.hours);
            return `
                <h3>⏰ Activity Times</h3>
                <p style="background: #e7f3ff; padding: 0.8rem; border-radius: 6px; border-left: 4px solid #007bff;">
                    Your favorite time to exercise is <strong>${data.favorite}:00</strong>
                </p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 0.3rem; margin-top: 1rem;">
                    ${data.hours.map((count, hour) => {
                        const height = max > 0 ? (count / max * 100) : 0;
                        return `
                            <div style="text-align: center;">
                                <div style="height: 80px; display: flex; align-items: flex-end; justify-content: center;">
                                    <div style="width: 100%; background: ${count > 0 ? '#007bff' : '#e9ecef'}; height: ${height}%; border-radius: 4px 4px 0 0; transition: all 0.3s;" title="${count} activities"></div>
                                </div>
                                <div style="font-size: 0.7rem; color: #666; margin-top: 0.2rem;">${hour}h</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        activitiesTable(activities) {
            const sorted = [...activities].sort((a, b) => 
                new Date(b.start_date) - new Date(a.start_date)
            );
            return `
                <h3>📋 All Activities</h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa; text-align: left;">
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Date</th>
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Name</th>
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Sport</th>
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Distance</th>
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Time</th>
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Pace</th>
                                <th style="padding: 0.8rem; border-bottom: 2px solid #dee2e6;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map((a, idx) => `
                                <tr style="background: ${idx % 2 === 0 ? '#fff' : '#f8f9fa'};">
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">${new Date(a.start_date).toLocaleDateString()}</td>
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">${a.name || 'Untitled'}</td>
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">${a.type}</td>
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">${utils.formatDistance(a.distance)}</td>
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">${utils.formatTime(a.moving_time)}</td>
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">${utils.formatPace(a.moving_time, a.distance / 1000)}</td>
                                    <td style="padding: 0.8rem; border-bottom: 1px solid #dee2e6;">
                                        <a href="activity.html?id=${a.id}" target="_blank" style="background: #007bff; color: white; padding: 0.3rem 0.8rem; border-radius: 4px; text-decoration: none; font-size: 0.85rem;">View</a>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    };

    // --- Main Rendering ---
    const summary = analyze.getSummary(allActivities);
    const sports = analyze.getBySport(allActivities);
    const personalBests = analyze.getPersonalBests(allActivities);
    const monthly = analyze.getMonthlyProgress(allActivities);
    const streaks = analyze.getStreaks(allActivities);
    const hourDist = analyze.getHourDistribution(allActivities);

    document.getElementById('wrapped-summary').innerHTML = render.summary(summary);
    document.getElementById('wrapped-personal-bests').innerHTML = render.personalBests(personalBests);
    document.getElementById('wrapped-sport-comparison').innerHTML = render.sportComparison(sports);
    document.getElementById('wrapped-temporal-stats').innerHTML = render.monthlyProgress(monthly);
    document.getElementById('wrapped-motivation').innerHTML = render.streaks(streaks);
    document.getElementById('wrapped-extreme-stats').innerHTML = render.hourDistribution(hourDist);
    document.getElementById('wrapped-all-activities').innerHTML = render.activitiesTable(allActivities);

    // Hide unused containers
    document.getElementById('wrapped-geography').style.display = 'none';
    document.getElementById('wrapped-social').style.display = 'none';
}