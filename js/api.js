// js/api.js

function getAuthPayload() {
    const tokenData = localStorage.getItem('strava_tokens');
    if (!tokenData) throw new Error('User not authenticated');
    return btoa(tokenData); // Codifica el objeto de token en Base64
}

async function handleApiResponse(response) {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'API call failed');

    // Si la API devuelve tokens actualizados, los guardamos
    if (result.tokens) {
        console.log('Tokens refreshed and updated in localStorage.');
        localStorage.setItem('strava_tokens', JSON.stringify(result.tokens));
    }
    return result;
}

export async function fetchAllActivities() {
    const response = await fetch('/api/strava-activities', {
        headers: {
            Authorization: `Bearer ${getAuthPayload()}`
        }
    });
    const result = await handleApiResponse(response);
    return result.activities;
}

export async function fetchGearById(gearId) {
    const response = await fetch(`/api/strava-gear?id=${gearId}`, {
        headers: {
            Authorization: `Bearer ${getAuthPayload()}`
        }
    });
    return await handleApiResponse(response);
}