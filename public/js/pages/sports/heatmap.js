// /public/js/pages/sports/heatmap.js
import { handleAuth } from '../../modules/auth.js';
import { fetchAllActivities } from '../../modules/api.js';
import { showLoading, hideLoading, handleError } from '../../modules/ui.js';
import { decodePolyline } from '../../modules/utils.js';

export function init() {
    console.log("Initializing Global Heatmap Page...");

    async function initializeApp() {
        console.log("Calling fetchAllActivities...");
        showLoading('Fetching activities from Strava...');
        try {
            const allActivities = await fetchAllActivities();
            console.log(`Fetched ${allActivities.length} activities.`);
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
        const loadingMessage = document.getElementById('loading-message');
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        if (!mapContainer || !progressBar || !progressText) {
            console.log("Missing map or progress elements in DOM.");
            return;
        }

        // Inicializa el mapa
        console.log("Initializing Leaflet map...");
        const map = L.map(mapContainer).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const allCoords = [];
        const totalActivities = activities.length;
        const chunkSize = 50;

        loadingMessage.textContent = 'Processing routes...';

        for (let i = 0; i < totalActivities; i += chunkSize) {
            const chunk = activities.slice(i, i + chunkSize);
            console.log(`Processing activities ${i + 1} to ${Math.min(i + chunkSize, totalActivities)}...`);

            chunk.forEach(act => {
                if (act.map && act.map.summary_polyline) {
                    const coords = decodePolyline(act.map.summary_polyline);
                    if (coords.length > 0) {
                        L.polyline(coords, { color: '#FC5200', weight: 2, opacity: 0.6 }).addTo(map);
                        allCoords.push(...coords);
                    }
                }
            });

            const processedCount = Math.min(i + chunkSize, totalActivities);
            const percentage = Math.round((processedCount / totalActivities) * 100);

            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `Processed ${processedCount} of ${totalActivities} activities (${percentage}%)`;

            console.log(`Progress: ${percentage}% (${processedCount}/${totalActivities})`);

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        console.log(`Finished processing. Added ${allCoords.length > 0 ? 'routes' : 'no routes'} to the map.`);

        if (allCoords.length > 0) {
            map.fitBounds(allCoords, { padding: [50, 50] });
        } else {
            mapContainer.innerHTML = '<p>No activities with routes found to display on the map.</p>';
        }

        hideLoading();
        console.log("Heatmap rendering complete.");
    }

    handleAuth(initializeApp).catch(error => {
        console.error("Heatmap page failed to start:", error);
        hideLoading();
    });
}