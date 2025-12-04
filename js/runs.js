// js/runs.js


export function renderRunsTab(allActivities) {
    console.log("Initializing Runs Tab...");

    // Filtra solo las actividades de tipo 'Run'
    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    const personalBestsContainer = document.getElementById('personal-bests');
    const raceListTableContainer = document.getElementById('race-list'); // Renombrado para evitar conflicto con la función
    const allRunsTableContainer = document.getElementById('all-runs-table');

    if (!personalBestsContainer || !raceListTableContainer || !allRunsTableContainer) {
        console.error("One or more Runs & Races containers not found.");
        return;
    }

    if (runs.length === 0) {
        personalBestsContainer.innerHTML = '<p>No running data available.</p>';
        raceListTableContainer.innerHTML = '<thead><tr><th>No Races</th></tr></thead><tbody><tr><td>No running data to display races.</td></tr></tbody>';
        allRunsTableContainer.innerHTML = '<thead><tr><th>No Runs</th></tr></thead><tbody><tr><td>No running data to display runs.</td></tr></tbody>';
        return;
    }

    // --- Lógica principal del Runs Tab ---

    const pbs = runs;
    renderPersonalBests(personalBestsContainer, pbs);

    // Insert a selector control after Personal Bests to choose between All Runs and Races
    try {
        const selectorWrap = document.createElement('div');
        selectorWrap.id = 'runs-view-selector';
        selectorWrap.style.margin = '0.6rem 0';
        selectorWrap.innerHTML = `
            <label style="font-weight:600; margin-right:1rem;"><input type="radio" name="runs_view" value="all" checked> All Runs</label>
            <label style="font-weight:600;"><input type="radio" name="runs_view" value="races"> Races</label>
        `;
        // Insert before the races container so selector appears between PBs and tables
        const parent = raceListTableContainer.parentNode || personalBestsContainer.parentNode;
        if (parent) parent.insertBefore(selectorWrap, raceListTableContainer);

        function applyView() {
            const val = selectorWrap.querySelector('input[name="runs_view"]:checked').value;
            if (val === 'all') {
                allRunsTableContainer.style.display = '';
                raceListTableContainer.style.display = 'none';
            } else {
                allRunsTableContainer.style.display = 'none';
                raceListTableContainer.style.display = '';
            }
        }
        selectorWrap.querySelectorAll('input[name="runs_view"]').forEach(r => r.addEventListener('change', applyView));
        // default
        applyView();
    } catch (e) {
        console.warn('Could not insert runs view selector', e);
    }

    renderRaceList(runs);

    renderAllRunsTable(runs);

    function renderPersonalBests(container, runs) {
        // --- Helpers local to PBs ---
        function formatTime(sec) {
            if (!isFinite(sec) || sec <= 0) return 'N/A';
            sec = Math.round(sec);
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return (h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`);
        }

        function formatPace(seconds, km) {
            if (!isFinite(seconds) || !isFinite(km) || km <= 0) return '-';
            const pace = seconds / km;
            const min = Math.floor(pace / 60);
            const secRest = Math.round(pace % 60);
            return `${min}:${secRest.toString().padStart(2, '0')} /km`;
        }

        const targetDistances = [
            { name: '1 Mile', km: 1.609 },
            { name: '5K', km: 5 },
            { name: '10K', km: 10 },
            { name: '15K', km: 15 },
            { name: 'Half Marathon', km: 21.097 },
            { name: '30K', km: 30 },
            { name: 'Marathon', km: 42.195 }
        ];

        const margin = 0.07; // ±7%
        const medalEmojis = ['🥇', '🥈', '🥉'];

        const results = {};

        targetDistances.forEach(target => {
            const minKm = target.km * (1 - margin);
            const maxKm = target.km * (1 + margin);

            const candidates = runs
                .filter(run => {
                    const km = (run.distance || 0) / 1000;
                    return km >= minKm && km <= maxKm && run.moving_time > 0;
                })
                .map(run => ({
                    ...run,
                    time_at_target: run.moving_time,
                    actual_run_km: (run.distance || 0) / 1000
                }))
                .sort((a, b) => a.time_at_target - b.time_at_target)
                .slice(0, 3);

            if (candidates.length > 0) {
                results[target.name] = candidates;
            }
        });

        if (Object.keys(results).length === 0) {
            container.innerHTML = '<p>No personal bests recorded yet.</p>';
            return;
        }

        container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            ${Object.entries(results).map(([distName, topRuns]) => `
                <div class="pb-card" style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px;">
                    <h4 style="text-align:center; margin-bottom:0.6em;">${distName}</h4>
                    ${topRuns.map((run, idx) => `
                        <div style="text-align:center; margin-bottom:0.6em; border-top: ${idx > 0 ? '1px dashed #ccc' : 'none'}; padding-top: ${idx > 0 ? '0.6em' : '0'};">
                            <p style="font-size:1.2em; font-weight:bold; margin:0;">
                                ${medalEmojis[idx] || ''} ${formatTime(run.time_at_target)}
                            </p>
                            <p style="font-size:1em; color:#333; margin:0;">Distance: ${run.actual_run_km.toFixed(2)} km</p>
                            <p style="font-size:0.9em; color:#555; margin:0;">Pace: ${formatPace(run.time_at_target, run.actual_run_km)}</p>
                            <p style="font-size:0.8em; color:#777; margin:0.2em 0;">${new Date(run.start_date_local || run.start_date).toLocaleDateString()}</p>
                            <a href="html/activity.html?id=${run.id}" target="_blank" style="font-size:0.8em; color:#0077cc; text-decoration:none;">
                                View activity →
                            </a>
                        </div>
                    `).join('')}
                </div>
            `).join('')}
        </div>
    `;
    }

    // Tu función original para renderizar la tabla de todas las carreras
    function renderAllRunsTable(allRuns) {
        console.log(allRuns);
        const container = document.getElementById('all-runs-table');
        if (!container) return;

        if (allRuns.length === 0) {
            container.innerHTML = "<tbody><tr><td colspan='4'>No runs found in this period.</td></tr></tbody>";
            return;
        }

        // Use same columns as race list for comprehensive view
        const columns = [
            'id', 'name', 'start_date_local', 'distance', 'moving_time', 'elapsed_time', 'average_speed', 'max_speed',
            'average_heartrate', 'max_heartrate', 'vo2max', 'tss', 'tss_method', 'atl', 'ctl', 'tsb', 'injuryRisk', 'suffer_score',
            'total_elevation_gain', 'elev_high', 'elev_low', 'average_cadence', 'average_temp', 'device_name', 'gear_id',
            'achievement_count', 'kudos_count', 'comment_count', 'pr_count', 'photo_count', 'visibility', 'private', 'commute',
            'trainer', 'sport_type', 'workout_type', 'workout_type_classified', 'athlete_count', 'athlete.id', 'map.id', 'map.summary_polyline', 'external_id', 'upload_id_str', 'timezone'
        ];

        function getNested(obj, path) {
            if (!obj || !path) return undefined;
            const parts = path.split('.');
            let cur = obj;
            for (const p of parts) {
                if (cur == null) return undefined;
                cur = cur[p];
            }
            return cur;
        }

        function formatVal(v) {
            if (v === null || v === undefined) return '';
            if (Array.isArray(v)) return v.join(', ');
            if (typeof v === 'object') {
                if (v.summary_polyline) {
                    const s = String(v.summary_polyline);
                    return `${v.id || ''} | poly: ${s.length > 120 ? s.substring(0, 120) + '...' : s}`;
                }
                if (v.id) return `${v.id}${v.resource_state ? ' (rs:' + v.resource_state + ')' : ''}`;
                try { return JSON.stringify(v); } catch (e) { return String(v); }
            }
            if (typeof v === 'boolean') return v ? 'Yes' : 'No';
            return String(v);
        }

        // Ordenamos las carreras de más reciente a más antigua para la tabla
        const sortedRuns = [...allRuns].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
        let showAll = container.getAttribute('data-show-all') === 'true';
        const runsToShow = showAll ? sortedRuns : sortedRuns.slice(0, 10);

        const tableHeader = `<thead><tr>${columns.map(c => `<th style="white-space:nowrap;">${c}</th>`).join('')}<th>Details</th></tr></thead>`;
        const tableBody = runsToShow.map(act => {
            const cells = columns.map(col => {
                let val = getNested(act, col);
                if (col === 'distance' && typeof val === 'number') val = (val / 1000).toFixed(2) + ' km';
                if ((col === 'moving_time' || col === 'elapsed_time') && typeof val === 'number') val = new Date(val * 1000).toISOString().substr(11, 8);
                if (col === 'start_date_local' && typeof val === 'string') val = val.substring(0, 19).replace('T', ' ');
                if (col === 'average_speed' && typeof val === 'number') val = (val).toFixed(3) + ' m/s';
                return `<td style="max-width:260px; overflow-wrap:anywhere;">${formatVal(val)}</td>`;
            }).join('');
            return `<tr>${cells}<td><a href="html/activity.html?id=${act.id}" target="_blank"><button>View</button></a></td></tr>`;
        }).join('');

        let toggleBtn = '';
        if (sortedRuns.length > 10) {
            toggleBtn = `
                <div style="margin: 0.5em 0;">
                    <button id="toggle-all-runs-btn" class="df-button">
                        ${showAll ? 'Show Only Last 10' : 'Show All Runs'}
                    </button>
                </div>
            `;
        }

        container.innerHTML = toggleBtn + tableHeader + `<tbody>${tableBody}</tbody>`;

        if (sortedRuns.length > 10) {
            document.getElementById('toggle-all-runs-btn').onclick = () => {
                container.setAttribute('data-show-all', showAll ? 'false' : 'true');
                renderAllRunsTable(allRuns); // Llama recursivamente con el nuevo estado
            };
        }
    }
}