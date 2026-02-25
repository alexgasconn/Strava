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
        return res.status(400).json({ error: 'Activity ID is required' });
    }

    try {
        const { accessToken, updatedTokens } = await getValidAccessToken(req);

        const stravaResponse = await fetch(`https://www.strava.com/api/v3/activities/${encodeURIComponent(id)}?include_all_efforts=true`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!stravaResponse.ok) {
            const errData = await stravaResponse.json();
            return res.status(stravaResponse.status).json({ error: 'Failed to fetch activity from Strava', details: errData });
        }

        const activity = await stravaResponse.json();
        return res.status(200).json({ activity, tokens: updatedTokens });

    } catch (error) {
        console.error('Error in /api/strava-activity:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
