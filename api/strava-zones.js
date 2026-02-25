import { getValidAccessToken } from './_shared.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { accessToken, updatedTokens } = await getValidAccessToken(req);

        const stravaResponse = await fetch('https://www.strava.com/api/v3/athlete/zones', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!stravaResponse.ok) {
            const errData = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: 'Failed to fetch zones from Strava', details: errData });
        }

        const zonesData = await stravaResponse.json();
        return res.status(200).json({ zones: zonesData, tokens: updatedTokens });

    } catch (error) {
        console.error('Error in /api/strava-zones:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
