const params = new URLSearchParams(window.location.search);
const activityId = params.get('id');
console.log(`Activity ID: ${activityId}`);
const detailsDiv = document.getElementById('activity-details');

async function fetchActivity() {
    const accessToken = localStorage.getItem('strava_access_token');
    console.log(`Access Token: ${accessToken}`);

    if (!accessToken) {
        detailsDiv.innerHTML = "<p>You must be logged in to view activity details.</p>";
        return;
    }
    try {
        detailsDiv.innerHTML = "<p>Loading...</p>";
        const response = await fetch(`/api/strava-activity/${activityId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        const act = await response.json();
        // Show all fields in a table
        detailsDiv.innerHTML = `<table class="df-table">
            <tbody>
                ${Object.entries(act).map(([k, v]) => `<tr><th>${k}</th><td>${typeof v === 'object' ? JSON.stringify(v) : v}</td></tr>`).join('')}
            </tbody>
        </table>`;
    } catch (err) {
        detailsDiv.innerHTML = `<p>Error: ${err.message}</p>`;
    }
}
fetchActivity();