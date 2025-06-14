export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Activity ID is required' });
  }

  const authHeader = req.headers.authorization;
  const refreshToken = req.headers['x-refresh-token'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  let accessToken = authHeader.split(' ')[1];

  async function fetchActivity(token) {
    const response = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response;
  }

  let response = await fetchActivity(accessToken);

  // Try refreshing if unauthorized and we have a refresh_token
  if (response.status === 401 && refreshToken) {
    try {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      const refreshData = await refreshRes.json();

      if (!refreshRes.ok) {
        return res.status(401).json({
          error: 'Token expired and refresh failed',
          stravaError: refreshData
        });
      }

      accessToken = refreshData.access_token;
      // Optionally send the new token to frontend
      res.setHeader('x-new-access-token', accessToken);

      response = await fetchActivity(accessToken);
    } catch (err) {
      return res.status(500).json({ error: 'Refresh token request failed', details: err.message });
    }
  }

  if (!response.ok) {
    const errData = await response.json();
    return res.status(response.status).json({ error: 'Failed to fetch activity', details: errData });
  }

  const activity = await response.json();
  return res.status(200).json(activity);
}
