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
        // ⚠️ CAMBIO CRUCIAL: ahora pasamos el ID como query param
        const response = await fetch(`/api/strava-activity?id=${activityId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-refresh-token': localStorage.getItem('strava_refresh_token') || ''
          }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const act = await response.json();
        console.log(act); // Para ayudarte a decidir qué mostrar

        detailsDiv.innerHTML = `<table class="df-table">
            <tbody>
                ${Object.entries(act).map(([k, v]) => `
                    <tr><th>${k}</th><td>${typeof v === 'object' ? `<pre>${JSON.stringify(v, null, 2)}</pre>` : v}</td></tr>
                `).join('')}
            </tbody>
        </table>`;
    } catch (err) {
        detailsDiv.innerHTML = `<p>Error: ${err.message}</p>`;
    }
}

fetchActivity();
