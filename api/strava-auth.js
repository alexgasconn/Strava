export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { code } = req.body;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code'
  });

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Strava auth error:', data);
      return res.status(500).json({ error: data.message || 'Strava auth failed' });
    }

    return res.status(200).json(data); // contiene access_token, refresh_token, expires_at
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
