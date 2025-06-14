// api/strava-activity.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Activity ID is required' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }
  const accessToken = authHeader.split(' ')[1];

  try {
    const url = `https://www.strava.com/api/v3/activities/${id}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Strava API Error (${response.status}):`, errorText);
      try {
        const errorJson = JSON.parse(errorText);
        return res.status(response.status).json(errorJson);
      } catch {
        return res.status(response.status).json({ message: errorText });
      }
    }

    const activity = await response.json();  // ✅ más seguro
    return res.status(200).json(activity);

  } catch (error) {
    console.error("Internal Server Error in strava-activity:", error);
    return res.status(500).json({ error: 'Server failed to process the request.', details: error.message });
  }
}
