// /api/strava-gear.js
import fetch from 'node-fetch';

// --- FUNCIÓN HELPER (igual a las otras, con el buffer de tiempo) ---
async function getValidAccessToken(req) {
    // ... Pega aquí la misma función getValidAccessToken de los otros archivos ...
    // Asegúrate de que tenga el buffer: if (expires_at > now + 60)
}

// --- HANDLER PRINCIPAL ---
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Gear ID is required' });
    }

    try {
        const { accessToken, updatedTokens } = await getValidAccessToken(req);

        const gearUrl = `https://www.strava.com/api/v3/gear/${id}`;
        const stravaResponse = await fetch(gearUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!stravaResponse.ok) {
            const data = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: data.message });
        }
        
        const gear = await stravaResponse.json();

        // Devolvemos una respuesta consistente
        res.status(200).json({ gear: gear, tokens: updatedTokens });

    } catch (err) {
        console.error('Error fetching gear:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
}

// ¡IMPORTANTE! Las funciones de renderizado NUNCA deben estar en el backend.
// Este código se elimina de este archivo.
// async function renderGearInfo(runs) { ... }
// renderGearInfo(runs);