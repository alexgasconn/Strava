// /api/strava-gear.js
import fetch from 'node-fetch';

// --- ¡ASEGÚRATE DE QUE ESTA FUNCIÓN ESTÁ COMPLETA! ---
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
    if (expires_at > now + 60) {
        return { accessToken: access_token, updatedTokens: null };
    }

    console.log(`[strava-gear] Token expired. Refreshing...`);
    const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Token refresh failed:", errorText);
        throw new Error('Token refresh failed');
    }
    const refreshed = await response.json();
    
    return {
        accessToken: refreshed.access_token,
        updatedTokens: {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at
        }
    };
}


// --- HANDLER PRINCIPAL (Este ya estaba bien) ---
export default async function handler(req, res) {
    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
      return res.status(500).json({ error: "Server config error" });
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Gear ID is required' });
    }

    try {
        const { accessToken, updatedTokens } = await getValidAccessToken(req);
        // ... el resto del handler ...
        const gearUrl = `https://www.strava.com/api/v3/gear/${id}`;
        const stravaResponse = await fetch(gearUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!stravaResponse.ok) {
            const data = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: data.message });
        }
        const gear = await stravaResponse.json();
        console.log(`[Backend] Datos del Gear ID ${id} recibidos de Strava:`, gear);
        res.status(200).json({ gear: gear, tokens: updatedTokens });

    } catch (err) {
        console.error('Error fetching gear:', err.message);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
}