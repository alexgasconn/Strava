// /public/js/pages/sports/heatmap.js
import { handleAuth } from '../../modules/auth.js';
import { fetchAllActivities } from '../../modules/api.js';
import { showLoading, hideLoading, handleError } from '../../modules/ui.js';
import { decodePolyline } from '../../modules/utils.js';

export function init() {
    console.log("Initializing Global Heatmap Page...");

    async function initializeApp() {
        // La pantalla de carga se muestra aquí
        showLoading('Fetching activities from Strava...');
        try {
            const allActivities = await fetchAllActivities();
            // Una vez obtenidos los datos, pasamos al renderizado progresivo
            await renderGlobalHeatmap(allActivities);
        } catch (error) {
            handleError("Could not build the global heatmap", error);
        } finally {
            // El hideLoading se llamará al final de renderGlobalHeatmap
        }
    }

    async function renderGlobalHeatmap(activities) {
        if (!window.L) {
            handleError("Leaflet library not loaded.", null);
            return;
        }

        const mapContainer = document.getElementById('global-heatmap-map');
        // Obtenemos referencias a los elementos de progreso
        const loadingMessage = document.getElementById('loading-message');
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        if (!mapContainer || !progressBar || !progressText) return;

        // Inicializa el mapa
        const map = L.map(mapContainer).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const allCoords = [];
        const totalActivities = activities.length;
        const chunkSize = 50; // Procesaremos actividades en lotes de 50

        loadingMessage.textContent = 'Processing routes...';

        for (let i = 0; i < totalActivities; i += chunkSize) {
            const chunk = activities.slice(i, i + chunkSize);
            
            chunk.forEach(act => {
                if (act.map && act.map.summary_polyline) {
                    const coords = decodePolyline(act.map.summary_polyline);
                    if (coords.length > 0) {
                        L.polyline(coords, { color: '#FC5200', weight: 2, opacity: 0.6 }).addTo(map);
                        allCoords.push(...coords);
                    }
                }
            });

            // Actualizar el progreso
            const processedCount = Math.min(i + chunkSize, totalActivities);
            const percentage = Math.round((processedCount / totalActivities) * 100);

            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `Processed ${processedCount} of ${totalActivities} activities (${percentage}%)`;
            
            // ¡Esta es la parte clave!
            // Hacemos una pausa para permitir que el navegador actualice la UI.
            await new Promise(resolve => setTimeout(resolve, 0)); 
        }
        
        console.log(`Finished processing. Added ${allCoords.length > 0 ? 'routes' : 'no routes'} to the map.`);

        if (allCoords.length > 0) {
            map.fitBounds(allCoords, { padding: [50, 50] });
        } else {
            mapContainer.innerHTML = '<p>No activities with routes found to display on the map.</p>';
        }
        
        // Ocultamos la pantalla de carga solo cuando todo ha terminado.
        hideLoading();
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Heatmap page failed to start:", error);
        hideLoading();
    });
}