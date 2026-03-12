import * as utils from './utils.js';

export function renderActivitiesTab(allActivities) {

    const tableContainer = document.getElementById('activities-table');
    const filterContainer = document.getElementById('activity-filters');

    if (!tableContainer) {
        console.error("Activities table container not found.");
        return;
    }

    if (!allActivities || allActivities.length === 0) {
        tableContainer.innerHTML = `
            <thead><tr><th>No Activities</th></tr></thead>
            <tbody><tr><td>No activity data available.</td></tr></tbody>
        `;
        return;
    }

    // -----------------------------
    // 1. Crear filtros por tipo
    // -----------------------------
    const activityTypes = [...new Set(allActivities.map(a => a.type || "Unknown"))];

    filterContainer.innerHTML = `
        <label style="font-weight:600; margin-right:1rem;">
            Tipo:
            <select id="activity-type-filter">
                <option value="all">Todos</option>
                ${activityTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
        </label>
    `;

    const typeFilter = document.getElementById('activity-type-filter');

    // -----------------------------
    // 2. Render principal
    // -----------------------------
    function render() {
        const selectedType = typeFilter.value;

        const filtered = selectedType === "all"
            ? allActivities
            : allActivities.filter(a => a.type === selectedType);

        renderActivitiesTable(filtered);
    }

    typeFilter.addEventListener('change', render);

    // Render inicial
    render();

    // -----------------------------
    // 3. Tabla unificada
    // -----------------------------
    function renderActivitiesTable(activities) {

        if (activities.length === 0) {
            tableContainer.innerHTML = `
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

        // Sorting state
        if (!tableContainer.dataset.sortCol) {
            tableContainer.dataset.sortCol = 'start_date_local';
            tableContainer.dataset.sortDir = 'desc';
        }

        const sortCol = tableContainer.dataset.sortCol;
        const sortDir = tableContainer.dataset.sortDir;

        const sorted = sortActivities(activities, sortCol, sortDir);

        const header = `
            <thead>
                <tr>
                    ${columns.map(c =>
                        `<th class="sortable" data-col="${c.key}" style="cursor:pointer;">
                            ${c.label} <span class="sort-indicator"></span>
                        </th>`
                    ).join('')}
                    <th>Details</th>
                </tr>
            </thead>
        `;

        const body = sorted.map(act => `
            <tr>
                ${columns.map(col => {
                    const val = act[col.key];
                    const formatted = col.format(val, act);
                    return `<td>${formatted}</td>`;
                }).join('')}
                <td><a href="html/activity-router.html?id=${act.id}" target="_blank"><button>View</button></a></td>
            </tr>
        `).join('');

        tableContainer.innerHTML = `
            <table style="width:100%; border-collapse:collapse;">
                ${header}
                <tbody>${body}</tbody>
            </table>
        `;

        // Sorting handlers
        tableContainer.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                let dir = 'desc';
                if (tableContainer.dataset.sortCol === col) {
                    dir = tableContainer.dataset.sortDir === 'desc' ? 'asc' : 'desc';
                }
                tableContainer.dataset.sortCol = col;
                tableContainer.dataset.sortDir = dir;
                render();
            });

            const ind = th.querySelector('.sort-indicator');
            if (tableContainer.dataset.sortCol === th.dataset.col) {
                ind.textContent = tableContainer.dataset.sortDir === 'desc' ? '▼' : '▲';
            } else {
                ind.textContent = '';
            }
        });
    }

    // -----------------------------
    // Sorting helper (tu versión)
    // -----------------------------
    function sortActivities(acts, col, dir) {
        const factor = dir === 'desc' ? -1 : 1;
        return acts.slice().sort((a, b) => {
            const va = a[col];
            const vb = b[col];

            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * factor;
            }

            const sa = String(va || '').toLowerCase();
            const sb = String(vb || '').toLowerCase();
            return sa.localeCompare(sb) * factor;
        });
    }
}
