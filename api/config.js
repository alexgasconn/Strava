export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'Missing STRAVA_CLIENT_ID. Configure it in .env.local or Vercel environment variables.'
    });
  }

  return res.status(200).json({
    stravaClientId: clientId
  });
}
