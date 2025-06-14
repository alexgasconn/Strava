import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, type } = req.query;
  if (!id || !type) {
    return res.status(400).json({ error: 'Activity ID and stream types are required' });
  }

  const authHeader = req.headers.authorization;
  const refreshToken = req.headers['x-refresh-token'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  let accessToken = authHeader.split(' ')[1];

  const buildUrl = (token) =>
    `https://www.strava.com/api/v3/activities/${id}/streams?keys=${type}&key_by_type=true`;

  async function fetchStreams(token) {
    const res = await fetch(buildUrl(token), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res;
  }

  let response = await fetchStreams(accessToken);

  // If unauthorized, try refresh
  if (response.status === 401 && refreshToken) {
    try {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      const refreshData = await refreshRes.json();

      if (!refreshRes.ok) {
        return res.status(401).json({
          error: 'Token expired and refresh failed',
          stravaError: refreshData,
        });
      }

      accessToken = refreshData.access_token;
      res.setHeader('x-new-access-token', accessToken);

      response = await fetchStreams(accessToken);
    } catch (err) {
      return res.status(500).json({ error: 'Refresh token request failed', details: err.message });
    }
  }

  const text = await response.text();

  if (!response.ok) {
    try {
      return res.status(response.status).json(JSON.parse(text));
    } catch {
      console.error("Strava non-JSON error response:", text);
      return res.status(response.status).json({ message: text });
    }
  }

  try {
    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Invalid JSON from Strava:", text);
    return res.status(500).json({
      error: "Invalid JSON returned by Strava",
      details: err.message,
      raw: text
    });
  }
}
