// js/planner.js

// We can reuse the Riegel prediction logic. Let's assume it's in a shared 'utils' or 'ui' file.
// For simplicity, I'll copy the function here, but ideally it would be imported.
import { renderRiegelPredictions } from './ui.js'; 

// --- DOM REFERENCES ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');

function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.classList.remove('hidden');
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}


// --- Main Logic for the Planner Page ---
document.addEventListener('DOMContentLoaded', () => {
    showLoading('Loading your activities...');

    // Get all activities from localStorage (provided by the main dashboard page)
    const allActivitiesText = localStorage.getItem('strava_all_activities');
    
    if (!allActivitiesText) {
        const container = document.getElementById('riegel-predictions');
        container.innerHTML = `
            <p style="color: red;">
                Could not find activity data. Please go back to the 
                <a href="index.html">main dashboard</a> to load your activities first.
            </p>`;
        hideLoading();
        return;
    }

    const allActivities = JSON.parse(allActivitiesText);
    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    // Render the Riegel predictions
    // The renderRiegelPredictions function is already in ui.js, so we just call it.
    renderRiegelPredictions(runs);

    // The VDOT calculator iframe loads by itself, no JS needed for it.
    
    hideLoading();
});