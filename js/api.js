// js/api.js

// ===================================================================
// CACHE CONFIGURATION
// ===================================================================
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

function getFromCache(key) {
    const cached = localStorage.getItem(key);
    const timestamp = localStorage.getItem(`${key}_timestamp`);

    if (!cached || !timestamp) return null;

    const age = Date.now() - parseInt(timestamp);
    if (age > CACHE_DURATION) {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_timestamp`);
        return null;
    }

    try {
        return JSON.parse(cached);
    } catch (e) {
        console.warn(`Cache parse error for ${key}:`, e);
        return null;
    }
}

function saveToCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(`${key}_timestamp`, Date.now().toString());
    } catch (e) {
        console.warn(`Cache save error for ${key}:`, e);
    }
}

// ===================================================================
// AUTH & HELPERS
// ===================================================================
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
    // Check cache first
    const cacheKey = `strava_gear_${gearId}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
        return cached;
    }

    const response = await fetch(`/api/strava-gear?id=${encodeURIComponent(gearId)}`, {
        headers: {
            Authorization: `Bearer ${getAuthPayload()}`
        }
    });
    const result = await handleApiResponse(response);
    const gear = result.gear;

    saveToCache(cacheKey, gear);
    return gear;
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
    // Check cache first
    const cached = getFromCache('strava_athlete');
    if (cached) {
        return cached;
    }

    const response = await fetch('/api/strava-athlete', {
        headers: { Authorization: `Bearer ${getAuthPayload()}` }
    });
    const result = await handleApiResponse(response);
    const athlete = result.athlete;

    saveToCache('strava_athlete', athlete);
    return athlete;
}

export async function fetchTrainingZones() {
    // Check cache first
    const cached = getFromCache('strava_zones');
    if (cached) {
        return cached;
    }

    const response = await fetch('/api/strava-zones', {
        headers: { Authorization: `Bearer ${getAuthPayload()}` }
    });
    const result = await handleApiResponse(response);
    const zones = result.zones;

    saveToCache('strava_zones', zones);
    return zones;
}

export async function fetchAllGears(athlete) {
    const rawGearIds = [...(athlete.shoes || []), ...(athlete.bikes || [])];
    const gearIds = rawGearIds.map(g => {
        if (typeof g === 'string') return g;
        if (g && typeof g === 'object' && g.id) return g.id;
        return null;
    }).filter(id => id);
    if (gearIds.length === 0) return [];

    // Use Promise.allSettled so failed gear fetches don't block others
    const results = await Promise.allSettled(gearIds.map(id => fetchGearById(id)));

    // Filter out rejected promises and return only successful gears
    return results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(g => g); // Remove null/undefined
}