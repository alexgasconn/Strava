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
    const vizSel = document.getElementById('map-visualization');
    const tilesSel = document.getElementById('map-tiles');
    const densitySlider = document.getElementById('map-heat-intensity');
    const radiusSlider = document.getElementById('map-heat-radius');
    const blurSlider = document.getElementById('map-heat-blur');
    const colorBySportCheckbox = document.getElementById('map-color-by-sport');
    const mapEl = document.getElementById('global-map');

    // color palette per activity type when showing all sports
    const typeColors = {
        Run: '#e31a1c',
        Ride: '#1f78b4',
        Swim: '#33a02c',
        Walk: '#ff7f00',
        Hike: '#6a3d9a',
        Row: '#b15928',
        Default: '#888'
    };

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
            // Date filter (convert dd/mm/yyyy inputs to ISO)
            const d = a.start_date_local ? a.start_date_local.split('T')[0] : null;
            const parseDMY = str => {
                const parts = str.split('/');
                if (parts.length !== 3) return null;
                const [dd, mm, yy] = parts;
                return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            };
            if (dateFromInput?.value) {
                const iso = parseDMY(dateFromInput.value);
                if (iso && d && d < iso) return false;
            }
            if (dateToInput?.value) {
                const iso = parseDMY(dateToInput.value);
                if (iso && d && d > iso) return false;
            }
            // Sport filter
            if (sportSel?.value && sportSel.value !== 'all' && a.type !== sportSel.value) return false;
            return true;
        });
    }

    function render() {
        clearLayers();
        const visible = filterActivities();
        const bounds = [];
        const view = vizSel?.value || 'routes';

        if (view === 'heat') {
            const factor = parseFloat(densitySlider?.value) || 2;
            const rad = parseInt(radiusSlider?.value, 10) || 9;
            const blur = parseInt(blurSlider?.value, 10) || 14;
            const heatPoints = [];
            visible.forEach(a => {
                const coords = parseActivityPolyline(a);
                if (coords && coords.length) coords.forEach(c => heatPoints.push([c[0], c[1], 0.5 * factor]));
                else if (a.start_latlng && a.start_latlng.length === 2) heatPoints.push([a.start_latlng[0], a.start_latlng[1], 0.5 * factor]);
            });
            if (heatPoints.length) {
                console.log(`factor: ${factor}, rad: ${rad}, blur: ${blur}, points: ${heatPoints.length}`);
                try { window._stravaHeat = L.heatLayer(heatPoints, { radius: rad, blur: blur, maxZoom: 12 }).addTo(window._stravaMap); } catch (e) { }
            }
        } else {
            visible.forEach(a => {
                const coords = parseActivityPolyline(a);
                const useColorBySport = colorBySportCheckbox ? colorBySportCheckbox.checked : true;
                const baseColor = (sportSel?.value && sportSel.value !== 'all')
                    ? '#e31a1c'
                    : (useColorBySport ? (typeColors[a.type] || typeColors.Default) : '#e31a1c');

                if (view === 'routes' && coords && coords.length) {
                    const poly = L.polyline(coords, { color: baseColor, weight: 3, opacity: 0.8, smoothFactor: 1 }).addTo(window._stravaPolylines);
                    bounds.push(...coords);
                    poly.activity = a;
                }

                if (view === 'points' || (view === 'routes' && !coords)) {
                    if (a.start_latlng && a.start_latlng.length === 2) {
                        const m = L.circleMarker([a.start_latlng[0], a.start_latlng[1]], { radius: 5, color: baseColor, fillColor: baseColor, fillOpacity: 0.9 });
                        m.bindPopup(`<strong>${a.name || a.type}</strong><br>${a.start_date_local || ''}`);
                        m.addTo(window._stravaPoints);
                        bounds.push([a.start_latlng[0], a.start_latlng[1]]);
                    }
                    let end = null;
                    if (a.end_latlng && a.end_latlng.length === 2) end = a.end_latlng;
                    else if (coords && coords.length) end = coords[coords.length - 1];
                    if (end) {
                        const me = L.circleMarker([end[0], end[1]], { radius: 5, color: baseColor, fillColor: baseColor, fillOpacity: 0.9 });
                        me.bindPopup(`<strong>End: ${a.name || a.type}</strong><br>${a.start_date_local || ''}`);
                        me.addTo(window._stravaPoints);
                        bounds.push([end[0], end[1]]);
                    }
                }
            });
        }

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
        sportSel.value = 'all';
        if (densitySlider) densitySlider.value = '0.5';
        if (radiusSlider) radiusSlider.value = '25';
        if (blurSlider) blurSlider.value = '15';
        if (colorBySportCheckbox) colorBySportCheckbox.checked = true;
        render();
    });
    vizSel?.addEventListener('change', () => render());
    sportSel?.addEventListener('change', () => render());
    densitySlider?.addEventListener('input', () => render());
    radiusSlider?.addEventListener('input', () => render());
    blurSlider?.addEventListener('input', () => render());
    colorBySportCheckbox?.addEventListener('change', () => render());

    // Initial render
    render();
}

export default { renderMapTab };

