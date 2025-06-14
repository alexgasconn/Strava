// api/strava-streams.js
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header is missing or invalid' });
  }
  const accessToken = authHeader.split(' ')[1];

  try {
    const url = `https://www.strava.com/api/v3/activities/${id}/streams?keys=${type}&key_by_type=true`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }
    
    // Devolvemos el objeto completo con todos los streams pedidos
    const streamData = await response.json();
    res.status(200).json(streamData);

  } catch (error) {
    console.error('Error fetching streams from Strava:', error);
    res.status(500).json({ error: error.message });
  }
}