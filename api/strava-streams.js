// api/strava-streams.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Solo permitimos método GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  // Validación de parámetros
  const { id, type } = req.query;
  if (!id || !type) {
    return res.status(400).json({ error: 'Activity ID and stream type are required' });
  }

  // Obtener token del header
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

    const streamData = await response.json();

    if (!streamData[type]) {
      return res.status(404).json({ error: `Stream type "${type}" not found in activity ${id}` });
    }

    res.status(200).json(streamData[type]);

  } catch (error) {
    console.error('Error fetching stream from Strava:', error);
    res.status(500).json({ error: error.message });
  }
}
