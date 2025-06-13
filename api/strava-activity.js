export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  // Get the activity ID from the query string
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Activity ID is required' });
  }

  // Get the access token from the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header is missing or invalid' });
  }
  const accessToken = authHeader.split(' ')[1];

  try {
    const url = `https://www.strava.com/api/v3/activities/${id}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const activity = await response.json();
    res.status(200).json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}