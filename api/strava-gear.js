import { getValidAccessToken, validateEnv } from './_shared.js';

export default async function handler(req, res) {
    try {
        validateEnv();
    } catch (e) {
        return res.status(500).json({ error: e.message });
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

        const gearUrl = `https://www.strava.com/api/v3/gear/${encodeURIComponent(id)}`;
        const stravaResponse = await fetch(gearUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!stravaResponse.ok) {
            const data = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: data.message });
        }

        const gear = await stravaResponse.json();
        return res.status(200).json({ gear, tokens: updatedTokens });

    } catch (error) {
        console.error('Error fetching gear:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
