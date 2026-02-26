// js/runs.js

import * as utils from './utils.js';

export function renderRunsTab(allActivities) {

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

    // Shared helpers for table rendering (used by both race and all-runs)
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

    // Sorting helper: returns a sorted copy of activities by `col` and `dir` ('asc'|'desc')
    function sortActivities(acts, col, dir) {
        if (!col) return acts.slice();
        const factor = dir === 'desc' ? -1 : 1;
        function valueFor(act) {
            if (col === 'moving_ratio') {
                const mt = getNested(act, 'moving_time');
                const et = getNested(act, 'elapsed_time');
                if (typeof mt === 'number' && typeof et === 'number' && et > 0) return mt / et;
                return -Infinity;
            }
            const v = getNested(act, col);
            if (v == null) return '';
            // Date-like
            if (col === 'start_date_local' && typeof v === 'string') {
                const t = Date.parse(v);
                return isNaN(t) ? String(v).toLowerCase() : t;
            }
            if (typeof v === 'number') return v;
            // moving_time/elapsed_time as numbers
            if ((col === 'moving_time' || col === 'elapsed_time') && typeof v === 'number') return v;
            // distance in meters -> numeric
            if (col === 'distance' && typeof v === 'number') return v;
            return String(v).toLowerCase();
        }
        return acts.slice().sort((a, b) => {
            const va = valueFor(a);
            const vb = valueFor(b);
            const na = typeof va === 'number';
            const nb = typeof vb === 'number';
            if (na && nb) {
                if (va === vb) return 0;
                return (va - vb) * factor;
            }
            // Fallback to string compare
            const sa = String(va || '');
            const sb = String(vb || '');
            return sa.localeCompare(sb) * factor;
        });
    }

    // Render the races table (filtered workout_type === 1)
    function renderRaceList(allRuns) {
        const container = document.getElementById('race-list');
        if (!container) return;
        const races = allRuns.filter(act => act.workout_type === 1);
        // provide default sort state on container
        if (!container.dataset.sortCol) { container.dataset.sortCol = 'start_date_local'; container.dataset.sortDir = 'desc'; }
        const sortCol = container.dataset.sortCol;
        const sortDir = container.dataset.sortDir || 'desc';
        const sortedRaces = sortActivities(races, sortCol, sortDir);
        if (races.length === 0) {
            container.innerHTML = `<tbody><tr><td colspan='${columns.length + 1}'>No races found in this period.</td></tr></tbody>`;
            return;
        }

        const columns = [
            { key: 'start_date_local', label: 'Date', format: (val) => val ? utils.formatDate(new Date(val)) : '' },
            { key: 'name', label: 'Race Name', format: (val) => val || '' },
            { key: 'distance', label: 'Distance', format: (val) => typeof val === 'number' ? (val / 1000).toFixed(2) + ' km' : '' },
            { key: 'moving_time', label: 'Time', format: (val) => typeof val === 'number' ? new Date(val * 1000).toISOString().substr(11, 8) : '' },
            {
                key: 'pace', label: 'Pace', format: (val, act) => {
                    if (act.distance && act.moving_time) {
                        const paceSec = act.moving_time / (act.distance / 1000);
                        const min = Math.floor(paceSec / 60);
                        const sec = Math.round(paceSec % 60);
                        return `${min}:${sec.toString().padStart(2, '0')}/km`;
                    }
                    return '';
                }
            },
            { key: 'average_heartrate', label: 'Avg HR', format: (val) => typeof val === 'number' ? Math.round(val) + ' bpm' : '' },
            { key: 'total_elevation_gain', label: 'Elevation', format: (val) => typeof val === 'number' ? val.toFixed(0) + ' m' : '' },
            { key: 'achievement_count', label: 'Achievements', format: (val) => val || 0 }
        ];

        const tableHeader = `<thead><tr>${columns.map(c => `<th class="sortable" data-col="${c.key}" style="white-space:nowrap; cursor:pointer;">${c.label} <span class="sort-indicator"></span></th>`).join('')}<th>Details</th></tr></thead>`;
        const tableBody = sortedRaces.map(act => {
            const cells = columns.map(col => {
                const val = getNested(act, col.key);
                const formatted = col.format(val, act);
                if (col.key === 'name') {
                    return `<td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${formatted}</td>`;
                }
                return `<td>${formatted}</td>`;
            }).join('');
            return `<tr>${cells}<td><a href="html/activity.html?id=${act.id}" target="_blank"><button>View</button></a></td></tr>`;
        }).join('');

        // Build full table HTML and wrap in a horizontally scrollable container with hover-scroll controls
        const tableHtml = `
            <div class="table-scroll-wrapper" style="position:relative;">
                <div style="overflow:auto; width:100%;">
                    <table style="border-collapse:collapse; table-layout:auto; width:100%;">
                        ${tableHeader}
                        <tbody>${tableBody}</tbody>
                    </table>
                </div>
                <div class="scroll-controls" style="position:absolute; top:6px; right:6px; display:flex; flex-direction:column; gap:6px;">
                    <div class="scroll-left" style="background:rgba(0,0,0,0.06); padding:6px; border-radius:4px; cursor:pointer;">◀</div>
                    <div class="scroll-right" style="background:rgba(0,0,0,0.06); padding:6px; border-radius:4px; cursor:pointer;">▶</div>
                </div>
            </div>`;

        container.innerHTML = tableHtml;
        // Attach hover/click scroll behavior
        const wrapper = container.querySelector('.table-scroll-wrapper > div');
        const btnLeft = container.querySelector('.scroll-left');
        const btnRight = container.querySelector('.scroll-right');
        let scrollInterval = null;
        function startScroll(dir) {
            stopScroll();
            scrollInterval = setInterval(() => { wrapper.scrollLeft += dir * 40; }, 40);
        }
        function stopScroll() { if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; } }
        btnLeft.addEventListener('mouseenter', () => startScroll(-1));
        btnLeft.addEventListener('mouseleave', stopScroll);
        btnRight.addEventListener('mouseenter', () => startScroll(1));
        btnRight.addEventListener('mouseleave', stopScroll);
        btnLeft.addEventListener('click', () => { wrapper.scrollLeft -= 300; });
        btnRight.addEventListener('click', () => { wrapper.scrollLeft += 300; });
        // Attach sorting click handlers for headers
        container.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                let dir = 'desc';
                if (container.dataset.sortCol === col) dir = container.dataset.sortDir === 'desc' ? 'asc' : 'desc';
                container.dataset.sortCol = col;
                container.dataset.sortDir = dir;
                renderRaceList(allRuns);
            });
            const ind = th.querySelector('.sort-indicator');
            if (container.dataset.sortCol === th.dataset.col) {
                ind.textContent = container.dataset.sortDir === 'desc' ? '▼' : '▲';
            } else {
                ind.textContent = '';
            }
        });
    }

    function renderPersonalBests(container, runs) {
        // --- Helpers local to PBs ---

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
                                ${medalEmojis[idx] || ''} ${utils.formatTime(run.time_at_target)}
                            </p>
                            <p style="font-size:1em; color:#333; margin:0;">Distance: ${run.actual_run_km.toFixed(2)} km</p>
                            <p style="font-size:0.9em; color:#555; margin:0;">Pace: ${utils.formatPace(run.time_at_target, run.actual_run_km)}</p>
                            <p style="font-size:0.8em; color:#777; margin:0.2em 0;">${utils.formatDate(new Date(run.start_date_local || run.start_date))}</p>
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
        const container = document.getElementById('all-runs-table');
        if (!container) return;

        if (allRuns.length === 0) {
            container.innerHTML = `<tbody><tr><td colspan='${columns.length + 1}'>No runs found in this period.</td></tr></tbody>`;
            return;
        }

        // Improved columns for better readability
        const columns = [
            { key: 'start_date_local', label: 'Date', format: (val) => val ? utils.formatDate(new Date(val)) : '' },
            { key: 'name', label: 'Name', format: (val) => val || '' },
            { key: 'distance', label: 'Distance', format: (val) => typeof val === 'number' ? (val / 1000).toFixed(2) + ' km' : '' },
            { key: 'moving_time', label: 'Time', format: (val) => typeof val === 'number' ? new Date(val * 1000).toISOString().substr(11, 8) : '' },
            {
                key: 'pace', label: 'Pace', format: (val, act) => {
                    if (act.distance && act.moving_time) {
                        const paceSec = act.moving_time / (act.distance / 1000);
                        const min = Math.floor(paceSec / 60);
                        const sec = Math.round(paceSec % 60);
                        return `${min}:${sec.toString().padStart(2, '0')}/km`;
                    }
                    return '';
                }
            },
            { key: 'average_heartrate', label: 'Avg HR', format: (val) => typeof val === 'number' ? Math.round(val) + ' bpm' : '' },
            { key: 'total_elevation_gain', label: 'Elevation', format: (val) => typeof val === 'number' ? val.toFixed(0) + ' m' : '' },
            { key: 'gear_name', label: 'Gear', format: (val) => val || '' }
        ];

        // Use container dataset to persist sort choice
        if (!container.dataset.sortCol) { container.dataset.sortCol = 'start_date_local'; container.dataset.sortDir = 'desc'; }
        const sortCol = container.dataset.sortCol;
        const sortDir = container.dataset.sortDir || 'desc';
        const sortedRuns = sortActivities(allRuns, sortCol, sortDir);
        let showAll = container.getAttribute('data-show-all') === 'true';
        const runsToShow = showAll ? sortedRuns : sortedRuns.slice(0, 10);

        const tableHeader = `<thead><tr>${columns.map(c => `<th class="sortable" data-col="${c.key}" style="white-space:nowrap; cursor:pointer;">${c.label} <span class="sort-indicator"></span></th>`).join('')}<th>Details</th></tr></thead>`;
        const tableBody = runsToShow.map(act => {
            const cells = columns.map(col => {
                const val = getNested(act, col.key);
                const formatted = col.format(val, act);
                if (col.key === 'name') {
                    return `<td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${formatted}</td>`;
                }
                return `<td>${formatted}</td>`;
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

        // Wrap table in scroll wrapper with hover controls
        const tableHtml = `
            <div class="table-scroll-wrapper" style="position:relative;">
                ${toggleBtn}
                <div style="overflow:auto; width:100%;">
                    <table style="border-collapse:collapse; table-layout:auto; width:100%;">
                        ${tableHeader}
                        <tbody>${tableBody}</tbody>
                    </table>
                </div>
                <div class="scroll-controls" style="position:absolute; top:6px; right:6px; display:flex; flex-direction:column; gap:6px;">
                    <div class="scroll-left" style="background:rgba(0,0,0,0.06); padding:6px; border-radius:4px; cursor:pointer;">◀</div>
                    <div class="scroll-right" style="background:rgba(0,0,0,0.06); padding:6px; border-radius:4px; cursor:pointer;">▶</div>
                </div>
            </div>`;

        container.innerHTML = tableHtml;
        // Attach hover/click scroll behavior
        const wrapper = container.querySelector('.table-scroll-wrapper > div');
        const btnLeft = container.querySelector('.scroll-left');
        const btnRight = container.querySelector('.scroll-right');
        let scrollInterval = null;
        function startScroll(dir) {
            stopScroll();
            scrollInterval = setInterval(() => { wrapper.scrollLeft += dir * 40; }, 40);
        }
        function stopScroll() { if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; } }
        if (btnLeft && btnRight && wrapper) {
            btnLeft.addEventListener('mouseenter', () => startScroll(-1));
            btnLeft.addEventListener('mouseleave', stopScroll);
            btnRight.addEventListener('mouseenter', () => startScroll(1));
            btnRight.addEventListener('mouseleave', stopScroll);
            btnLeft.addEventListener('click', () => { wrapper.scrollLeft -= 300; });
            btnRight.addEventListener('click', () => { wrapper.scrollLeft += 300; });
        }

        // Attach sorting click handlers for headers
        container.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                let dir = 'desc';
                if (container.dataset.sortCol === col) dir = container.dataset.sortDir === 'desc' ? 'asc' : 'desc';
                container.dataset.sortCol = col;
                container.dataset.sortDir = dir;
                renderAllRunsTable(allRuns);
            });
            const ind = th.querySelector('.sort-indicator');
            if (container.dataset.sortCol === th.dataset.col) {
                ind.textContent = container.dataset.sortDir === 'desc' ? '▼' : '▲';
            } else {
                ind.textContent = '';
            }
        });

        if (sortedRuns.length > 10) {
            document.getElementById('toggle-all-runs-btn').onclick = () => {
                container.setAttribute('data-show-all', showAll ? 'false' : 'true');
                renderAllRunsTable(allRuns); // Llama recursivamente con el nuevo estado
            };
        }
    }
}