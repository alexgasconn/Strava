export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { code } = req.body;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET'
    });
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code'
  });

  let response;
  try {
    response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: params
    });
  } catch (networkError) {
    const cause = networkError.cause?.message || networkError.cause?.code || '';
    const detail = cause ? `${networkError.message} (${cause})` : networkError.message;
    console.error('Strava token fetch — network error:', networkError.cause ?? networkError);
    return res.status(502).json({ error: `Cannot reach Strava: ${detail}` });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data.message || data.error || 'Strava auth failed';
    console.error('Strava auth error:', data);
    return res.status(400).json({ error: msg });
  }

  return res.status(200).json(data);
}
