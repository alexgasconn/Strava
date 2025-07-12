async function initializeApp() {
    console.log("LOG: initializeApp started. Waiting for authentication...");
    showLoading('Fetching activities from Strava...');
    try {
        const allActivities = await fetchAllActivities();
        // --- NUEVO LOG ---
        console.log(`LOG: API fetch successful. Found ${allActivities.length} activities.`);
        
        await renderGlobalHeatmap(allActivities);
    } catch (error) {
        handleError("Could not build the global heatmap", error);
    }
}

async function renderGlobalHeatmap(activities) {
    // --- NUEVO LOG ---
    console.log("LOG: renderGlobalHeatmap started.");

    if (!window.L) {
        handleError("Leaflet library not loaded.", null);
        return;
    }

    const mapContainer = document.getElementById('global-heatmap-map');
    const loadingMessage = document.getElementById('loading-message');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    if (!mapContainer || !progressBar || !progressText) {
        console.error("LOG: Critical HTML element for map or progress bar is missing.");
        return;
    }
    
    // --- NUEVO LOG ---
    console.log("LOG: Initializing Leaflet map.");
    const map = L.map(mapContainer).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const allCoords = [];
    const totalActivities = activities.length;
    const chunkSize = 50;

    loadingMessage.textContent = 'Processing routes...';
    console.log(`LOG: Starting to process ${totalActivities} activities in chunks of ${chunkSize}.`);

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

        const processedCount = Math.min(i + chunkSize, totalActivities);
        const percentage = Math.round((processedCount / totalActivities) * 100);

        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `Processed ${processedCount} of ${totalActivities} activities (${percentage}%)`;
        
        // --- NUEVO LOG (solo se mostrará algunas veces, no inundará la consola) ---
        if (processedCount % (chunkSize * 2) === 0 || processedCount === totalActivities) {
             console.log(`LOG: Progress - ${processedCount} / ${totalActivities}`);
        }

        await new Promise(resolve => setTimeout(resolve, 0)); 
    }
    
    // --- NUEVO LOG ---
    console.log("LOG: Finished processing. Total coordinates found:", allCoords.length);

    if (allCoords.length > 0) {
        console.log("LOG: Adjusting map view to fit all routes...");
        map.fitBounds(allCoords, { padding: [50, 50] });
        console.log("LOG: Map view adjusted.");
    } else {
        mapContainer.innerHTML = '<p>No activities with routes found to display on the map.</p>';
    }
    
    hideLoading();
}

handleAuth(initializeApp).catch(error => {
    console.error("Heatmap page failed to start:", error);
    hideLoading();
});