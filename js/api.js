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

// --- NUEVA FUNCIÓN PARA RENDERIZAR EL PERFIL DEL ATLETA ---
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

// --- NUEVA FUNCIÓN PARA RENDERIZAR LAS ZONAS DE ENTRENAMIENTO ---
export function renderTrainingZones(zones) {
    const container = document.getElementById('training-zones-card');
    const contentDiv = container.querySelector('.zones-content');
    if (!container || !contentDiv) return;
    
    let html = '';

    // Renderizar Zonas de Frecuencia Cardíaca
    if (zones.heart_rate && zones.heart_rate.zones && zones.heart_rate.zones.length > 0) {
        const hrZones = zones.heart_rate.zones;
        html += `
            <div class="zone-group">
                <h4>Heart Rate Zones (bpm)</h4>
                <div class="zone-bar">
                    <div class="zone-segment hr-z1" style="flex-basis: ${hrZones[0].max}%;" title="Z1: < ${hrZones[0].max}">${hrZones[0].max}</div>
                    <div class="zone-segment hr-z2" style="flex-basis: ${hrZones[1].max - hrZones[1].min}%;" title="Z2: ${hrZones[1].min}-${hrZones[1].max}">${hrZones[1].max}</div>
                    <div class="zone-segment hr-z3" style="flex-basis: ${hrZones[2].max - hrZones[2].min}%;" title="Z3: ${hrZones[2].min}-${hrZones[2].max}">${hrZones[2].max}</div>
                    <div class="zone-segment hr-z4" style="flex-basis: ${hrZones[3].max - hrZones[3].min}%;" title="Z4: ${hrZones[3].min}-${hrZones[3].max}">${hrZones[3].max}</div>
                    <div class="zone-segment hr-z5" style="flex-basis: 20%;" title="Z5: > ${hrZones[4].min}">${hrZones[4].min}+</div>
                </div>
            </div>`;
    }

    // Renderizar Zonas de Potencia (si existen)
    if (zones.power && zones.power.zones && zones.power.zones.length > 0) {
        const ftp = zones.power.zones[zones.power.zones.length-1].min; // El FTP es el inicio de la última zona
        html += `
            <div class="zone-group">
                <h4>Functional Threshold Power (FTP)</h4>
                <p style="font-size: 1.5rem; font-weight: bold; color: var(--text-dark); margin: 0;">${ftp} W</p>
            </div>
        `;
    }
    
    contentDiv.innerHTML = html || '<p>No training zones configured in your Strava profile.</p>';
}