import * as utils from './utils.js';

// ─── Palette: [hue, saturation] for HSL ──────────────────────────────────────
const SPORT_PALETTE = {
    Run: [16, 90], TrailRun: [25, 85], VirtualRun: [12, 80],
    Ride: [215, 80], VirtualRide: [210, 70], GravelRide: [200, 75],
    MountainBikeRide: [190, 80], EBikeRide: [205, 65],
    Swim: [185, 85], OpenWaterSwim: [195, 80],
    Walk: [142, 65], Hike: [130, 60],
    Workout: [270, 70], WeightTraining: [280, 65], Yoga: [310, 60],
    AlpineSki: [240, 75], NordicSki: [230, 70], Snowboard: [245, 80],
    Rowing: [165, 75], Kayaking: [175, 70],
    Crossfit: [0, 75], IceSkate: [220, 60],
};


const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getType(a) { return (a.sport_type || a.type || 'Unknown').trim(); }
function emoji(t) { return utils.sportEmoji(t); }

/** Local-timezone YYYY-MM-DD string (avoids UTC offset bugs) */
function toYMD(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Monday-based ISO week key "YYYY-WW" */
function weekKey(dateStr) {
    const dt = new Date(dateStr);
    return `${dt.getFullYear()}-${String(utils.getISOWeek(dt)).padStart(2, '0')}`;
}

/**
 * Color for a sport at a given intensity [0–1].
 * intensity 0 → very pale, intensity 1 → rich dark.
 */
function sportColor(type, intensity = 0.6) {
    const [h, s] = SPORT_PALETTE[type] || [0, 0];
    const l = Math.round(94 - intensity * 56);
    return `hsl(${h},${s}%,${l}%)`;
}
function sportColorDark(type) {
    const [h, s] = SPORT_PALETTE[type] || [0, 0];
    return `hsl(${h},${s}%,26%)`;
}

/** Intensity [0–1] from moving_time; 2 h = max */
function actIntensity(act) { return Math.min(1, (act.moving_time || 0) / 7200); }

/** Group activities by YYYY-MM-DD */
function groupByDate(acts) {
    const m = {};
    for (const a of acts) {
        const d = (a.start_date_local || '').slice(0, 10);
        if (d) (m[d] = m[d] || []).push(a);
    }
    return m;
}

/** Monday of the week containing dt */
function mondayOf(dt) {
    const d = new Date(dt);
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    return d;
}

// ─── Streak calculation ───────────────────────────────────────────────────────
function computeStreaks(byDate) {
    const dates = Object.keys(byDate).sort();
    if (!dates.length) return { day: { current: 0, longest: 0 }, week: { current: 0, longest: 0 } };

    // Day streaks
    let dLong = 1, tmp = 1;
    for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        tmp = diff === 1 ? tmp + 1 : 1;
        dLong = Math.max(dLong, tmp);
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last = new Date(dates[dates.length - 1]); last.setHours(0, 0, 0, 0);
    const gapDays = Math.round((today - last) / 86400000);
    let dCurrent = 0;
    if (gapDays <= 1) {
        dCurrent = 1;
        for (let i = dates.length - 2; i >= 0; i--) {
            if ((new Date(dates[i + 1]) - new Date(dates[i])) / 86400000 === 1) dCurrent++;
            else break;
        }
    }

    // Week streaks
    function weeksConsec(w1, w2) {
        const [y1, n1] = w1.split('-').map(Number);
        const [y2, n2] = w2.split('-').map(Number);
        return (y1 === y2 && n2 - n1 === 1) || (y2 === y1 + 1 && n1 >= 52 && n2 === 1);
    }
    const weekArr = [...new Set(dates.map(weekKey))].sort();
    let wLong = 1, wTmp = 1;
    for (let i = 1; i < weekArr.length; i++) {
        wTmp = weeksConsec(weekArr[i - 1], weekArr[i]) ? wTmp + 1 : 1;
        wLong = Math.max(wLong, wTmp);
    }
    const nowWK = weekKey(toYMD(today));
    const prevWK = weekKey(toYMD(new Date(+today - 7 * 86400000)));
    const lastWK = weekArr[weekArr.length - 1];
    let wCurrent = 0;
    if (lastWK === nowWK || lastWK === prevWK) {
        wCurrent = 1;
        for (let i = weekArr.length - 2; i >= 0; i--) {
            if (weeksConsec(weekArr[i], weekArr[i + 1])) wCurrent++;
            else break;
        }
    }

    return {
        day: { current: dCurrent, longest: dLong },
        week: { current: wCurrent, longest: wLong },
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function renderCalendarTab(allActivities) {
    const root = document.getElementById('calendar-tab');
    if (!root) return;

    if (!allActivities || allActivities.length === 0) {
        root.innerHTML = '<p style="padding:2rem;opacity:.5">No activity data available.</p>';
        return;
    }

    const now = new Date();

    // Persistent state
    if (!root._calState) {
        root._calState = {
            view: 'month',
            year: now.getFullYear(),
            month: now.getMonth(),
            weekOf: new Date(now),
            filterType: 'all',
        };
    }
    const state = root._calState;
    const types = [...new Set(allActivities.map(getType))].sort();

    // ── Build shell HTML (done once) ─────────────────────────────────────────
    root.innerHTML = `
    <div class="cal-root">
        <div class="cal-header">
            <div class="cal-controls-left">
                <div class="cal-view-btns">
                    <button class="cal-view-btn" data-view="week">Week</button>
                    <button class="cal-view-btn" data-view="month">Month</button>
                    <button class="cal-view-btn" data-view="year">Year</button>
                </div>
                <select class="cal-type-filter">
                    <option value="all">All sports</option>
                    ${types.map(t => `<option value="${t}">${emoji(t)} ${t}</option>`).join('')}
                </select>
            </div>
            <div class="cal-nav">
                <button class="cal-nav-btn" id="cal-prev">‹</button>
                <span class="cal-title" id="cal-title"></span>
                <button class="cal-nav-btn" id="cal-next">›</button>
                <button class="cal-nav-btn cal-today-btn" id="cal-today">Today</button>
            </div>
        </div>
        <div id="cal-streaks"></div>
        <div id="cal-body"></div>
        <div class="cal-legend">
            ${types.map(t => `
            <span class="cal-legend-item">
                <span class="cal-legend-dot" style="background:${sportColor(t, 0.6)}"></span>
                ${emoji(t)} ${t}
            </span>`).join('')}
        </div>
    </div>`;

    // ── Wire controls ────────────────────────────────────────────────────────
    root.querySelectorAll('.cal-view-btn').forEach(b =>
        b.addEventListener('click', () => { state.view = b.dataset.view; renderAll(); })
    );
    root.querySelector('.cal-type-filter').value = state.filterType;
    root.querySelector('.cal-type-filter').addEventListener('change', e => {
        state.filterType = e.target.value; renderAll();
    });
    root.querySelector('#cal-prev').addEventListener('click', () => navigate(-1));
    root.querySelector('#cal-next').addEventListener('click', () => navigate(+1));
    root.querySelector('#cal-today').addEventListener('click', () => {
        state.year = now.getFullYear(); state.month = now.getMonth(); state.weekOf = new Date(now);
        renderAll();
    });

    function navigate(dir) {
        if (state.view === 'month') { state.month += dir; if (state.month < 0) { state.month = 11; state.year--; } if (state.month > 11) { state.month = 0; state.year++; } }
        else if (state.view === 'year') { state.year += dir; }
        else if (state.view === 'week') { state.weekOf = new Date(+state.weekOf + dir * 7 * 86400000); }
        renderAll();
    }

    // ── renderAll ────────────────────────────────────────────────────────────
    function renderAll() {
        const filtered = state.filterType === 'all' ? allActivities
            : allActivities.filter(a => getType(a) === state.filterType);
        const byDate = groupByDate(filtered);
        const streaks = computeStreaks(byDate);

        // View buttons active state
        root.querySelectorAll('.cal-view-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.view === state.view)
        );
        // Type filter sync
        root.querySelector('.cal-type-filter').value = state.filterType;

        // Title
        const titleEl = root.querySelector('#cal-title');
        if (state.view === 'month') {
            const start = new Date(state.year, state.month, 1);
            const end = new Date(state.year, state.month + 1, 0);
            titleEl.textContent = `${utils.formatDate(start)} - ${utils.formatDate(end)}`;
        }
        else if (state.view === 'year') titleEl.textContent = `${state.year}`;
        else {
            const ws = mondayOf(state.weekOf);
            const we = new Date(+ws + 6 * 86400000);
            titleEl.textContent = `${utils.formatDate(ws)} - ${utils.formatDate(we)}`;
        }

        renderStreaks(streaks, byDate);

        const bodyEl = root.querySelector('#cal-body');
        // Remove any lingering day-detail panel
        root.querySelector('.cal-day-detail')?.remove();

        if (state.view === 'month') renderMonth(bodyEl, byDate);
        else if (state.view === 'year') renderYear(bodyEl, byDate, filtered);
        else renderWeek(bodyEl, byDate);
    }

    // ── Streaks banner ────────────────────────────────────────────────────────
    function renderStreaks(streaks, byDate) {
        const todayStr = toYMD(new Date());
        const todayActs = (byDate[todayStr] || []).length;
        root.querySelector('#cal-streaks').innerHTML = `
        <div class="cal-streak-cards">
            <div class="cal-streak-card">
                <div class="cal-streak-num">${streaks.day.current}${streaks.day.current > 0 ? ' 🔥' : ''}</div>
                <div class="cal-streak-label">Day streak</div>
            </div>
            <div class="cal-streak-card">
                <div class="cal-streak-num">${streaks.day.longest}</div>
                <div class="cal-streak-label">Best day streak</div>
            </div>
            <div class="cal-streak-card">
                <div class="cal-streak-num">${streaks.week.current}${streaks.week.current > 0 ? ' 📆' : ''}</div>
                <div class="cal-streak-label">Week streak</div>
            </div>
            <div class="cal-streak-card">
                <div class="cal-streak-num">${streaks.week.longest}</div>
                <div class="cal-streak-label">Best week streak</div>
            </div>
            <div class="cal-streak-card">
                <div class="cal-streak-num">${todayActs > 0 ? todayActs + ' 💪' : '0'}</div>
                <div class="cal-streak-label">Today</div>
            </div>
        </div>`;
    }

    // ── Monthly view ─────────────────────────────────────────────────────────
    function renderMonth(el, byDate) {
        const firstDay = new Date(state.year, state.month, 1);
        const lastDay = new Date(state.year, state.month + 1, 0);
        const todayStr = toYMD(new Date());
        const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

        let html = `<div class="cal-month-grid">
            ${DAYS_SHORT.map(d => `<div class="cal-dow-header">${d}</div>`).join('')}`;

        for (let i = 0; i < startDow; i++) html += `<div class="cal-day-empty"></div>`;

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dt = new Date(state.year, state.month, day);
            const dateStr = toYMD(dt);
            const acts = byDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isFuture = dt > new Date();

            html += `<div class="cal-day${isToday ? ' cal-today' : ''}${isFuture ? ' cal-future' : ''}" data-date="${dateStr}">
                <div class="cal-day-num">${day}</div>
                <div class="cal-day-pills">`;

            for (const a of acts.slice(0, 4)) {
                const t = getType(a);
                const bg = sportColor(t, actIntensity(a));
                const km = a.distance ? `${(a.distance / 1000).toFixed(1)} km` : '';
                html += `<div class="cal-pill" style="background:${bg};color:${sportColorDark(t)}" title="${a.name}">${emoji(t)} ${km}</div>`;
            }
            if (acts.length > 4) html += `<div class="cal-pill cal-pill-more">+${acts.length - 4} more</div>`;
            html += `</div></div>`;
        }
        html += `</div>`;
        el.innerHTML = html;

        el.querySelectorAll('.cal-day[data-date]').forEach(c =>
            c.addEventListener('click', () => showDayDetail(c.dataset.date, byDate[c.dataset.date] || []))
        );
    }

    // ── Weekly view ──────────────────────────────────────────────────────────
    function renderWeek(el, byDate) {
        const wStart = mondayOf(state.weekOf);
        const todayStr = toYMD(new Date());

        let html = `<div class="cal-week-grid">`;

        for (let i = 0; i < 7; i++) {
            const dt = new Date(+wStart + i * 86400000);
            const dateStr = toYMD(dt);
            const acts = byDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isFuture = dt > new Date();

            const totalKm = acts.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
            const totalTime = acts.reduce((s, a) => s + (a.moving_time || 0), 0);
            const daySummary = acts.length
                ? `<span class="cal-week-day-total">${totalKm.toFixed(1)} km · ${utils.formatTime(totalTime)}</span>`
                : '';

            html += `<div class="cal-week-col${isToday ? ' cal-today' : ''}${isFuture ? ' cal-future' : ''}">
                <div class="cal-week-day-header">
                    <span class="cal-week-dow">${DAYS_SHORT[i]}</span>
                    <span class="cal-week-date">${utils.formatDate(dt)}</span>
                    ${daySummary}
                </div>
                <div class="cal-week-acts">`;

            if (acts.length === 0) {
                html += `<div class="cal-week-rest">Rest day</div>`;
            } else {
                for (const a of acts) {
                    const t = getType(a);
                    const bg = sportColor(t, actIntensity(a));
                    const km = a.distance ? `${(a.distance / 1000).toFixed(1)} km` : '';
                    const dur = a.moving_time ? utils.formatTime(a.moving_time) : '';
                    const hr = a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : '';
                    const tss = a.tss ? `TSS ${Math.round(a.tss)}` : '';
                    html += `<a class="cal-week-activity" href="html/activity-router.html?id=${a.id}" target="_blank"
                        style="background:${bg};border-left:3px solid ${sportColorDark(t)}">
                        <div class="cal-week-act-sport">${emoji(t)} ${t}</div>
                        <div class="cal-week-act-name">${a.name || '—'}</div>
                        <div class="cal-week-act-stats">${[km, dur, hr, tss].filter(Boolean).join(' · ')}</div>
                    </a>`;
                }
            }
            html += `</div></div>`;
        }
        html += `</div>`;
        el.innerHTML = html;
    }

    // ── Yearly heatmap ────────────────────────────────────────────────────────
    function renderYear(el, byDate, filteredActs) {
        const jan1 = new Date(state.year, 0, 1);
        const dec31 = new Date(state.year, 11, 31);
        const CELL = 13, GAP = 2, COL_W = CELL + GAP;

        // Grid bounds: Mon before Jan 1 → Sun after Dec 31
        const gStart = new Date(jan1);
        gStart.setDate(gStart.getDate() - (jan1.getDay() + 6) % 7);
        const gEnd = new Date(dec31);
        gEnd.setDate(gEnd.getDate() + (6 - (dec31.getDay() + 6) % 7));

        // Build weeks
        const weeks = [];
        for (let d = new Date(gStart); d <= gEnd;) {
            const week = [];
            for (let i = 0; i < 7; i++) { week.push(new Date(d)); d.setDate(d.getDate() + 1); }
            weeks.push(week);
        }

        // Month labels
        const monthLabels = [];
        weeks.forEach((w, wi) => {
            const m = w[0].getMonth();
            if (wi === 0 || weeks[wi - 1][0].getMonth() !== m)
                monthLabels.push({ wi, label: MONTHS_FULL[m].slice(0, 3) });
        });

        const monthsHtml = monthLabels.map(ml =>
            `<span style="position:absolute;left:${ml.wi * COL_W}px">${ml.label}</span>`
        ).join('');

        const weeksHtml = weeks.map(week => {
            const cells = week.map(dt => {
                const dateStr = toYMD(dt);
                const acts = byDate[dateStr] || [];
                const inYear = dt.getFullYear() === state.year;

                if (!inYear || acts.length === 0)
                    return `<div class="cal-year-cell cal-year-empty" title="${inYear ? utils.formatDate(dateStr) : ''}"></div>`;

                // Dominant sport by time
                const byTime = {};
                let totalSec = 0;
                for (const a of acts) {
                    const t = getType(a);
                    byTime[t] = (byTime[t] || 0) + (a.moving_time || 0);
                    totalSec += (a.moving_time || 0);
                }
                const dominant = Object.entries(byTime).sort((a, b) => b[1] - a[1])[0][0];
                const intensity = Math.min(1, totalSec / 7200);
                const bg = sportColor(dominant, intensity);
                const km = acts.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
                const names = acts.map(a => `${emoji(getType(a))} ${a.name}`).join('\n');
                const tip = `${utils.formatDate(dateStr)}\n${names}\n${km.toFixed(1)} km · ${utils.formatTime(totalSec)}`;

                return `<div class="cal-year-cell" style="background:${bg}" data-date="${dateStr}" title="${tip}"></div>`;
            }).join('');
            return `<div class="cal-year-week">${cells}</div>`;
        }).join('');

        // Year summary
        const yActs = filteredActs.filter(a => (a.start_date_local || '').startsWith(`${state.year}`));
        const totalKm = (yActs.reduce((s, a) => s + (a.distance || 0), 0) / 1000).toFixed(0);
        const totalH = (yActs.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600).toFixed(0);
        const totalTSS = yActs.reduce((s, a) => s + (a.tss || 0), 0).toFixed(0);
        const daysActive = new Set(yActs.map(a => (a.start_date_local || '').slice(0, 10))).size;

        el.innerHTML = `
        <div class="cal-year-outer">
            <div class="cal-year-dow-col">
                ${DAYS_SHORT.map((d, i) => `<div class="cal-year-dow">${i % 2 === 0 ? d : ''}</div>`).join('')}
            </div>
            <div class="cal-year-heatmap">
                <div class="cal-year-months-row" style="position:relative;height:18px;margin-bottom:3px;font-size:.62rem;color:var(--text-light)">${monthsHtml}</div>
                <div class="cal-year-weeks">${weeksHtml}</div>
            </div>
        </div>
        <div class="cal-year-summary">
            <span>${yActs.length} activities</span>
            <span>${totalKm} km</span>
            <span>${totalH} h</span>
            <span>${daysActive} active days</span>
            <span>${totalTSS} TSS</span>
        </div>`;

        el.querySelectorAll('.cal-year-cell[data-date]').forEach(c =>
            c.addEventListener('click', () => showDayDetail(c.dataset.date, byDate[c.dataset.date] || []))
        );
    }

    // ── Day detail panel ─────────────────────────────────────────────────────
    function showDayDetail(dateStr, acts) {
        // Toggle
        const existing = root.querySelector('.cal-day-detail');
        if (existing) {
            const was = existing.dataset.date;
            existing.remove();
            if (was === dateStr) return;
        }
        if (acts.length === 0) return;

        const dt = new Date(dateStr);
        const panel = document.createElement('div');
        panel.className = 'cal-day-detail';
        panel.dataset.date = dateStr;

        const rows = acts.map(a => {
            const t = getType(a);
            const km = a.distance ? `${(a.distance / 1000).toFixed(2)} km` : '';
            const dur = a.moving_time ? utils.formatTime(a.moving_time) : '';
            const hr = a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : '';
            const ele = a.total_elevation_gain ? `↑${a.total_elevation_gain.toFixed(0)} m` : '';
            const tss = a.tss ? `TSS ${Math.round(a.tss)}` : '';
            return `<a class="cal-detail-row" href="html/activity-router.html?id=${a.id}" target="_blank"
                style="border-left:3px solid ${sportColorDark(t)}">
                <span class="cal-detail-sport">${emoji(t)} ${t}</span>
                <span class="cal-detail-name">${a.name || '—'}</span>
                <span class="cal-detail-stats">${[km, dur, hr, ele, tss].filter(Boolean).join(' · ')}</span>
            </a>`;
        }).join('');

        panel.innerHTML = `
        <div class="cal-detail-header">
            <strong>${DAYS_SHORT[(dt.getDay() + 6) % 7]}, ${utils.formatDate(dt)}</strong>
            <button class="cal-detail-close">✕</button>
        </div>
        <div class="cal-detail-rows">${rows}</div>`;

        root.querySelector('#cal-body').after(panel);
        panel.querySelector('.cal-detail-close').addEventListener('click', () => panel.remove());
    }

    renderAll();
}
