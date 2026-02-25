import { getValidAccessToken } from './_shared.js';

export default async function handler(req, res) {
    try {
        const { accessToken, updatedTokens } = await getValidAccessToken(req);

        const activitiesUrl = 'https://www.strava.com/api/v3/athlete/activities';
        let allActivities = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            const url = `${activitiesUrl}?page=${page}&per_page=${perPage}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Strava API: ${errorData.message}`);
            }

            const pageActivities = await response.json();
            if (pageActivities.length === 0) hasMore = false;
            else {
                allActivities.push(...pageActivities);
                page++;
            }
        }

        return res.status(200).json({ activities: allActivities, tokens: updatedTokens });

    } catch (error) {
        console.error('Error in strava-activities:', error);
        return res.status(500).json({ error: error.message });
    }
}
