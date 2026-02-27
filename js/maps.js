// js/maps.js
// Mapa global: dibuja polilíneas (rutas) o puntos (start/end) para todas las actividades
// No realiza llamadas a la API por actividad; usa los datos ya cargados en `activities`.

function decodePolyline(encoded) {
    if (!encoded) return [];
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += deltaLat;

        shift = 0; result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += deltaLng;

        coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
}

function parseActivityPolyline(a) {
    const encoded = a.map && (a.map.summary_polyline || a.map.polyline) ? (a.map.summary_polyline || a.map.polyline) : (a.summary_polyline || a.polyline);
    if (!encoded) return null;
    return decodePolyline(encoded);
}

function makeTileLayer(key) {
    if (key === 'carto') return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; Carto' });
    if (key === 'stamen') return L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png', { attribution: '&copy; Stamen' });
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' });
}

export function renderMapTab(activities = [], dateFrom = null, dateTo = null) {
    const container = document.getElementById('map-tab');
    if (!container) return;

    // Initialize controls
    const dateFromInput = document.getElementById('map-date-from');
    const dateToInput = document.getElementById('map-date-to');
    const applyBtn = document.getElementById('map-apply-date');
    const resetBtn = document.getElementById('map-reset-date');
    const sportSel = document.getElementById('map-sport-filter');
    const hourFrom = document.getElementById('map-hour-from');
    const hourTo = document.getElementById('map-hour-to');
    const vizSel = document.getElementById('map-visualization');
    const tilesSel = document.getElementById('map-tiles');
    const mapEl = document.getElementById('global-map');

    // Populate sport types
    const types = [...new Set(activities.map(a => a.type).filter(Boolean))].sort();
    sportSel.innerHTML = '<option value="all">All</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');

    // Initialize leaflet map singleton
    if (!window._stravaMap) {
        window._stravaMap = L.map(mapEl, { preferCanvas: true });
        const base = makeTileLayer(tilesSel?.value || 'osm');
        base.addTo(window._stravaMap);
        window._stravaBase = base;
        window._stravaPolylines = L.layerGroup().addTo(window._stravaMap);
        window._stravaPoints = L.layerGroup().addTo(window._stravaMap);
        window._stravaHeat = null;
        window._stravaMap.setView([48.0, 2.0], 4);
    }

    function clearLayers() {
        window._stravaPolylines.clearLayers();
        window._stravaPoints.clearLayers();
        if (window._stravaHeat) {
            try { window._stravaMap.removeLayer(window._stravaHeat); } catch (e) { }
            window._stravaHeat = null;
        }
    }

    function filterActivities() {
        return activities.filter(a => {
            if (!a) return false;
            // Date filter
            const d = a.start_date_local ? a.start_date_local.split('T')[0] : null;
            if (dateFromInput?.value && d && d < dateFromInput.value) return false;
            if (dateToInput?.value && d && d > dateToInput.value) return false;
            // Sport filter
            if (sportSel?.value && sportSel.value !== 'all' && a.type !== sportSel.value) return false;
            // Hour filter
            if ((hourFrom?.value || hourTo?.value) && a.start_date_local) {
                const h = new Date(a.start_date_local).getHours();
                if (hourFrom?.value) {
                    const hf = parseInt(hourFrom.value.split(':')[0], 10);
                    if (h < hf) return false;
                }
                if (hourTo?.value) {
                    const ht = parseInt(hourTo.value.split(':')[0], 10);
                    if (h > ht) return false;
                }
            }
            return true;
        });
    }

    function render() {
        clearLayers();
        const visible = filterActivities();
        const bounds = [];

        const view = vizSel?.value || 'routes';

        if (view === 'heat') {
            // collect all coords
            const heatPoints = [];
            visible.forEach(a => {
                const coords = parseActivityPolyline(a);
                if (coords && coords.length) coords.forEach(c => heatPoints.push([c[0], c[1], 0.5]));
                else if (a.start_latlng && a.start_latlng.length === 2) heatPoints.push([a.start_latlng[0], a.start_latlng[1], 0.5]);
            });
            if (heatPoints.length) {
                try { window._stravaHeat = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 12 }).addTo(window._stravaMap); } catch (e) { }
            }
        }

        visible.forEach(a => {
            // Polylines
            const coords = parseActivityPolyline(a);
            if (view === 'routes' && coords && coords.length) {
                const poly = L.polyline(coords, { color: '#1f78b4', weight: 2, opacity: 0.6, smoothFactor: 1 }).addTo(window._stravaPolylines);
                bounds.push(...coords);
                poly.activity = a;
            }

            // Points view or also add start/end for routes
            if (view === 'points' || (view === 'routes' && !coords)) {
                if (a.start_latlng && a.start_latlng.length === 2) {
                    const m = L.circleMarker([a.start_latlng[0], a.start_latlng[1]], { radius: 5, color: 'green', fillColor: 'green', fillOpacity: 0.9 });
                    m.bindPopup(`<strong>${a.name || a.type}</strong><br>${a.start_date_local || ''}`);
                    m.addTo(window._stravaPoints);
                    bounds.push([a.start_latlng[0], a.start_latlng[1]]);
                }

                // end point: try end_latlng or last point of polyline
                let end = null;
                if (a.end_latlng && a.end_latlng.length === 2) end = a.end_latlng;
                else if (coords && coords.length) end = coords[coords.length - 1];
                if (end) {
                    const me = L.circleMarker([end[0], end[1]], { radius: 5, color: 'red', fillColor: 'red', fillOpacity: 0.9 });
                    me.bindPopup(`<strong>End: ${a.name || a.type}</strong><br>${a.start_date_local || ''}`);
                    me.addTo(window._stravaPoints);
                    bounds.push([end[0], end[1]]);
                }
            }
        });

        // Fit to bounds if any
        if (bounds.length) {
            try {
                const bb = L.latLngBounds(bounds);
                window._stravaMap.fitBounds(bb.pad(0.1));
            } catch (e) { }
        }
    }

    // Tile switcher
    tilesSel?.addEventListener('change', () => {
        if (!window._stravaMap) return;
        try { window._stravaMap.removeLayer(window._stravaBase); } catch (e) { }
        window._stravaBase = makeTileLayer(tilesSel.value);
        window._stravaBase.addTo(window._stravaMap);
    });

    // Controls
    applyBtn?.addEventListener('click', () => render());
    resetBtn?.addEventListener('click', () => {
        dateFromInput.value = '';
        dateToInput.value = '';
        hourFrom.value = '';
        hourTo.value = '';
        sportSel.value = 'all';
        render();
    });
    vizSel?.addEventListener('change', () => render());
    sportSel?.addEventListener('change', () => render());
    hourFrom?.addEventListener('change', () => render());
    hourTo?.addEventListener('change', () => render());

    // Initial render
    render();
}

export default { renderMapTab };
