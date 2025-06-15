import fetch from 'node-fetch';

// --- Utilidad para refrescar el access token ---
async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Failed to refresh token:', text);
    throw new Error('Token refresh failed');
  }

  return await response.json();
}

// --- Utilidad para obtener un access_token válido ---
async function getValidAccessToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const payloadRaw = authHeader.split(' ')[1];
  const tokenData = JSON.parse(Buffer.from(payloadRaw, 'base64').toString());
  const { access_token, refresh_token, expires_at } = tokenData;

  if (!access_token || !refresh_token || !expires_at) {
    throw new Error('Incomplete token data');
  }

  const now = Math.floor(Date.now() / 1000);
  if (expires_at > now) {
    return { access_token, updatedTokens: null };
  }

  // Token expired, refresh
  const refreshed = await refreshAccessToken(refresh_token);
  return {
    access_token: refreshed.access_token,
    updatedTokens: {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at
    }
  };
}

// --- Handler principal ---
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Gear ID is required' });
  }

  try {
    const { access_token, updatedTokens } = await getValidAccessToken(req);

    const gearUrl = `https://www.strava.com/api/v3/gear/${id}`;
    const response = await fetch(gearUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message });
    }

    // Devuelve también los tokens actualizados si los hay
    res.status(200).json({ ...data, tokens: updatedTokens });
  } catch (err) {
    console.error('Error fetching gear:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

async function renderGearInfo(runs) {
  // Agrupa por gear_id
  const gearIds = Array.from(new Set(runs.map(a => a.gear_id).filter(Boolean)));
  const gearInfoList = document.getElementById('gear-info-list');
  if (!gearInfoList) return;

  gearInfoList.innerHTML = '<p>Loading gear info...</p>';

  // Fetch info for each gear
  const gearDetails = await Promise.all(gearIds.map(async gearId => {
    try {
      const gear = await fetchGearById(gearId);
      // Calcula distancia total con ese gear
      const totalKm = runs.filter(a => a.gear_id === gearId)
        .reduce((sum, a) => sum + a.distance, 0) / 1000;
      return {
        id: gearId,
        name: `${gear.brand_name} ${gear.model_name}`,
        type: gear.type,
        distance: totalKm.toFixed(1),
        nickname: gear.nickname || '',
        retired: gear.retired ? 'Yes' : 'No'
      };
    } catch {
      return { id: gearId, name: 'Unknown', type: '', distance: '-', nickname: '', retired: '' };
    }
  }));

  // Render cards
  gearInfoList.innerHTML = gearDetails.map(g => `
      <div class="gear-card">
        <h4>${g.name}</h4>
        ${g.nickname ? `<div><span class="gear-label">Nickname:</span> ${g.nickname}</div>` : ''}
        <div><span class="gear-label">Type:</span> ${g.type}</div>
        <div><span class="gear-label">Total Distance:</span> ${g.distance} km</div>
        <div><span class="gear-label">Retired:</span> ${g.retired}</div>
      </div>
    `).join('');
}

renderGearInfo(runs);
