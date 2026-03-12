import * as utils from './utils.js';

export function renderActivitiesTab(allActivities) {

    const tableEl = document.getElementById('activities-table');
    const filterContainer = document.getElementById('activity-filters');

    if (!tableEl) {
        console.error("Activities table element not found.");
        return;
    }

    if (!allActivities || allActivities.length === 0) {
        tableEl.innerHTML = `
            <thead><tr><th>No Activities</th></tr></thead>
            <tbody><tr><td>No activity data available.</td></tr></tbody>
        `;
        return;
    }

    // --------------------------------
    // 1. Build type filter (in English)
    // --------------------------------
    const activityTypes = [...new Set(allActivities.map(a => a.type || 'Unknown'))];

    if (filterContainer) {
        filterContainer.innerHTML = `
            <label style="font-weight:600; margin-right:1rem;">
                Type:
                <select id="activity-type-filter">
                    <option value="all">All</option>
                    ${activityTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
            </label>
        `;
    }

    const typeFilter = document.getElementById('activity-type-filter');

    // Keep sort state on the table element
    if (!tableEl.dataset.sortCol) {
        tableEl.dataset.sortCol = 'start_date_local';
        tableEl.dataset.sortDir = 'desc';
    }

    // --------------------------------
    // 2. Main render function
    // --------------------------------
    function render() {
        const selectedType = typeFilter ? typeFilter.value : 'all';

        let filtered = allActivities;

        if (selectedType !== 'all') {
            if (selectedType === 'Unknown') {
                filtered = allActivities.filter(a => !a.type);
            } else {
                filtered = allActivities.filter(a => (a.type || '').trim() === selectedType);
            }
        }

        renderActivitiesTable(filtered);
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', render);
    }

    // Initial render
    render();

    // --------------------------------
    // 3. Unified activities table
    // --------------------------------
    function renderActivitiesTable(activities) {

        if (!activities || activities.length === 0) {
            tableEl.innerHTML = `
                <thead><tr><th>No Activities</th></tr></thead>
                <tbody><tr><td>No activities found for this filter.</td></tr></tbody>
            `;
            return;
        }

        const columns = [
            { key: 'start_date_local', label: 'Date', format: v => v ? utils.formatDate(new Date(v)) : '' },
            { key: 'type', label: 'Type', format: v => v || '' },
            { key: 'name', label: 'Name', format: v => v || '' },
            { key: 'distance', label: 'Distance', format: v => typeof v === 'number' ? (v / 1000).toFixed(2) + ' km' : '' },
            { key: 'moving_time', label: 'Time', format: v => typeof v === 'number' ? new Date(v * 1000).toISOString().substr(11, 8) : '' },
            {
                key: 'pace',
                label: 'Pace',
                format: (v, act) => {
                    if (act.distance && act.moving_time && act.type === 'Run') {
                        const paceSec = act.moving_time / (act.distance / 1000);
                        const min = Math.floor(paceSec / 60);
                        const sec = Math.round(paceSec % 60);
                        return `${min}:${sec.toString().padStart(2, '0')}/km`;
                    }
                    return '';
                }
            },
            { key: 'average_heartrate', label: 'Avg HR', format: v => typeof v === 'number' ? Math.round(v) + ' bpm' : '' },
            { key: 'total_elevation_gain', label: 'Elevation', format: v => typeof v === 'number' ? v.toFixed(0) + ' m' : '' }
        ];

        const sortCol = tableEl.dataset.sortCol || 'start_date_local';
        const sortDir = tableEl.dataset.sortDir || 'desc';

        const sorted = sortActivities(activities, sortCol, sortDir);

        const theadHtml = `
            <thead>
                <tr>
                    ${columns.map(c =>
                        `<th class="sortable" data-col="${c.key}" style="cursor:pointer; white-space:nowrap;">
                            ${c.label} <span class="sort-indicator"></span>
                        </th>`
                    ).join('')}
                    <th>Details</th>
                </tr>
            </thead>
        `;

        const tbodyHtml = `
            <tbody>
                ${sorted.map(act => `
                    <tr>
                        ${columns.map(col => {
                            const val = act[col.key];
                            const formatted = col.format(val, act);
                            return `<td>${formatted}</td>`;
                        }).join('')}
                        <td><a href="html/activity-router.html?id=${act.id}" target="_blank"><button>View</button></a></td>
                    </tr>
                `).join('')}
            </tbody>
        `;

        // IMPORTANT: tableEl is the <table>, so we only inject thead+tbody, not another <table>
        tableEl.innerHTML = theadHtml + tbodyHtml;

        // Sorting handlers
        tableEl.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                let dir = 'desc';
                if (tableEl.dataset.sortCol === col) {
                    dir = tableEl.dataset.sortDir === 'desc' ? 'asc' : 'desc';
                }
                tableEl.dataset.sortCol = col;
                tableEl.dataset.sortDir = dir;
                render();
            });

            const ind = th.querySelector('.sort-indicator');
            if (tableEl.dataset.sortCol === th.dataset.col) {
                ind.textContent = tableEl.dataset.sortDir === 'desc' ? '▼' : '▲';
            } else {
                ind.textContent = '';
            }
        });
    }

    // --------------------------------
    // 4. Sorting helper
    // --------------------------------
    function sortActivities(acts, col, dir) {
        const factor = dir === 'desc' ? -1 : 1;
        return acts.slice().sort((a, b) => {
            const va = a[col];
            const vb = b[col];

            // Numbers first
            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * factor;
            }

            // Dates (start_date_local) as strings but sortable
            if (col === 'start_date_local') {
                const ta = va ? Date.parse(va) : 0;
                const tb = vb ? Date.parse(vb) : 0;
                return (ta - tb) * factor;
            }

            const sa = String(va || '').toLowerCase();
            const sb = String(vb || '').toLowerCase();
            return sa.localeCompare(sb) * factor;
        });
    }
}
