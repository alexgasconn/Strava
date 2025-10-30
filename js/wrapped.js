// js/wrapped.js

export function renderWrappedTab(allActivities) {
    console.log("Initializing Wrapped Year in Sport...");

    if (!allActivities || allActivities.length === 0) {
        document.getElementById('wrapped-summary').innerHTML = '<p>No activity data available.</p>';
        return;
    }

    const summaryContainer = document.getElementById('wrapped-summary');
    const personalBestsContainer = document.getElementById('wrapped-personal-bests');
    const sportComparisonContainer = document.getElementById('wrapped-sport-comparison');
    const geographyContainer = document.getElementById('wrapped-geography');
    const extremeStatsContainer = document.getElementById('wrapped-extreme-stats');
    const temporalStatsContainer = document.getElementById('wrapped-temporal-stats');
    const motivationContainer = document.getElementById('wrapped-motivation');
    const socialContainer = document.getElementById('wrapped-social');
    const allActivitiesContainer = document.getElementById('wrapped-all-activities');

    if (!summaryContainer || !personalBestsContainer || !sportComparisonContainer ||
        !geographyContainer || !extremeStatsContainer || !temporalStatsContainer ||
        !motivationContainer || !socialContainer || !allActivitiesContainer) {
        console.error("Some Wrapped containers are missing in HTML.");
        return;
    }

    // --- Helpers ---
    function formatTime(sec) {
        if (!isFinite(sec) || sec <= 0) return 'N/A';
        sec = Math.round(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return (h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`);
    }

    function formatDistance(meters) {
        return (meters / 1000).toFixed(2) + ' km';
    }

    function formatPace(seconds, km) {
        if (!isFinite(seconds) || !isFinite(km) || km <= 0) return '-';
        const pace = seconds / km;
        const min = Math.floor(pace / 60);
        const secRest = Math.round(pace % 60);
        return `${min}:${secRest.toString().padStart(2,'0')} /km`;
    }

    // --- 1. Summary Stats ---
    const totalActivities = allActivities.length;
    const totalDistance = allActivities.reduce((acc, a) => acc + (a.distance || 0), 0);
    const totalTime = allActivities.reduce((acc, a) => acc + (a.moving_time || 0), 0);

    summaryContainer.innerHTML = `
        <p>Total Activities: ${totalActivities}</p>
        <p>Total Distance: ${formatDistance(totalDistance)}</p>
        <p>Total Time: ${formatTime(totalTime)}</p>
    `;

    // --- 2. Personal Bests by Sport and Distance ---
    function renderPersonalBests(container, activities) {
        const sports = [...new Set(activities.map(a => a.type))];

        container.innerHTML = sports.map(sport => {
            const sportActs = activities.filter(a => a.type === sport);
            // Definimos distancias objetivo
            const targetDistances = [
                { name: '1 Mile', km: 1.609 },
                { name: '5K', km: 5 },
                { name: '10K', km: 10 },
                { name: 'Half Marathon', km: 21.097 },
                { name: 'Marathon', km: 42.195 }
            ];
            const margin = 0.07;
            const medalEmojis = ['🥇','🥈','🥉'];

            const results = {};
            targetDistances.forEach(target => {
                const minKm = target.km*(1-margin);
                const maxKm = target.km*(1+margin);
                const candidates = sportActs
                    .filter(a => a.distance/1000 >= minKm && a.distance/1000 <= maxKm && a.moving_time > 0)
                    .sort((a,b) => a.moving_time - b.moving_time)
                    .slice(0,3);
                if (candidates.length) results[target.name] = candidates;
            });

            if (!Object.keys(results).length) return `<p>No personal bests for ${sport}</p>`;

            return `
                <h3>${sport}</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1rem;">
                    ${Object.entries(results).map(([distName, top]) => `
                        <div style="border:1px solid #ddd;padding:0.8rem;border-radius:6px;">
                            <h4 style="text-align:center;">${distName}</h4>
                            ${top.map((act, idx) => `
                                <p style="text-align:center; font-weight:bold;">${medalEmojis[idx]||''} ${formatTime(act.moving_time)}</p>
                                <p style="text-align:center; font-size:0.9em;">Distance: ${(act.distance/1000).toFixed(2)} km</p>
                                <p style="text-align:center; font-size:0.8em;">${new Date(act.start_date).toLocaleDateString()}</p>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');
    }

    renderPersonalBests(personalBestsContainer, allActivities);

    // --- 3. Sport Comparison ---
    function renderSportComparison(container, activities) {
        const sports = [...new Set(activities.map(a => a.type))];
        const stats = sports.map(s => {
            const acts = activities.filter(a => a.type === s);
            const totalDist = acts.reduce((acc,a)=>acc+(a.distance||0),0);
            const totalTime = acts.reduce((acc,a)=>acc+(a.moving_time||0),0);
            return { sport: s, totalDistance: totalDist, totalTime };
        });

        container.innerHTML = `
            <h3>Sport Comparison</h3>
            <ul>
                ${stats.map(s=>`<li>${s.sport}: ${formatDistance(s.totalDistance)}, ${formatTime(s.totalTime)}</li>`).join('')}
            </ul>
        `;
    }

    renderSportComparison(sportComparisonContainer, allActivities);

    // --- 4. Geography / Routes ---
    function renderGeography(container, activities) {
        const countries = [...new Set(activities.map(a => a.location_country).filter(Boolean))];
        container.innerHTML = `<h3>Countries Visited</h3><p>${countries.join(', ')}</p>`;
        // Aquí se podrían integrar mapas con Leaflet para heatmap de rutas
    }

    renderGeography(geographyContainer, allActivities);

    // --- 5. Extreme Stats (Max Distance, Calories, Elevation) ---
    function renderExtremeStats(container, activities) {
        const maxDist = activities.reduce((a,b)=>a.distance > b.distance ? a : b, activities[0]);
        const maxTime = activities.reduce((a,b)=>a.moving_time > b.moving_time ? a : b, activities[0]);
        container.innerHTML = `
            <h3>Extreme Stats</h3>
            <p>Longest Distance: ${formatDistance(maxDist.distance)} on ${new Date(maxDist.start_date).toLocaleDateString()}</p>
            <p>Longest Time: ${formatTime(maxTime.moving_time)} on ${new Date(maxTime.start_date).toLocaleDateString()}</p>
        `;
    }

    renderExtremeStats(extremeStatsContainer, allActivities);

    // --- 6. Temporal Stats (Hour, Day, Month) ---
    function renderTemporalStats(container, activities) {
        const hours = Array.from({length:24},()=>0);
        activities.forEach(a => hours[new Date(a.start_date).getHours()]++);
        container.innerHTML = `<h3>Activities by Hour</h3>
            <ul>${hours.map((h,i)=>`<li>${i}h: ${h}</li>`).join('')}</ul>`;
    }

    renderTemporalStats(temporalStatsContainer, allActivities);

    // --- 7. Motivation / Gamification ---
    function renderMotivation(container, activities) {
        // Ejemplo sencillo de streaks
        let streak = 0, maxStreak=0;
        const sorted = [...activities].sort((a,b)=>new Date(a.start_date)-new Date(b.start_date));
        for (let i=0;i<sorted.length;i++) {
            if (i===0 || (new Date(sorted[i].start_date)-new Date(sorted[i-1].start_date))<=2*24*60*60*1000) {
                streak++;
                if (streak>maxStreak) maxStreak=streak;
            } else streak=1;
        }
        container.innerHTML = `<h3>Motivation</h3><p>Longest activity streak: ${maxStreak} days</p>`;
    }

    renderMotivation(motivationContainer, allActivities);

    // --- 8. Social / Community ---
    function renderSocial(container, activities) {
        const groupActs = activities.filter(a=>a.athlete_count && a.athlete_count>1);
        container.innerHTML = `<h3>Group Activities</h3><p>${groupActs.length} activities done with others.</p>`;
    }

    renderSocial(socialContainer, allActivities);

    // --- 9. All Activities Table ---
    function renderAllActivitiesTable(container, activities) {
        const sorted = [...activities].sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));
        const rows = sorted.map(a => `<tr>
            <td>${new Date(a.start_date).toLocaleDateString()}</td>
            <td>${a.name}</td>
            <td>${formatDistance(a.distance)}</td>
            <td>${formatTime(a.moving_time)}</td>
            <td>${a.type}</td>
            <td><a href="activity.html?id=${a.id}" target="_blank"><button>View</button></a></td>
        </tr>`).join('');
        container.innerHTML = `<table>
            <thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Sport</th><th>Details</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    renderAllActivitiesTable(allActivitiesContainer, allActivities);
}
