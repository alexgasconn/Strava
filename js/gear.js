// js/gear.js

import { formatDistance, formatPace, formatTime, formatDate } from './utils.js';
import { fetchGearById } from './api.js';

let gearChartInstance = null;
let gearGanttChartInstance = null;

function getGears() {
    return JSON.parse(localStorage.getItem('strava_gears') || '[]');
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

export function renderGearTab(allActivities) {
    console.log("🎽 Initializing Gear Tab...");

    const runs = allActivities.filter(a =>
        a.type && a.gear_id && a.gear_id.trim() !== ''
    );

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

    // Add filter buttons
    addGearFilters(elements.section, runs);

    showElements(elements);
    renderGearSection(runs, 'all');
    renderGearChart(runs, 'all');
    renderGearGanttChart(runs, 'all');
}

// ============================================================================
// GEAR FILTERS
// ============================================================================

function addGearFilters(container, runs) {
    const filterDiv = document.createElement('div');
    filterDiv.id = 'gear-filters';
    filterDiv.innerHTML = `
        <button class="gear-filter-btn active" data-filter="all">All Gear</button>
        <button class="gear-filter-btn" data-filter="shoe">👟 Shoes</button>
        <button class="gear-filter-btn" data-filter="bike">🚴 Bikes</button>
    `;
    container.insertBefore(filterDiv, container.firstChild);

    // Add event listeners
    filterDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('gear-filter-btn')) {
            const filter = e.target.dataset.filter;
            document.querySelectorAll('.gear-filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateGearDisplay(runs, filter);
        }
    });
}

function updateGearDisplay(runs, filter) {
    renderGearSection(runs, filter);
    renderGearChart(runs, filter);
    renderGearGanttChart(runs, filter);
}

// ============================================================================
// GEAR METRICS CALCULATION
// ============================================================================

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
                runs: []
            });
        }

        const metrics = gearMetrics.get(gearId);
        metrics.numUses++;
        metrics.totalDistance += run.distance || 0;
        metrics.totalMovingTime += run.moving_time || 0;
        metrics.totalElevationGain += run.total_elevation_gain || 0;

        const runDate = new Date(run.start_date_local);
        metrics.firstUse = runDate < metrics.firstUse ? runDate : metrics.firstUse;
        metrics.lastUse = runDate > metrics.lastUse ? runDate : metrics.lastUse;
        metrics.runs.push(run);
    });

    // Calculate averages
    gearMetrics.forEach(metrics => {
        metrics.avgDistancePerUse = metrics.numUses > 0
            ? metrics.totalDistance / metrics.numUses
            : 0;

        metrics.avgPace = (metrics.totalMovingTime > 0 && metrics.totalDistance > 0)
            ? metrics.totalMovingTime / (metrics.totalDistance / 1000)
            : 0;

        metrics.avgElevationGainPerUse = metrics.numUses > 0
            ? metrics.totalElevationGain / metrics.numUses
            : 0;

        metrics.numRuns = metrics.runs.length;
    });

    return gearMetrics;
}

// ============================================================================
// GEAR SECTION RENDERING
// ============================================================================

async function renderGearSection(runs, filter = 'all') {
    const container = document.getElementById('gear-info-section');
    const listContainer = document.getElementById('gear-info-list');

    if (!container || !listContainer) {
        console.error("❌ Gear containers not found");
        return;
    }

    const gearMetrics = calculateGearMetrics(runs);
    console.log("🔧 renderGearSection: gearMetrics keys:", Array.from(gearMetrics.keys()));

    let gearIds = Array.from(gearMetrics.keys());

    if (gearIds.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">No gear used in this period.</p>';
        return;
    }

    listContainer.innerHTML = '<div class="loading-state">⏳ Loading detailed gear info...</div>';

    try {
        const allGears = getGears();
        console.log("🔧 renderGearSection: allGears from localStorage:", allGears.length, allGears.map(g => ({ id: g.id, name: g.name })));

        // Process gear details to ensure type is set correctly
        const processedGears = allGears.map(gear => {
            const processedGear = { ...gear };
            processedGear.type = ('frame_type' in processedGear || 'weight' in processedGear) ? 'bike' : 'shoe';
            if (processedGear.type === 'shoe') {
                processedGear.notification_distance = processedGear.notification_distance ?? 700;
                processedGear.durability = processedGear.notification_distance;
            } else if (processedGear.type === 'bike') {
                processedGear.durability = 15000000;
                processedGear.notification_distance = null;
            } else {
                processedGear.durability = 1000000;
            }
            return processedGear;
        });

        const gearDetailsMap = new Map(processedGears.map(gear => [gear.id, gear]));

        let combinedGearData = Array.from(gearDetailsMap.values()).map(gear => ({
            gear: {
                ...gear,
                distance: gearMetrics.get(gear.id)?.totalDistance || 0
            },
            metrics: gearMetrics.get(gear.id) || {}
        }));

        console.log("🔧 renderGearSection: combinedGearData before filter:", combinedGearData.length, combinedGearData.map(d => ({
            id: d.gear.id,
            name: d.gear.name,
            type: d.gear.type,
            hasMetrics: !!d.metrics.numUses,
            distance: d.gear.distance
        })));

        // Filter by type
        if (filter !== 'all') {
            combinedGearData = combinedGearData.filter(item => item.gear.type === filter);
            console.log("🔧 renderGearSection: combinedGearData after type filter:", combinedGearData.length);
        }

        console.log("🔧 renderGearSection: final combinedGearData:", combinedGearData.length);
        renderGearCards(combinedGearData);
    } catch (error) {
        console.error("❌ Failed to fetch gear details:", error);
        listContainer.innerHTML = '<p class="error-state">Error loading gear details. Please try again.</p>';
    }
}

// ============================================================================
// GEAR DETAILS PROCESSING
// ============================================================================

function processGearDetails(results) {
    const gearDetailsMap = new Map();

    const frameTypeMap = {
        1: 'MTB',
        2: 'CROSS',
        3: 'ROAD',
        4: 'TT',
        5: 'GRAVEL'
    };

    results.forEach(result => {
        const gear = result.gear;
        if (!gear) return;
        gear.type = ('frame_type' in gear || 'weight' in gear) ? 'bike' : 'shoe';
        if (gear.type === 'shoe') {
            gear.notification_distance = gear.notification_distance ?? 700;
            gear.durability = gear.notification_distance;
        } else if (gear.type === 'bike') {
            gear.durability = 15000000;
            gear.notification_distance = null;
        } else {
            gear.durability = 1000000;
        }

        gear.frame_category = frameTypeMap[gear.frame_type] || 'N/A';
        gearDetailsMap.set(gear.id, gear);
        console.log(gearDetailsMap);
    });

    return gearDetailsMap;
}

// ============================================================================
// GEAR CARDS RENDERING
// ============================================================================

function renderGearCards(combinedGearData) {
    const listContainer = document.getElementById('gear-info-list');
    if (!listContainer) {
        console.error("❌ gear-info-list container not found");
        return;
    }

    const isEditMode = localStorage.getItem('gearEditMode') === 'true';
    const sortedData = sortGearData(combinedGearData);

    const html = `
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

    listContainer.innerHTML = html;
    attachEventListeners(isEditMode, sortedData);
}

// ============================================================================
// GEAR CARD CREATION
// ============================================================================

function createGearCard(data, isEditMode) {
    const { gear, metrics } = data;
    const defaults = getDefaultValues(gear.type || 'unknown');
    const customData = getCustomData(gear.id);

    const price = customData.price ?? defaults.price;
    const durationKm = customData.durationKm ?? defaults.durationKm;
    const totalKm = gear.distance / 1000;
    const durabilityPercent = Math.min((totalKm / durationKm) * 100, 100);
    const euroPerKm = (price > 0 && totalKm > 0) ? (price / totalKm).toFixed(2) : '-';
    const needsReplacement = durabilityPercent >= 100;

    const statusBadges = createStatusBadges(gear, needsReplacement);
    const durabilityBar = createDurabilityBar(durabilityPercent, totalKm, durationKm);
    const stats = createStatsSection(metrics, gear, euroPerKm);
    const editSection = isEditMode ? createEditSection(gear.id, price, durationKm) : '';

    return `
        <div class="gear-card ${gear.retired ? 'retired' : ''} ${needsReplacement && !gear.retired ? 'needs-replacement' : ''}" 
             onclick="window.open('html/gear.html?id=${gear.id}', '_blank')" style="cursor: pointer;">
            ${statusBadges}
            <div class="gear-card-header">
                <div class="gear-icon">${gear.type === 'bike' ? '🚴' : '👟'}</div>
                <div class="gear-title">
                    <h4>${gear.name || `${gear.brand_name} ${gear.model_name}`}</h4>
                    <p class="gear-category">${gear.type === 'bike' ? gear.frame_category : 'Running Shoe'}</p>
                </div>
            </div>
            
            <div class="gear-distance-display">
                <span class="distance-value">${totalKm.toFixed(0)}</span>
                <span class="distance-unit">km</span>
            </div>
            
            ${durabilityBar}
            
            ${stats}
            
            ${needsReplacement && !gear.retired ?
            '<div class="replacement-alert">⚠️ Replacement Needed!</div>' : ''}
            
            ${editSection}
        </div>
    `;
}

// ============================================================================
// CARD COMPONENTS
// ============================================================================

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
                    <span class="stat-label">Uses</span>
                    <span class="stat-value">${metrics.numUses || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">€/km</span>
                    <span class="stat-value">${euroPerKm}</span>
                </div>
            </div>
            <div class="stat-row">
                <div class="stat-item">
                    <span class="stat-label">Avg Distance</span>
                    <span class="stat-value">${formatDistance(metrics.avgDistancePerUse || 0, 1)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">First Use</span>
                    <span class="stat-value">${metrics.firstUse ? formatDate(metrics.firstUse) : 'N/A'}</span>
                </div>
            </div>
            <div class="stat-row">
                <div class="stat-item">
                    <span class="stat-label">Avg Elevation</span>
                    <span class="stat-value">${metrics.avgElevationGainPerUse ? metrics.avgElevationGainPerUse.toFixed(0) + 'm' : '-'}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Last Use</span>
                    <span class="stat-value">${metrics.lastUse ? formatDate(metrics.lastUse) : 'N/A'}</span>
                </div>
            </div>
        </div>
    `;
}

function createEditSection(gearId, price, durationKm) {
    return `
        <div class="gear-edit-section">
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

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachEventListeners(isEditMode, combinedGearData) {
    const toggleBtn = document.getElementById('toggle-gear-edit');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const newMode = !isEditMode;
            localStorage.setItem('gearEditMode', newMode);
            renderGearCards(combinedGearData);
        });
    }

    if (isEditMode) {
        document.querySelectorAll('.save-gear-btn').forEach(btn => {
            btn.addEventListener('click', () => handleSaveGear(btn, combinedGearData));
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
    showNotification('Gear updated successfully!', 'success');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function getDefaultValues(type) {
    const defaults = { bike: { price: 1000, durationKm: 15000 }, shoe: { price: 120, durationKm: 700 }, unknown: { price: 100, durationKm: 1000 } };
    return defaults[type] || defaults.unknown;
}
function getCustomData(gearId) {
    return JSON.parse(localStorage.getItem(`gear-custom-${gearId}`) || '{}');
}

function sortGearData(data) {
    return data.sort((a, b) => {
        const dateA = a.gear.last_activity_date ? new Date(a.gear.last_activity_date) : new Date(0);
        const dateB = b.gear.last_activity_date ? new Date(b.gear.last_activity_date) : new Date(0);
        return dateB - dateA; // más reciente primero
    });
}


function showNotification(message, type = 'info') {
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

// ============================================================================
// VALIDATION & STATE MANAGEMENT
// ============================================================================

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
    if (container) {
        container.innerHTML = `<div class="error-state">⚠️ ${message}</div>`;
    }
}

function showEmptyState(elements) {
    elements.list.innerHTML = '<div class="empty-state">📭 No gear data available</div>';

    if (gearChartInstance) {
        gearChartInstance.destroy();
        gearChartInstance = null;
    }
    if (gearGanttChartInstance) {
        gearGanttChartInstance.destroy();
        gearGanttChartInstance = null;
    }

    if (elements.chartContainer) elements.chartContainer.style.display = 'none';
    if (elements.ganttContainer) elements.ganttContainer.style.display = 'none';
}

function showElements(elements) {
    if (elements.chartContainer) elements.chartContainer.style.display = '';
    if (elements.ganttContainer) elements.ganttContainer.style.display = '';
}


// Función mejorada para renderizar el gráfico de uso de equipo (Gráfico de líneas)
async function renderGearChart(runs, filter = 'all') {
    const canvas = document.getElementById('gearChart');
    const container = document.getElementById('gear-chart-container');
    if (!canvas) {
        console.error("Canvas element 'gearChart' not found for renderGearChart.");
        if (container) container.style.display = 'none';
        return;
    }

    // Filter runs by gear type
    let filteredRuns = runs;
    if (filter !== 'all') {
        // Use cached gear details
        const allGears = getGears();
        const gearDetailsMap = new Map(allGears.map(gear => [gear.id, gear]));
        const validGearIds = Array.from(gearDetailsMap.values())
            .filter(gear => gear.type === filter)
            .map(gear => gear.id);
        filteredRuns = runs.filter(run => validGearIds.includes(run.gear_id));
    }

    // Si no hay runs, esconder y destruir gráfico previo
    if (!filteredRuns || filteredRuns.length === 0) {
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (container) container.style.display = 'none';
        return;
    } else if (container) {
        container.style.display = ''; // mostrar
    }

    // destruye gráfico previo
    if (gearChartInstance) {
        gearChartInstance.destroy();
        gearChartInstance = null;
    }

    // Update title
    const title = filter === 'all' ? 'Distance per Gear' : filter === 'shoe' ? 'Distance per Shoe' : 'Distance per Bike';
    container.querySelector('h4').textContent = title;

    // Helper: hex -> rgba
    const hexToRgba = (hex, alpha = 1) => {
        const h = hex.replace('#', '');
        const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Agrupar por fecha (YYYY-MM-DD) y gear
    const gearUsageByDate = new Map();
    for (const run of filteredRuns) {
        if (!run || !run.start_date_local || !run.gear_id) continue;
        const date = new Date(run.start_date_local);
        if (isNaN(date.getTime())) continue;
        const dateString = date.toISOString().split('T')[0];
        if (!gearUsageByDate.has(dateString)) gearUsageByDate.set(dateString, new Map());
        const daily = gearUsageByDate.get(dateString);
        const current = daily.get(run.gear_id) || 0;
        daily.set(run.gear_id, current + (run.distance || 0)); // meters
    }

    const allDates = Array.from(gearUsageByDate.keys()).sort();
    if (allDates.length === 0) {
        console.warn('No valid dated runs to render in gear chart.');
        if (gearChartInstance) { gearChartInstance.destroy(); gearChartInstance = null; }
        if (container) container.style.display = 'none';
        return;
    }

    // Gear ids únicos
    const uniqueGearIds = Array.from(new Set(runs.map(r => r.gear_id).filter(Boolean)));
    // Fetch names (silencioso en error)
    const gearIdToName = new Map();
    if (uniqueGearIds.length > 0) {
        try {
            const results = await Promise.all(uniqueGearIds.map(id => fetchGearById(id)));
            results.forEach(gear => {
                if (gear && gear.id) {
                    gearIdToName.set(gear.id, gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' '));
                }
            });
        } catch (err) {
            console.error('Error fetching gear names for GearChart:', err);
        }
    }

    // Construir datasets (km acumulado por fecha)
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
    const datasets = [];
    uniqueGearIds.forEach((gearId, idx) => {
        const color = colors[idx % colors.length];
        let cumulative = 0;
        const data = allDates.map(dateStr => {
            const daily = gearUsageByDate.get(dateStr);
            const meters = daily && daily.has(gearId) ? daily.get(gearId) : 0;
            cumulative += meters;
            return +(cumulative / 1000).toFixed(1); // km acumulado
        });

        datasets.push({
            label: gearIdToName.get(gearId) || `Gear ${gearId.slice(-6)}`,
            data,
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.1),
            fill: false,
            tension: 0.1
        });
    });

    if (datasets.length === 0) {
        console.warn('No datasets to render in gear chart (all series empty).');
        if (container) container.style.display = 'none';
        return;
    }

    // Usamos category en X para evitar necesidad de adapters de fechas
    gearChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: allDates, // 'YYYY-MM-DD'
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Cumulative Distance Over Time' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (ctx) => {
                            const label = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
                            const y = ctx.parsed.y;
                            return y !== null && y !== undefined ? `${label}${Number(y).toFixed(2)} km` : label;
                        }
                    }
                }
            },
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                x: {
                    type: 'category',
                    title: { display: true, text: 'Date' },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true
                }
            }
        }
    });
}




export async function renderGearGanttChart(runs, filter = 'all') {
    const ctx = document.getElementById('gear-gantt-chart');
    if (!ctx) {
        console.error("Canvas element 'gear-gantt-chart' not found for renderGearGanttChart.");
        return;
    }

    if (gearGanttChartInstance) {
        gearGanttChartInstance.destroy();
    }

    let gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));

    if (gearIds.length === 0) {
        return;
    }

    let gearIdToName = new Map(); // Usar Map en lugar de objeto para mayor flexibilidad con IDs
    try {
        const allGears = getGears();

        // Process gear details to ensure type is set correctly
        const processedGears = allGears.map(gear => {
            const processedGear = { ...gear };
            processedGear.type = ('frame_type' in processedGear || 'weight' in processedGear) ? 'bike' : 'shoe';
            return processedGear;
        });

        const gearDetailsMap = new Map(processedGears.map(gear => [gear.id, gear]));

        // Filter gears by type
        let filteredGears = Array.from(gearDetailsMap.values());
        if (filter !== 'all') {
            filteredGears = filteredGears.filter(gear => gear.type === filter);
        }
        gearIds = filteredGears.map(gear => gear.id);

        filteredGears.forEach(gear => {
            gearIdToName.set(gear.id, gear.name || [gear.brand_name, gear.model_name].filter(Boolean).join(' '));
        });
    } catch (error) {
        console.error("Failed to fetch gear details for Gantt chart:", error);
        return;
    }

    // Filter runs by gearIds
    const filteredRuns = runs.filter(run => gearIds.includes(run.gear_id));

    const gearMonthKm = filteredRuns.reduce((acc, a) => {
        if (!a.gear_id || !a.start_date_local) return acc;
        const gearKey = a.gear_id;
        const month = a.start_date_local.substring(0, 7);
        if (!acc[month]) acc[month] = {};
        acc[month][gearKey] = (acc[month][gearKey] || 0) + a.distance / 1000;
        return acc;
    }, {});

    // Update title
    const ganttTitle = filter === 'all' ? 'Gear Timeline' : filter === 'shoe' ? 'Shoes Timeline' : 'Bikes Timeline';
    document.querySelector('#gear-gantt-chart-container h4').textContent = ganttTitle;

    const monthsWithData = Object.keys(gearMonthKm);
    if (monthsWithData.length === 0) {
        // console.log("No monthly gear usage data available for Gantt chart.");
        return;
    }
    const firstMonth = monthsWithData.reduce((min, m) => m < min ? m : min);
    const lastMonth = monthsWithData.reduce((max, m) => m > max ? m : max);

    function getMonthRange(start, end) {
        const result = [];
        let [sy, sm] = start.split('-').map(Number);
        let [ey, em] = end.split('-').map(Number);
        while (sy < ey || (sy === ey && sm <= em)) {
            result.push(`${sy.toString().padStart(4, '0')}-${sm.toString().padStart(2, '0')}`);
            sm++;
            if (sm > 12) {
                sm = 1;
                sy++;
            }
        }
        return result;
    }
    const allMonths = getMonthRange(firstMonth, lastMonth);

    const allGears = Array.from(gearIdToName.keys()); // Usar las keys del Map para los gears existentes

    const datasets = allGears.map((gearId, idx) => ({
        label: gearIdToName.get(gearId) || `Gear ID: ${gearId}`,
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
                title: {
                    display: true,
                    text: 'Distance per Gear per Month'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.x !== null) {
                                label += context.parsed.x.toFixed(2) + ' km';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Distance (km)' },
                    beginAtZero: true
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Year-Month' },
                    grid: {
                        offset: true
                    }
                }
            }
        }
    });
}

export async function renderGearDetailPage(gearId) {
    const allActivities = JSON.parse(localStorage.getItem('strava_activities') || '[]');
    const allGears = getGears();
    const gear = allGears.find(g => g.id === gearId);

    if (!gear) {
        document.body.innerHTML = '<p>Gear not found</p>';
        return;
    }

    const gearActivities = allActivities.filter(a => a.gear_id === gearId);

    renderGearInfo(gear, gearActivities);
    renderGearStats(gear, gearActivities);
    renderGearAdvanced(gear, gearActivities);
    renderGearMap(gearActivities);
    renderGearUsageChart(gearActivities);
    renderGearActivitiesList(gearActivities);
}

function renderGearInfo(gear, activities) {
    const container = document.getElementById('gear-info');
    const totalDistance = activities.reduce((sum, a) => sum + a.distance, 0) / 1000;
    const totalTime = activities.reduce((sum, a) => sum + a.moving_time, 0) / 3600;
    const avgPace = totalDistance > 0 ? (totalTime * 60) / totalDistance : 0;

    container.innerHTML = `
        <h3>${gear.name || `${gear.brand_name} ${gear.model_name}`}</h3>
        <p><strong>Type:</strong> ${gear.type}</p>
        <p><strong>Total Activities:</strong> ${activities.length}</p>
        <p><strong>Total Distance:</strong> ${totalDistance.toFixed(1)} km</p>
        <p><strong>Total Time:</strong> ${totalTime.toFixed(1)} hours</p>
        <p><strong>Average Pace:</strong> ${formatPace(avgPace * 60, 1000)}</p>
    `;
}

function renderGearStats(gear, activities) {
    const container = document.getElementById('gear-stats');

    if (activities.length === 0) {
        container.innerHTML = '<h3>Statistics</h3><p>No activities with this gear yet.</p>';
        return;
    }

    const totalDistance = activities.reduce((sum, a) => sum + a.distance, 0) / 1000;
    const totalTime = activities.reduce((sum, a) => sum + a.moving_time, 0) / 3600;
    const totalElevation = activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
    const avgDistance = totalDistance / activities.length;
    const avgTime = totalTime / activities.length;
    const avgElevation = totalElevation / activities.length;
    const avgPace = totalDistance > 0 ? (totalTime * 60) / totalDistance : 0;

    const firstUse = new Date(Math.min(...activities.map(a => new Date(a.start_date_local))));
    const lastUse = new Date(Math.max(...activities.map(a => new Date(a.start_date_local))));
    const daysUsed = Math.ceil((lastUse - firstUse) / (1000 * 60 * 60 * 24)) + 1;

    container.innerHTML = `
        <h3>📊 Statistics</h3>
        <div class="gear-stats-grid">
            <div class="stat-card">
                <div class="stat-value">${activities.length}</div>
                <div class="stat-label">Total Activities</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalDistance.toFixed(0)}</div>
                <div class="stat-label">Total Distance (km)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalTime.toFixed(1)}</div>
                <div class="stat-label">Total Time (hours)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalElevation.toFixed(0)}</div>
                <div class="stat-label">Total Elevation (m)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgDistance.toFixed(1)}</div>
                <div class="stat-label">Avg Distance (km)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgTime.toFixed(1)}</div>
                <div class="stat-label">Avg Time (hours)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgElevation.toFixed(0)}</div>
                <div class="stat-label">Avg Elevation (m)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatPace(avgPace * 60, 1000)}</div>
                <div class="stat-label">Avg Pace</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${firstUse.toLocaleDateString()}</div>
                <div class="stat-label">First Use</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${lastUse.toLocaleDateString()}</div>
                <div class="stat-label">Last Use</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${daysUsed}</div>
                <div class="stat-label">Days Used</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${(totalDistance / daysUsed).toFixed(1)}</div>
                <div class="stat-label">Km per Day</div>
            </div>
        </div>
    `;
}

function renderGearAdvanced(gear, activities) {
    const container = document.getElementById('gear-advanced');

    if (activities.length === 0) {
        container.innerHTML = '<h3>🔬 Advanced Metrics</h3><p>No activities with this gear yet.</p>';
        return;
    }

    // Análisis por día de la semana
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdayCounts = activities.reduce((acc, a) => {
        const day = new Date(a.start_date_local).getDay();
        acc[day] = (acc[day] || 0) + 1;
        return acc;
    }, {});

    const mostUsedWeekday = weekdayNames[Object.keys(weekdayCounts).reduce((a, b) =>
        weekdayCounts[a] > weekdayCounts[b] ? a : b)];

    // Análisis por hora del día
    const hourCounts = activities.reduce((acc, a) => {
        const hour = new Date(a.start_date_local).getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
    }, {});

    const mostUsedHour = Object.keys(hourCounts).reduce((a, b) =>
        hourCounts[a] > hourCounts[b] ? a : b);

    // Análisis de rendimiento
    const bestDistance = Math.max(...activities.map(a => a.distance)) / 1000;
    const bestTime = Math.min(...activities.filter(a => a.moving_time > 0).map(a => a.moving_time)) / 3600;
    const bestPace = Math.min(...activities.filter(a => a.distance > 0 && a.moving_time > 0)
        .map(a => (a.moving_time / 60) / (a.distance / 1000)));

    // Análisis de elevación
    const activitiesWithElevation = activities.filter(a => a.total_elevation_gain > 0);
    const avgElevationGain = activitiesWithElevation.length > 0
        ? activitiesWithElevation.reduce((sum, a) => sum + a.total_elevation_gain, 0) / activitiesWithElevation.length
        : 0;

    container.innerHTML = `
        <h3>🔬 Advanced Metrics</h3>
        <div class="gear-advanced-grid">
            <div class="advanced-section">
                <h4>📅 Usage Patterns</h4>
                <div class="advanced-stats">
                    <div class="stat-item">
                        <span class="stat-label">Most Used Day:</span>
                        <span class="stat-value">${mostUsedWeekday}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Peak Hour:</span>
                        <span class="stat-value">${mostUsedHour}:00</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Activities with Elevation:</span>
                        <span class="stat-value">${activitiesWithElevation.length}/${activities.length}</span>
                    </div>
                </div>
            </div>

            <div class="advanced-section">
                <h4>🏆 Personal Bests</h4>
                <div class="advanced-stats">
                    <div class="stat-item">
                        <span class="stat-label">Best Distance:</span>
                        <span class="stat-value">${bestDistance.toFixed(1)} km</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Best Time:</span>
                        <span class="stat-value">${bestTime.toFixed(2)} hours</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Best Pace:</span>
                        <span class="stat-value">${formatPace(bestPace * 60, 1000)}</span>
                    </div>
                </div>
            </div>

            <div class="advanced-section">
                <h4>⛰️ Elevation Analysis</h4>
                <div class="advanced-stats">
                    <div class="stat-item">
                        <span class="stat-label">Avg Elevation Gain:</span>
                        <span class="stat-value">${avgElevationGain.toFixed(0)} m</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Max Elevation Gain:</span>
                        <span class="stat-value">${Math.max(...activities.map(a => a.total_elevation_gain || 0))} m</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Elevation Activities:</span>
                        <span class="stat-value">${((activitiesWithElevation.length / activities.length) * 100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderGearMap(activities) {
    const mapContainer = document.getElementById('gear-map');

    if (activities.length === 0) {
        mapContainer.innerHTML = '<p>No activities with maps to display.</p>';
        return;
    }

    const map = L.map('gear-map').setView([40.7128, -74.0060], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const bounds = [];
    const colors = ['#FF6B35', '#FC5200', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];

    activities.forEach((activity, index) => {
        if (activity.map && activity.map.summary_polyline) {
            try {
                const coordinates = decodePolyline(activity.map.summary_polyline);
                if (coordinates.length > 0) {
                    const color = colors[index % colors.length];

                    // Añadir polyline
                    const polyline = L.polyline(coordinates, {
                        color: color,
                        weight: 3,
                        opacity: 0.8
                    }).addTo(map);

                    // Añadir marcadores de inicio y fin
                    L.circleMarker(coordinates[0], {
                        radius: 6,
                        color: '#2ECC40',
                        fillColor: '#2ECC40',
                        fillOpacity: 0.8,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Start:</b> ${activity.name}`);

                    L.circleMarker(coordinates[coordinates.length - 1], {
                        radius: 6,
                        color: '#FF4136',
                        fillColor: '#FF4136',
                        fillOpacity: 0.8,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Finish:</b> ${activity.name}<br>${(activity.distance / 1000).toFixed(1)} km`);

                    bounds.push(...coordinates);
                }
            } catch (error) {
                console.error('Error decoding polyline for activity:', activity.id, error);
            }
        }
    });

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [20, 20] });
    }

    // Añadir control de capas si hay múltiples actividades
    if (activities.length > 1) {
        const overlays = {};
        activities.forEach((activity, index) => {
            if (activity.map && activity.map.summary_polyline) {
                const color = colors[index % colors.length];
                overlays[`${activity.name || `Activity ${index + 1}`}`] = L.polyline(
                    decodePolyline(activity.map.summary_polyline),
                    { color: color, weight: 3, opacity: 0.8 }
                );
            }
        });

        L.control.layers(null, overlays).addTo(map);
    }
}

function renderGearUsageChart(activities) {
    const ctx = document.getElementById('gear-usage-chart');

    if (activities.length === 0) {
        ctx.parentElement.innerHTML = '<p>No data to display.</p>';
        return;
    }

    // Preparar datos mensuales
    const monthlyData = activities.reduce((acc, a) => {
        const month = a.start_date_local.substring(0, 7); // YYYY-MM
        if (!acc[month]) {
            acc[month] = {
                distance: 0,
                count: 0,
                elevation: 0,
                time: 0
            };
        }
        acc[month].distance += a.distance / 1000;
        acc[month].count += 1;
        acc[month].elevation += a.total_elevation_gain || 0;
        acc[month].time += a.moving_time / 3600;
        return acc;
    }, {});

    const labels = Object.keys(monthlyData).sort();
    const distanceData = labels.map(month => monthlyData[month].distance);
    const countData = labels.map(month => monthlyData[month].count);
    const elevationData = labels.map(month => monthlyData[month].elevation);
    const timeData = labels.map(month => monthlyData[month].time);

    // Calcular acumulado
    let cumulativeDistance = 0;
    const cumulativeData = distanceData.map(d => cumulativeDistance += d);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(month => {
                const [year, monthNum] = month.split('-');
                return `${year}-${monthNum}`;
            }),
            datasets: [
                {
                    label: 'Monthly Distance (km)',
                    data: distanceData,
                    borderColor: '#FC5200',
                    backgroundColor: 'rgba(252, 82, 0, 0.1)',
                    fill: false,
                    yAxisID: 'y',
                    tension: 0.4
                },
                {
                    label: 'Cumulative Distance (km)',
                    data: cumulativeData,
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    fill: false,
                    yAxisID: 'y',
                    tension: 0.4,
                    borderDash: [5, 5]
                },
                {
                    label: 'Activities Count',
                    data: countData,
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    fill: false,
                    yAxisID: 'y1',
                    tension: 0.4,
                    pointStyle: 'rect'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Distance (km)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Activities Count'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

function renderGearActivitiesList(activities) {
    const container = document.getElementById('gear-activities-list');

    if (activities.length === 0) {
        container.innerHTML = '<p>No activities found with this gear.</p>';
        return;
    }

    // Ordenar por fecha más reciente primero
    const sortedActivities = activities.sort((a, b) =>
        new Date(b.start_date_local) - new Date(a.start_date_local));

    container.innerHTML = `
        <div class="activities-summary">
            <p>Showing ${activities.length} activities with this gear</p>
        </div>
        <div class="gear-activities-grid">
            ${sortedActivities.map(activity => {
        const date = new Date(activity.start_date_local);
        const distance = (activity.distance / 1000).toFixed(1);
        const time = formatTime(activity.moving_time);
        const pace = activity.distance > 0 ? formatPace((activity.moving_time / 60) / (activity.distance / 1000) * 60, 1000) : 'N/A';
        const elevation = activity.total_elevation_gain || 0;

        return `
                    <div class="gear-activity-card" onclick="window.open('activity.html?id=${activity.id}', '_blank')" style="cursor: pointer;">
                        <div class="activity-header">
                            <h4>${activity.name || 'Unnamed Activity'}</h4>
                            <span class="activity-date">${date.toLocaleDateString()}</span>
                        </div>
                        <div class="activity-stats">
                            <div class="activity-stat">
                                <span class="stat-value">${distance}</span>
                                <span class="stat-unit">km</span>
                            </div>
                            <div class="activity-stat">
                                <span class="stat-value">${time}</span>
                                <span class="stat-unit">time</span>
                            </div>
                            <div class="activity-stat">
                                <span class="stat-value">${pace}</span>
                                <span class="stat-unit">pace</span>
                            </div>
                            ${elevation > 0 ? `
                                <div class="activity-stat">
                                    <span class="stat-value">${elevation}</span>
                                    <span class="stat-unit">m elev</span>
                                </div>
                            ` : ''}
                        </div>
                        ${activity.achievement_count > 0 ? `
                            <div class="achievement-badge">
                                🏆 ${activity.achievement_count} achievement${activity.achievement_count > 1 ? 's' : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
    }).join('')}
        </div>
    `;
}