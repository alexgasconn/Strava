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

export function renderAthleteProfile(athlete) {
    const container = document.getElementById('athlete-profile-card');
    const contentDiv = container.querySelector('.profile-content');
    if (!container || !contentDiv) return;

    contentDiv.innerHTML = `
        <img src="${athlete.profile_medium}" alt="Athlete profile picture">
        <div class="profile-details">
            <span class="name">${athlete.firstname} ${athlete.lastname}</span>
            <span class="location">${athlete.city}, ${athlete.country}</span>
            <span class="stats">Followers: ${athlete.follower_count} | Friends: ${athlete.friend_count}</span>
        </div>
    `;
}

export async function fetchAthleteData() {
    const response = await fetch('/api/strava-athlete', {
        headers: { Authorization: `Bearer ${getAuthPayload()}` }
    });
    const result = await handleApiResponse(response);
    return result.athlete;
}

export async function fetchTrainingZones() {
    const response = await fetch('/api/strava-zones', {
        headers: { Authorization: `Bearer ${getAuthPayload()}` }
    });
    const result = await handleApiResponse(response);
    return result.zones;
}

export async function fetchAllGears(athlete) {
    const gearIds = [...(athlete.shoes || []), ...(athlete.bikes || [])].map(g => typeof g === 'string' ? g : g.id);
    if (gearIds.length === 0) return [];

    const gearPromises = gearIds.map(id => fetchGearById(id));
    const gears = await Promise.all(gearPromises);
    return gears;
}