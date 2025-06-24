// /api/strava-streams.js
import fetch from 'node-fetch';

// --- Función Helper Unificada ---
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

    console.log(`[strava-streams] Token expired. Refreshing...`);
    
    // --- ¡AQUÍ ESTABA EL ERROR! Faltaba el cuerpo de la petición ---
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
    // --- FIN DE LA CORRECCIÓN ---

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


// --- HANDLER PRINCIPAL ---
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id, type } = req.query;
    if (!id || !type) {
        return res.status(400).json({ error: 'Activity ID and stream types are required' });
    }

    try {
        const { accessToken, updatedTokens } = await getValidAccessToken(req);
        
        const url = `https://www.strava.com/api/v3/activities/${id}/streams?keys=${type}&key_by_type=true`;
        const stravaResponse = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!stravaResponse.ok) {
            const errData = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: 'Failed to fetch streams from Strava', details: errData });
        }

        const streams = await stravaResponse.json();
        return res.status(200).json({ streams: streams, tokens: updatedTokens });
        
    } catch (error) {
        console.error("Error in /api/strava-streams:", error.message);
        return res.status(500).json({ error: error.message });
    }
}