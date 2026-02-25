// js/api.js

function getAuthPayload() {
    const tokenData = localStorage.getItem('strava_tokens');
    if (!tokenData) throw new Error('User not authenticated');
    return btoa(tokenData);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function handleApiResponse(response) {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'API call failed');

    if (result.tokens) {
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
    const response = await fetch(`/api/strava-gear?id=${encodeURIComponent(gearId)}`, {
        headers: {
            Authorization: `Bearer ${getAuthPayload()}`
        }
    });
    const result = await handleApiResponse(response);
    return result.gear; // Extract the gear object from the response
}

export function renderAthleteProfile(athlete) {
    const container = document.getElementById('athlete-profile-card');
    const contentDiv = container.querySelector('.profile-content');
    if (!container || !contentDiv) return;

    contentDiv.innerHTML = `
        <img src="${escapeHtml(athlete.profile_medium)}" alt="Athlete profile picture">
        <div class="profile-details">
            <span class="name">${escapeHtml(athlete.firstname)} ${escapeHtml(athlete.lastname)}</span>
            <span class="location">${escapeHtml(athlete.city)}, ${escapeHtml(athlete.country)}</span>
            <span class="stats">Followers: ${Number(athlete.follower_count) || 0} | Friends: ${Number(athlete.friend_count) || 0}</span>
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
    const rawGearIds = [...(athlete.shoes || []), ...(athlete.bikes || [])];
    const gearIds = rawGearIds.map(g => {
        if (typeof g === 'string') return g;
        if (g && typeof g === 'object' && g.id) return g.id;
        return null;
    }).filter(id => id);
    if (gearIds.length === 0) return [];

    return Promise.all(gearIds.map(id => fetchGearById(id)));
}