// /api/strava-activity.js
import fetch from 'node-fetch';

// --- COPIAMOS LA MISMA FUNCIÓN HELPER DE LOS OTROS ENDPOINTS ---
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
    // Usamos un pequeño buffer para refrescar antes de que expire justo en el momento
    if (expires_at > now + 60) {
        return { accessToken: access_token, updatedTokens: null };
    }

    // Token expirado, lo refrescamos
    console.log(`[strava-activity] Token expired. Refreshing...`);
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


// --- HANDLER PRINCIPAL ---
export default async function handler(req, res) {
    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
          console.error("Server configuration error: Strava environment variables are not set.");
          return res.status(500).json({ error: "Server configuration error. Please contact the administrator." });
      }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Activity ID is required' });
    }

    try {
        // Obtenemos un token válido (nuevo o el que ya teníamos)
        const { accessToken, updatedTokens } = await getValidAccessToken(req);

        // Hacemos la llamada a la API de Strava con el token válido
        const stravaResponse = await fetch(`https://www.strava.com/api/v3/activities/${id}?include_all_efforts=true`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!stravaResponse.ok) {
            const errData = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: 'Failed to fetch activity from Strava', details: errData });
        }

        const activity = await stravaResponse.json();
        
        // Devolvemos una respuesta consistente: un objeto con la actividad y los tokens (si se actualizaron)
        return res.status(200).json({ activity: activity, tokens: updatedTokens });

    } catch (error) {
        console.error("Error in /api/strava-activity:", error.message);
        return res.status(500).json({ error: error.message });
    }
}