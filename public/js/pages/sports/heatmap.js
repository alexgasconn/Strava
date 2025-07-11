// /public/js/pages/sports/heatmap.js
import { handleAuth } from '../../modules/auth.js';
import { fetchAllActivities } from '../../modules/api.js';
import { showLoading, hideLoading, handleError } from '../../modules/ui.js';
import { decodePolyline } from '../../modules/utils.js'; // Importaremos la función de decodificación

export function init() {
    console.log("Initializing Global Heatmap Page...");

    async function initializeApp() {
        showLoading('Loading all activity routes...');
        try {
            const allActivities = await fetchAllActivities();
            renderGlobalHeatmap(allActivities);
        } catch (error) {
            handleError("Could not build the global heatmap", error);
        } finally {
            hideLoading();
        }
    }

    function renderGlobalHeatmap(activities) {
        if (!window.L) {
            handleError("Leaflet library not loaded.", null);
            return;
        }

        const mapContainer = document.getElementById('global-heatmap-map');
        if (!mapContainer) return;

        // Inicializa el mapa centrado en una ubicación genérica (se ajustará después)
        const map = L.map(mapContainer).setView([20, 0], 2);

        // Añade la capa de mapa (puedes elegir un estilo oscuro si prefieres)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const allCoords = [];
        let routesAdded = 0;

        activities.forEach(act => {
            // Nos aseguramos de que la actividad tenga una ruta para dibujar
            if (act.map && act.map.summary_polyline) {
                const coords = decodePolyline(act.map.summary_polyline);
                if (coords.length > 0) {
                    // Dibuja la ruta en el mapa
                    L.polyline(coords, {
                        color: '#FC5200', // Naranja Strava
                        weight: 2,
                        opacity: 0.6
                    }).addTo(map);

                    // Agrega las coordenadas a un array global para ajustar el zoom
                    allCoords.push(...coords);
                    routesAdded++;
                }
            }
        });
        
        console.log(`Added ${routesAdded} routes to the map.`);

        // Si se encontraron rutas, ajusta el mapa para que se vean todas
        if (allCoords.length > 0) {
            map.fitBounds(allCoords, { padding: [50, 50] });
        } else {
            mapContainer.innerHTML = '<p>No activities with routes found to display on the map.</p>';
        }
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Heatmap page failed to start:", error);
        hideLoading();
    });
}