import * as utils from './utils.js';

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const SWIM_TYPES = new Set(['Swim', 'OpenWaterSwim']);
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide']);

function sportEmoji(type) { return utils.sportEmoji(type); }
function getType(a) { return (a.sport_type || a.type || 'Unknown').trim(); }

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtPaceSpeed(act) {
    if (!act.distance || !act.moving_time) return '–';
    const type = getType(act);
    if (SWIM_TYPES.has(type)) {
        const s = (act.moving_time / act.distance) * 100;
        return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}<small>/100m</small>`;
    }
    if (RUN_TYPES.has(type)) {
        const s = act.moving_time / (act.distance / 1000);
        return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}<small>/km</small>`;
    }
    // bike or other → speed in km/h
    const kmh = (act.distance / act.moving_time) * 3.6;
    return `${kmh.toFixed(1)}<small> km/h</small>`;
}

function fmtCadence(v, act) {
    if (typeof v !== 'number') return '–';
    const type = getType(act);
    const unit = RUN_TYPES.has(type) ? 'spm' : 'rpm';
    return `${Math.round(v)}<small> ${unit}</small>`;
}

function fmtKcal(v, act) {
    if (typeof act.calories === 'number' && act.calories > 0) return `${Math.round(act.calories)}<small> kcal</small>`;
    if (typeof v === 'number' && v > 0) return `${Math.round(v * 0.239)}<small> kcal</small>`;
    return '–';
}

// ─── Sort value extractor ─────────────────────────────────────────────────────
function sortVal(act, col) {
    if (col === 'type') return getType(act);
    if (col === 'pace_speed') {
        if (!act.distance || !act.moving_time) return Infinity;
        const type = getType(act);
        if (SWIM_TYPES.has(type)) return (act.moving_time / act.distance) * 100; // sec/100m (lower = faster)
        if (RUN_TYPES.has(type)) return act.moving_time / (act.distance / 1000); // sec/km
        return -((act.distance / act.moving_time) * 3.6); // bike: negate so desc = fastest first
    }
    const v = act[col];
    return v === undefined || v === null ? (col === 'start_date_local' ? '' : -Infinity) : v;
}

// ─── Column definitions ───────────────────────────────────────────────────────
const COLUMNS = [
    {
        key: 'start_date_local', label: 'Date',
        format: (v) => {
            if (!v) return '–';
            const d = new Date(v);
            return `${utils.formatDate(d)}<br><small style="opacity:.55">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
        }
    },
    {
        key: 'type', label: 'Sport',
        format: (v, a) => { const t = getType(a); return `${sportEmoji(t)} <small>${t}</small>`; }
    },
    {
        key: 'name', label: 'Name',
        format: (v, a) => `<a class="act-name-link" href="html/activity-router.html?id=${a.id}" target="_blank">${v || '—'}</a>`
    },
    {
        key: 'distance', label: 'Distance',
        format: v => typeof v === 'number' && v > 0 ? `${(v / 1000).toFixed(2)}<small> km</small>` : '–'
    },
    {
        key: 'moving_time', label: 'Duration',
        format: v => typeof v === 'number' ? utils.formatTime(v) : '–'
    },
    {
        key: 'pace_speed', label: 'Pace / Speed',
        format: (v, a) => fmtPaceSpeed(a)
    },
    {
        key: 'average_heartrate', label: 'Avg HR',
        format: v => typeof v === 'number' ? `${Math.round(v)}<small> bpm</small>` : '–'
    },
    {
        key: 'max_heartrate', label: 'Max HR',
        format: v => typeof v === 'number' ? `${Math.round(v)}<small> bpm</small>` : '–'
    },
    {
        key: 'total_elevation_gain', label: 'D+',
        format: v => typeof v === 'number' ? `${v.toFixed(0)}<small> m</small>` : '–'
    },
    {
        key: 'average_cadence', label: 'Cadence',
        format: (v, a) => fmtCadence(v, a)
    },
    {
        key: 'average_watts', label: 'Power',
        format: v => typeof v === 'number' && v > 0 ? `${Math.round(v)}<small> W</small>` : '–'
    },
    {
        key: 'kilojoules', label: 'Energy',
        format: (v, a) => fmtKcal(v, a)
    },
    {
        key: 'tss', label: 'TSS',
        format: v => typeof v === 'number' ? Math.round(v) : '–'
    },
];

// ─── Main export ──────────────────────────────────────────────────────────────
export function renderActivitiesTab(allActivities) {
    const tableEl = document.getElementById('activities-table');
    const filterEl = document.getElementById('activity-filters');
    const counterEl = document.getElementById('act-counter');

    if (!tableEl) return;

    if (!allActivities || allActivities.length === 0) {
        tableEl.innerHTML = `<thead><tr><th>No Activities</th></tr></thead>
            <tbody><tr><td>No activity data available.</td></tr></tbody>`;
        return;
    }

    // ── Persistent state (survive re-renders) ──
    if (!tableEl._actState) {
        tableEl._actState = {
            sortCol: 'start_date_local',
            sortDir: 'desc',
            filters: {
                type: [], name: '', dateFrom: '', dateTo: '',
                distMin: '', distMax: '', durMin: '', durMax: '',
                hrMin: '', hrMax: '', tssMin: '', tssMax: ''
            }
        };
    }
    const state = tableEl._actState;

    // ── Build filter UI once ──────────────────────────────────────────────────
    if (filterEl && !filterEl._built) {
        filterEl._built = true;

        const typeCounts = allActivities.reduce((acc, a) => {
            const t = getType(a);
            acc[t] = (acc[t] || 0) + 1;
            return acc;
        }, {});
        const types = Object.entries(typeCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([type]) => type);
        const dists = allActivities.map(a => a.distance).filter(Boolean);
        const durs = allActivities.map(a => a.moving_time).filter(Boolean);
        const hrs = allActivities.map(a => a.average_heartrate).filter(Boolean);
        const tssList = allActivities.map(a => a.tss).filter(v => v != null && v >= 0);

        const maxDist = dists.length ? Math.ceil(Math.max(...dists) / 1000) : 200;
        const maxDur = durs.length ? Math.ceil(Math.max(...durs) / 60) : 600;
        const maxHR = hrs.length ? Math.ceil(Math.max(...hrs)) : 220;
        const minHR = hrs.length ? Math.floor(Math.min(...hrs)) : 40;
        const maxTSS = tssList.length ? Math.ceil(Math.max(...tssList)) : 300;

        filterEl.innerHTML = `
        <div class="act-filters">
            <div class="act-filter-row">
                <label class="act-filter-label">
                    Sport
                    <select id="flt-type" multiple size="${Math.min(8, Math.max(4, types.length))}">
                        ${types.map(t => `<option value="${t}">${sportEmoji(t)} ${t} (${typeCounts[t]})</option>`).join('')}
                    </select>
                </label>
                <label class="act-filter-label">
                    Name
                    <input id="flt-name" type="text" placeholder="Search…">
                </label>
                <label class="act-filter-label">
                    Date from
                    <input id="flt-date-from" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" title="Format: dd/mm/yyyy">
                </label>
                <label class="act-filter-label">
                    Date to
                    <input id="flt-date-to" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" title="Format: dd/mm/yyyy">
                </label>
                <button id="flt-reset" class="act-reset-btn" title="Clear all filters">✕ Reset</button>
            </div>
            <div class="act-filter-row">
                <label class="act-filter-label">
                    Distance (km)
                    <span class="act-range-pair">
                        <input id="flt-dist-min" type="number" min="0" max="${maxDist}" placeholder="Min">
                        <span>–</span>
                        <input id="flt-dist-max" type="number" min="0" max="${maxDist}" placeholder="Max">
                    </span>
                </label>
                <label class="act-filter-label">
                    Duration (min)
                    <span class="act-range-pair">
                        <input id="flt-dur-min" type="number" min="0" max="${maxDur}" placeholder="Min">
                        <span>–</span>
                        <input id="flt-dur-max" type="number" min="0" max="${maxDur}" placeholder="Max">
                    </span>
                </label>
                <label class="act-filter-label">
                    Avg HR (bpm)
                    <span class="act-range-pair">
                        <input id="flt-hr-min" type="number" min="${minHR}" max="${maxHR}" placeholder="Min">
                        <span>–</span>
                        <input id="flt-hr-max" type="number" min="${minHR}" max="${maxHR}" placeholder="Max">
                    </span>
                </label>
                <label class="act-filter-label">
                    TSS
                    <span class="act-range-pair">
                        <input id="flt-tss-min" type="number" min="0" max="${maxTSS}" placeholder="Min">
                        <span>–</span>
                        <input id="flt-tss-max" type="number" min="0" max="${maxTSS}" placeholder="Max">
                    </span>
                </label>
            </div>
        </div>`;

        const IDS = ['flt-type', 'flt-name', 'flt-date-from', 'flt-date-to',
            'flt-dist-min', 'flt-dist-max', 'flt-dur-min', 'flt-dur-max',
            'flt-hr-min', 'flt-hr-max', 'flt-tss-min', 'flt-tss-max'];

        const typeSelect = document.getElementById('flt-type');
        Array.from(typeSelect.options).forEach(opt => { opt.selected = true; });

        function readAndRender() {
            const f = state.filters;
            f.type = Array.from(document.getElementById('flt-type').selectedOptions || []).map(opt => opt.value);
            f.name = document.getElementById('flt-name').value.trim().toLowerCase();
            f.dateFrom = utils.parseDateInputToIso(document.getElementById('flt-date-from').value);
            f.dateTo = utils.parseDateInputToIso(document.getElementById('flt-date-to').value);
            f.distMin = document.getElementById('flt-dist-min').value;
            f.distMax = document.getElementById('flt-dist-max').value;
            f.durMin = document.getElementById('flt-dur-min').value;
            f.durMax = document.getElementById('flt-dur-max').value;
            f.hrMin = document.getElementById('flt-hr-min').value;
            f.hrMax = document.getElementById('flt-hr-max').value;
            f.tssMin = document.getElementById('flt-tss-min').value;
            f.tssMax = document.getElementById('flt-tss-max').value;
            render();
        }

        IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', readAndRender);
        });

        document.getElementById('flt-reset').addEventListener('click', () => {
            const typeEl = document.getElementById('flt-type');
            Array.from(typeEl.options).forEach(opt => { opt.selected = true; });
            ['flt-name', 'flt-date-from', 'flt-date-to',
                'flt-dist-min', 'flt-dist-max', 'flt-dur-min', 'flt-dur-max',
                'flt-hr-min', 'flt-hr-max', 'flt-tss-min', 'flt-tss-max'
            ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            const f = state.filters;
            Object.keys(f).forEach(k => f[k] = k === 'type' ? types.slice() : '');
            render();
        });

        state.filters.type = types.slice();
    }

    // ── Filter logic ──────────────────────────────────────────────────────────
    function applyFilters(acts) {
        const f = state.filters;
        return acts.filter(a => {
            if (Array.isArray(f.type) && f.type.length > 0 && !f.type.includes(getType(a))) return false;
            if (f.name && !(a.name || '').toLowerCase().includes(f.name)) return false;
            const date = (a.start_date_local || '').slice(0, 10);
            if (f.dateFrom && date < f.dateFrom) return false;
            if (f.dateTo && date > f.dateTo) return false;
            const km = (a.distance || 0) / 1000;
            if (f.distMin !== '' && km < +f.distMin) return false;
            if (f.distMax !== '' && km > +f.distMax) return false;
            const durMin = (a.moving_time || 0) / 60;
            if (f.durMin !== '' && durMin < +f.durMin) return false;
            if (f.durMax !== '' && durMin > +f.durMax) return false;
            const hr = a.average_heartrate;
            if (f.hrMin !== '' && (hr == null || hr < +f.hrMin)) return false;
            if (f.hrMax !== '' && (hr == null || hr > +f.hrMax)) return false;
            const tss = a.tss;
            if (f.tssMin !== '' && (tss == null || tss < +f.tssMin)) return false;
            if (f.tssMax !== '' && (tss == null || tss > +f.tssMax)) return false;
            return true;
        });
    }

    // ── Sort logic ────────────────────────────────────────────────────────────
    function applySort(acts) {
        const { sortCol, sortDir } = state;
        const factor = sortDir === 'desc' ? -1 : 1;
        return acts.slice().sort((a, b) => {
            const va = sortVal(a, sortCol);
            const vb = sortVal(b, sortCol);
            if (sortCol === 'start_date_local')
                return (Date.parse(va || 0) - Date.parse(vb || 0)) * factor;
            if (typeof va === 'number' && typeof vb === 'number')
                return (va - vb) * factor;
            return String(va || '').localeCompare(String(vb || '')) * factor;
        });
    }

    // ── Render table ──────────────────────────────────────────────────────────
    function render() {
        const filtered = applyFilters(allActivities);
        const sorted = applySort(filtered);
        const { sortCol, sortDir } = state;

        const theadHtml = `<thead><tr>
            ${COLUMNS.map(c => {
            const active = sortCol === c.key;
            const arrow = active ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';
            return `<th class="sortable${active ? ' act-sort-active' : ''}" data-col="${c.key}">${c.label}${arrow}</th>`;
        }).join('')}
        </tr></thead>`;

        const emptyRow = `<tr><td colspan="${COLUMNS.length}" class="act-empty">
            No activities match the current filters</td></tr>`;

        const tbodyHtml = `<tbody>${sorted.length === 0 ? emptyRow : sorted.map(act => `
            <tr>
                ${COLUMNS.map(col => `<td>${col.format(act[col.key], act)}</td>`).join('')}
            </tr>`).join('')}
        </tbody>`;

        tableEl.innerHTML = theadHtml + tbodyHtml;

        // Sort click handlers
        tableEl.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                state.sortDir = (state.sortCol === col && state.sortDir === 'desc') ? 'asc' : 'desc';
                state.sortCol = col;
                render();
            });
        });

        // Row counter
        if (counterEl) counterEl.textContent = `${sorted.length} / ${allActivities.length} activities`;
    }

    render();
}
