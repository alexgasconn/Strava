// js/gear.js — Gear Tab (overview of all gear)
// Individual gear detail page logic lives in gear-analysis.js

import { formatDistance, formatPace, formatTime, formatDate } from './utils.js';
import { getCachedGears } from './api.js';

// ===================================================================
// SHARED UTILITIES (exported for use by gear-analysis.js etc.)
// ===================================================================

export function getDefaultValues(type) {
    const defaults = {
        bike: { price: 1000, durationKm: 15000 },
        shoe: { price: 120, durationKm: 700 },
        unknown: { price: 100, durationKm: 1000 }
    };
    return defaults[type] || defaults.unknown;
}

export function getCustomData(gearId) {
    return JSON.parse(localStorage.getItem(`gear-custom-${gearId}`) || '{}');
}

export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===================================================================
// MODULE STATE
// ===================================================================

let gearChartInstance = null;
let gearGanttChartInstance = null;

// ===================================================================
// INTERNAL HELPERS
// ===================================================================

function getGears() {
    const cached = getCachedGears();
    if (cached) return cached;
    return JSON.parse(localStorage.getItem('strava_gears') || '[]');
}

function bikeFrameTypeLabel(frameType) {
    const map = { 1: 'MTB', 2: 'Cross', 3: 'Road', 4: 'Time Trial', 5: 'Gravel' };
    return map[frameType] || null;
}

function classifyShoeType(runs) {
    if (!runs || runs.length === 0) return 'Running Shoe';
    const trailCount = runs.filter(r => r.type === 'TrailRun' || r.sport_type === 'TrailRun').length;
    return (trailCount / runs.length) > 0.3 ? 'Trail Running Shoe' : 'Road Running Shoe';
}

function sortGearData(data, sortKey = 'lastUse') {
    return [...data].sort((a, b) => {
        if (sortKey === 'km') return (b.gear.distance || 0) - (a.gear.distance || 0);
        if (sortKey === 'health') {
            const health = item => {
                const custom = getCustomData(item.gear.id);
                const def = getDefaultValues(item.gear.type || 'unknown');
                return ((item.gear.distance || 0) / 1000) / (custom.durationKm ?? def.durationKm) * 100;
            };
            return health(b) - health(a);
        }
        if (sortKey === 'name') return (a.gear.name || '').localeCompare(b.gear.name || '');
        // default: lastUse
        const dateA = a.metrics.lastUse ? new Date(a.metrics.lastUse) : new Date(0);
        const dateB = b.metrics.lastUse ? new Date(b.metrics.lastUse) : new Date(0);
        return dateB - dateA;
    });
}

// ===================================================================
// GEAR METRICS CALCULATION
// ===================================================================

function calculateGearMetrics(runs) {
    const gearMetrics = new Map();

    runs.forEach(run => {
        const gearId = run.gear_id;
        if (!gearId?.trim()) return;

        if (!gearMetrics.has(gearId)) {
            gearMetrics.set(gearId, {
                numUses: 0,
                firstUse: new Date(run.start_date_local),
                lastUse: new Date(run.start_date_local),
                totalDistance: 0,
                totalMovingTime: 0,
                totalElevationGain: 0,
                trailRunCount: 0,
                runs: []
            });
        }

        const metrics = gearMetrics.get(gearId);
        metrics.numUses++;
        metrics.totalDistance += run.distance || 0;
        metrics.totalMovingTime += run.moving_time || 0;
        metrics.totalElevationGain += run.total_elevation_gain || 0;
        if (run.type === 'TrailRun' || run.sport_type === 'TrailRun') metrics.trailRunCount++;

        const runDate = new Date(run.start_date_local);
        if (runDate < metrics.firstUse) metrics.firstUse = runDate;
        if (runDate > metrics.lastUse) metrics.lastUse = runDate;
        metrics.runs.push(run);
    });

    gearMetrics.forEach(metrics => {
        metrics.avgDistancePerUse = metrics.numUses > 0 ? metrics.totalDistance / metrics.numUses : 0;
        metrics.avgPace = (metrics.totalMovingTime > 0 && metrics.totalDistance > 0)
            ? metrics.totalMovingTime / (metrics.totalDistance / 1000) : 0;
        metrics.avgElevationGainPerUse = metrics.numUses > 0 ? metrics.totalElevationGain / metrics.numUses : 0;
        metrics.numRuns = metrics.runs.length;
    });

    return gearMetrics;
}

// ===================================================================
// VALIDATION & STATE MANAGEMENT
// ===================================================================

function validateElements(elements) {
    const required = ['section', 'list', 'chartContainer', 'chartCanvas', 'ganttContainer', 'ganttCanvas'];
    const missing = required.filter(key => !elements[key]);
    if (missing.length > 0) {
        console.error(`❌ Missing elements: ${missing.join(', ')}`);
        return false;
    }
    return true;
}

function showError(container, message) {
    if (container) container.innerHTML = `<div class="error-state">⚠️ ${message}</div>`;
}

function showEmptyState(elements) {
    elements.list.innerHTML = '<div class="empty-state">📭 No gear data available</div>';
    if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
    if (gearGanttChartInstance) { gearGanttChartInstance.destroy(); gearGanttChartInstance = null; }
    if (elements.chartContainer) elements.chartContainer.style.display = 'none';
    if (elements.ganttContainer) elements.ganttContainer.style.display = 'none';
}

function showElements(elements) {
    if (elements.chartContainer) elements.chartContainer.style.display = '';
    if (elements.ganttContainer) elements.ganttContainer.style.display = '';
}

// ===================================================================
// MAIN RENDER FUNCTION
// ===================================================================

export function renderGearTab(allActivities) {
    const runs = allActivities.filter(a => a.type && a.gear_id && a.gear_id.trim() !== '');

    const elements = {
        container: document.getElementById('gear-tab'),
        section: document.getElementById('gear-info-section'),
        list: document.getElementById('gear-info-list'),
        chartContainer: document.getElementById('gear-chart-container'),
        chartCanvas: document.getElementById('gearChart'),
        ganttContainer: document.getElementById('gear-gantt-chart-container'),
        ganttCanvas: document.getElementById('gear-gantt-chart')
    };

    if (!validateElements(elements)) {
        showError(elements.container, 'Essential HTML containers are missing');
        return;
    }

    if (runs.length === 0) {
        showEmptyState(elements);
        return;
    }

    // Remove previous filter/summary bars on re-render
    document.getElementById('gear-filters')?.remove();
    document.getElementById('gear-summary-bar')?.remove();

    addGearFilters(elements.section, runs);
    showElements(elements);
    renderGearSection(runs, 'all', false);
    renderGearChart(runs, 'all');
    renderGearGanttChart(runs, 'all');
}

// ===================================================================
// GEAR FILTERS
// ===================================================================

function addGearFilters(container, runs) {
    const filterDiv = document.createElement('div');
    filterDiv.id = 'gear-filters';
    filterDiv.innerHTML = `
        <div class="gear-filter-group">
            <button class="gear-filter-btn active" data-filter="all">All</button>
            <button class="gear-filter-btn" data-filter="shoe">👟 Shoes</button>
            <button class="gear-filter-btn" data-filter="bike">🚴 Bikes</button>
        </div>
        <label class="gear-retired-toggle">
            <input type="checkbox" id="show-retired-check"> Show retired
        </label>
    `;
    container.insertBefore(filterDiv, container.firstChild);

    let currentFilter = 'all';
    const retiredCheck = filterDiv.querySelector('#show-retired-check');

    filterDiv.addEventListener('click', (e) => {
        const btn = e.target.closest('button.gear-filter-btn');
        if (!btn) return;
        filterDiv.querySelectorAll('.gear-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        updateGearDisplay(runs, currentFilter, retiredCheck.checked);
    });

    retiredCheck.addEventListener('change', () => {
        updateGearDisplay(runs, currentFilter, retiredCheck.checked);
    });
}

function updateGearDisplay(runs, filter, showRetired) {
    renderGearSection(runs, filter, showRetired);
    renderGearChart(runs, filter);
    renderGearGanttChart(runs, filter);
}

// ===================================================================
// GEAR SECTION
// ===================================================================

async function renderGearSection(runs, filter = 'all', showRetired = false) {
    const listContainer = document.getElementById('gear-info-list');
    if (!listContainer) return;

    const gearMetrics = calculateGearMetrics(runs);
    const allGears = getGears();

    if (allGears.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">No gear loaded yet.</p>';
        return;
    }

    const processedGears = allGears.map(gear => {
        const g = { ...gear };
        g.type = ('frame_type' in g || 'weight' in g) ? 'bike' : 'shoe';
        g.notification_distance = g.type === 'shoe' ? (g.notification_distance ?? 700) : null;
        return g;
    });

    let combinedGearData = processedGears.map(gear => ({
        gear: { ...gear, distance: gearMetrics.get(gear.id)?.totalDistance || 0 },
        metrics: gearMetrics.get(gear.id) || {}
    }));

    if (filter !== 'all') combinedGearData = combinedGearData.filter(item => item.gear.type === filter);
    if (!showRetired) combinedGearData = combinedGearData.filter(item => !item.gear.retired);

    renderGearSummary(combinedGearData);
    renderGearCards(combinedGearData);
}

// ===================================================================
// SUMMARY BAR
// ===================================================================

function renderGearSummary(data) {
    let summaryBar = document.getElementById('gear-summary-bar');
    if (!summaryBar) {
        summaryBar = document.createElement('div');
        summaryBar.id = 'gear-summary-bar';
        const section = document.getElementById('gear-info-section');
        const filters = document.getElementById('gear-filters');
        section.insertBefore(summaryBar, filters ? filters.nextSibling : section.firstChild);
    }

    const totalKm = data.reduce((s, d) => s + (d.gear.distance || 0), 0) / 1000;
    const totalActivities = data.reduce((s, d) => s + (d.metrics.numUses || 0), 0);
    const needsReplacement = data.filter(d => {
        const custom = getCustomData(d.gear.id);
        const def = getDefaultValues(d.gear.type || 'unknown');
        return ((d.gear.distance || 0) / 1000) / (custom.durationKm ?? def.durationKm) >= 1 && !d.gear.retired;
    }).length;

    summaryBar.innerHTML = `
        <div class="gear-summary-bar">
            <div class="gear-summary-stat">
                <span class="summary-icon">🎽</span>
                <div>
                    <span class="summary-value">${data.length}</span>
                    <span class="summary-label">Pieces</span>
                </div>
            </div>
            <div class="gear-summary-stat">
                <span class="summary-icon">🛤️</span>
                <div>
                    <span class="summary-value">${totalKm.toFixed(0)}</span>
                    <span class="summary-label">Total km</span>
                </div>
            </div>
            <div class="gear-summary-stat">
                <span class="summary-icon">⚡</span>
                <div>
                    <span class="summary-value">${totalActivities}</span>
                    <span class="summary-label">Activities</span>
                </div>
            </div>
            ${needsReplacement > 0 ? `
            <div class="gear-summary-stat gear-summary-stat--alert">
                <span class="summary-icon">⚠️</span>
                <div>
                    <span class="summary-value">${needsReplacement}</span>
                    <span class="summary-label">Replace</span>
                </div>
            </div>` : ''}
        </div>
    `;
}

// ===================================================================
// GEAR CARDS RENDERING
// ===================================================================

function renderGearCards(combinedGearData) {
    const listContainer = document.getElementById('gear-info-list');
    if (!listContainer) return;

    const isEditMode = localStorage.getItem('gearEditMode') === 'true';
    const sortedData = sortGearData(combinedGearData);

    listContainer.innerHTML = `
        <div class="gear-header">
            <h3>🎽 Your Gear</h3>
            <button id="toggle-gear-edit" class="edit-toggle-btn">
                ${isEditMode ? '✅ Done' : '✏️ Edit'}
            </button>
        </div>
        <div class="gear-grid">
            ${sortedData.map(data => createGearCard(data, isEditMode)).join('')}
        </div>
    `;

    attachEventListeners(isEditMode, sortedData);
}

// ===================================================================
// GEAR CARD CREATION
// ===================================================================

function createGearCard(data, isEditMode) {
    const { gear, metrics } = data;
    const defaults = getDefaultValues(gear.type || 'unknown');
    const customData = getCustomData(gear.id);

    const price = customData.price ?? defaults.price;
    const durationKm = customData.durationKm ?? defaults.durationKm;
    const totalKm = (gear.distance || 0) / 1000;
    const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
    const euroPerKm = (price > 0 && totalKm > 0) ? (price / totalKm).toFixed(2) : '-';
    const needsReplacement = durabilityPercent >= 100;
    const remainingKm = Math.max(0, durationKm - totalKm);

    // Estimated replacement date
    let replacementEst = '';
    if (!needsReplacement && metrics.firstUse && metrics.lastUse && metrics.totalDistance > 0) {
        const weeks = Math.max(1, (metrics.lastUse - metrics.firstUse) / (1000 * 60 * 60 * 24 * 7));
        const weeklyKm = (metrics.totalDistance / 1000) / weeks;
        if (weeklyKm > 0) {
            const weeksLeft = Math.round(remainingKm / weeklyKm);
            const estDate = new Date();
            estDate.setDate(estDate.getDate() + weeksLeft * 7);
            replacementEst = `<div class="gear-replacement-est">🗓 Est. end: ${formatDate(estDate)} (~${weeksLeft}w)</div>`;
        }
    }

    const gearLabel = gear.type === 'bike'
        ? (bikeFrameTypeLabel(gear.frame_type) || gear.frame_category || 'Bike')
        : classifyShoeType(metrics.runs);

    const statusBadges = createStatusBadges(gear, needsReplacement);
    const durabilityBar = createDurabilityBar(durabilityPercent, totalKm, durationKm);
    const stats = createStatsSection(metrics, gear, euroPerKm);
    const editSection = isEditMode ? createEditSection(gear.id, price, durationKm) : '';

    const accentColor = gear.type === 'bike' ? '#3b82f6' : '#f59e0b';
    const iconBg = gear.type === 'bike' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)';

    return `
        <div class="gear-card ${gear.retired ? 'retired' : ''} ${needsReplacement && !gear.retired ? 'needs-replacement' : ''}"
             onclick="window.open('html/gear.html?id=${gear.id}', '_blank')" style="cursor:pointer; --accent: ${accentColor};">
            <div class="gear-card__accent"></div>
            ${statusBadges}
            <div class="gear-card-header">
                <div class="gear-icon" style="background:${iconBg}; color:${accentColor};">${gear.type === 'bike' ? '🚴' : '👟'}</div>
                <div class="gear-title">
                    <h4>${gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' ') || 'Unnamed'}</h4>
                    <span class="gear-type-chip" style="background:${iconBg}; color:${accentColor};">${gearLabel}</span>
                    ${gear.brand_name ? `<p class="gear-brand">${gear.brand_name}${gear.model_name ? ` · ${gear.model_name}` : ''}</p>` : ''}
                </div>
            </div>
            <div class="gear-distance-display">
                <span class="distance-value">${totalKm.toFixed(0)}</span>
                <span class="distance-unit">km</span>
            </div>
            ${durabilityBar}
            ${replacementEst}
            ${stats}
            ${needsReplacement && !gear.retired ? '<div class="replacement-alert">⚠️ Replacement Needed!</div>' : ''}
            ${editSection}
        </div>
    `;
}

// ===================================================================
// CARD COMPONENTS
// ===================================================================

function createStatusBadges(gear, needsReplacement) {
    let badges = '';
    if (gear.retired) badges += '<span class="status-badge retired">RETIRED</span>';
    if (gear.primary) badges += '<span class="status-badge primary">PRIMARY</span>';
    if (needsReplacement && !gear.retired) badges += '<span class="status-badge alert">REPLACE</span>';
    return badges ? `<div class="status-badges">${badges}</div>` : '';
}

function createDurabilityBar(percent, totalKm, maxKm) {
    const color = percent > 90 ? '#ef4444' : percent > 75 ? '#f59e0b' : '#10b981';
    return `
        <div class="durability-section">
            <div class="durability-bar">
                <div class="durability-fill" style="width: ${percent}%; background: ${color};"></div>
            </div>
            <small class="durability-text">${percent.toFixed(0)}% of ${maxKm} km lifespan</small>
        </div>
    `;
}

function createStatsSection(metrics, gear, euroPerKm) {
    return `
        <div class="gear-stats">
            <div class="stat-row">
                <div class="stat-item">
                    <span class="stat-icon-mini">🏃</span>
                    <div class="stat-content">
                        <span class="stat-value">${metrics.numUses || 0}</span>
                        <span class="stat-label">Uses</span>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon-mini">💰</span>
                    <div class="stat-content">
                        <span class="stat-value">${euroPerKm}</span>
                        <span class="stat-label">€/km</span>
                    </div>
                </div>
            </div>
            <div class="stat-row">
                <div class="stat-item">
                    <span class="stat-icon-mini">📏</span>
                    <div class="stat-content">
                        <span class="stat-value">${formatDistance(metrics.avgDistancePerUse || 0, 1)}</span>
                        <span class="stat-label">Avg Dist</span>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon-mini">⛰️</span>
                    <div class="stat-content">
                        <span class="stat-value">${metrics.avgElevationGainPerUse ? metrics.avgElevationGainPerUse.toFixed(0) + 'm' : '-'}</span>
                        <span class="stat-label">Avg Elev</span>
                    </div>
                </div>
            </div>
            <div class="stat-row">
                <div class="stat-item">
                    <span class="stat-icon-mini">📅</span>
                    <div class="stat-content">
                        <span class="stat-value">${metrics.firstUse ? formatDate(metrics.firstUse) : 'N/A'}</span>
                        <span class="stat-label">First Use</span>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon-mini">🕐</span>
                    <div class="stat-content">
                        <span class="stat-value">${metrics.lastUse ? formatDate(metrics.lastUse) : 'N/A'}</span>
                        <span class="stat-label">Last Use</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createEditSection(gearId, price, durationKm) {
    return `
        <div class="gear-edit-section" onclick="event.stopPropagation()">
            <div class="edit-input-group">
                <label>Price (€)</label>
                <input type="number" id="price-${gearId}" value="${price}" min="0" step="0.01">
            </div>
            <div class="edit-input-group">
                <label>Lifespan (km)</label>
                <input type="number" id="duration-${gearId}" value="${durationKm}" min="1">
            </div>
            <button class="save-gear-btn" data-gearid="${gearId}">💾 Save</button>
        </div>
    `;
}

// ===================================================================
// EVENT LISTENERS
// ===================================================================

function attachEventListeners(isEditMode, combinedGearData) {
    const toggleBtn = document.getElementById('toggle-gear-edit');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newMode = !isEditMode;
            localStorage.setItem('gearEditMode', String(newMode));
            renderGearCards(combinedGearData);
        });
    }

    if (isEditMode) {
        document.querySelectorAll('.save-gear-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleSaveGear(btn, combinedGearData);
            });
        });
    }
}

function handleSaveGear(btn, combinedGearData) {
    const gearId = btn.getAttribute('data-gearid');
    const priceInput = document.getElementById(`price-${gearId}`);
    const durationInput = document.getElementById(`duration-${gearId}`);

    const price = parseFloat(priceInput.value);
    const durationKm = parseInt(durationInput.value, 10);

    if (isNaN(price) || isNaN(durationKm) || price < 0 || durationKm <= 0) {
        showNotification('Please enter valid values', 'error');
        return;
    }

    localStorage.setItem(`gear-custom-${gearId}`, JSON.stringify({ price, durationKm }));
    btn.textContent = '✅';
    btn.classList.add('saved');
    setTimeout(() => renderGearCards(combinedGearData), 600);
    showNotification('Gear updated!', 'success');
}

// ===================================================================
// CHART: Cumulative Distance Over Time
// ===================================================================

async function renderGearChart(runs, filter = 'all') {
    const canvas = document.getElementById('gearChart');
    const container = document.getElementById('gear-chart-container');
    if (!canvas) return;

    let filteredRuns = runs;
    if (filter !== 'all') {
        const allGears = getGears();
        const validGearIds = new Set(
            allGears
                .map(g => ({ ...g, type: ('frame_type' in g || 'weight' in g) ? 'bike' : 'shoe' }))
                .filter(g => g.type === filter)
                .map(g => g.id)
        );
        filteredRuns = runs.filter(r => validGearIds.has(r.gear_id));
    }

    if (!filteredRuns.length) {
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (container) container.style.display = 'none';
        return;
    }
    if (container) container.style.display = '';
    if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }

    const title = filter === 'shoe' ? 'Distance per Shoe' : filter === 'bike' ? 'Distance per Bike' : 'Distance per Gear';
    container.querySelector('h4').textContent = title;

    // Group by date and gear
    const gearUsageByDate = new Map();
    for (const run of filteredRuns) {
        if (!run.start_date_local || !run.gear_id) continue;
        const dateString = run.start_date_local.substring(0, 10);
        if (!gearUsageByDate.has(dateString)) gearUsageByDate.set(dateString, new Map());
        const daily = gearUsageByDate.get(dateString);
        daily.set(run.gear_id, (daily.get(run.gear_id) || 0) + (run.distance || 0));
    }

    const allDates = Array.from(gearUsageByDate.keys()).sort();
    if (!allDates.length) {
        if (container) container.style.display = 'none';
        return;
    }

    const uniqueGearIds = Array.from(new Set(filteredRuns.map(r => r.gear_id).filter(Boolean)));
    const allGears = getGears();
    const gearIdToName = new Map(allGears.map(g => [g.id, g.name || [g.brand_name, g.model_name].filter(Boolean).join(' ')]));

    const hexToRgba = (hex, alpha) => {
        const h = hex.replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    };

    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
    const datasets = uniqueGearIds.map((gearId, idx) => {
        const color = colors[idx % colors.length];
        let cumulative = 0;
        const data = allDates.map(dateStr => {
            const daily = gearUsageByDate.get(dateStr);
            cumulative += (daily?.get(gearId) || 0);
            return +(cumulative / 1000).toFixed(1);
        });
        return {
            label: gearIdToName.get(gearId) || `Gear ${gearId.slice(-6)}`,
            data,
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.1),
            fill: false,
            tension: 0.1
        };
    });

    gearChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: allDates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Cumulative Distance Over Time' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)} km` }
                }
            },
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                x: { type: 'category', title: { display: true, text: 'Date' }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
                y: { title: { display: true, text: 'Distance (km)' }, beginAtZero: true }
            }
        }
    });
}

// ===================================================================
// CHART: Gear Gantt (Monthly Distance per Gear)
// ===================================================================

export async function renderGearGanttChart(runs, filter = 'all') {
    const ctx = document.getElementById('gear-gantt-chart');
    if (!ctx) return;

    if (gearGanttChartInstance) { gearGanttChartInstance.destroy(); gearGanttChartInstance = null; }

    const allGears = getGears();
    const processedGears = allGears.map(g => ({
        ...g,
        type: ('frame_type' in g || 'weight' in g) ? 'bike' : 'shoe'
    }));

    const filteredGears = filter === 'all' ? processedGears : processedGears.filter(g => g.type === filter);
    const gearIds = new Set(filteredGears.map(g => g.id));
    const gearIdToName = new Map(filteredGears.map(g => [g.id, g.name || [g.brand_name, g.model_name].filter(Boolean).join(' ')]));
    const filteredRuns = runs.filter(r => gearIds.has(r.gear_id));

    if (!filteredRuns.length) return;

    const gearMonthKm = filteredRuns.reduce((acc, a) => {
        if (!a.gear_id || !a.start_date_local) return acc;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][a.gear_id] = (acc[month][a.gear_id] || 0) + a.distance / 1000;
        return acc;
    }, {});

    const ganttTitle = filter === 'shoe' ? 'Shoes Timeline' : filter === 'bike' ? 'Bikes Timeline' : 'Gear Timeline';
    document.querySelector('#gear-gantt-chart-container h4').textContent = ganttTitle;

    const monthsWithData = Object.keys(gearMonthKm);
    if (!monthsWithData.length) return;

    const firstMonth = monthsWithData.reduce((a, b) => a < b ? a : b);
    const lastMonth = monthsWithData.reduce((a, b) => a > b ? a : b);

    function getMonthRange(start, end) {
        const result = [];
        let [sy, sm] = start.split('-').map(Number);
        const [ey, em] = end.split('-').map(Number);
        while (sy < ey || (sy === ey && sm <= em)) {
            result.push(`${sy}-${String(sm).padStart(2, '0')}`);
            if (++sm > 12) { sm = 1; sy++; }
        }
        return result;
    }

    const allMonths = getMonthRange(firstMonth, lastMonth);
    const datasets = Array.from(gearIds).map((gearId, idx) => ({
        label: gearIdToName.get(gearId) || `Gear ${gearId.slice(-6)}`,
        data: allMonths.map(month => gearMonthKm[month]?.[gearId] || 0),
        backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 60%)`,
        stack: 'stack1'
    }));

    gearGanttChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: allMonths, datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Distance per Gear per Month' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x?.toFixed(1)} km` }
                }
            },
            scales: {
                x: { stacked: true, title: { display: true, text: 'Distance (km)' }, beginAtZero: true },
                y: { stacked: true, title: { display: true, text: 'Year-Month' } }
            }
        }
    });
}
