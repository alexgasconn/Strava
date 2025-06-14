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
    return res.status(401).json({ error: 'Authorization header is missing' });
  }
  const accessToken = authHeader.split(' ')[1];

  try {
    const url = `https://www.strava.com/api/v3/activities/${id}/streams?keys=${type}&key_by_type=true`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const responseText = await response.text();
    if (!response.ok) {
        console.error(`Strava Streams API Error (${response.status}):`, responseText);
        try {
            return res.status(response.status).json(JSON.parse(responseText));
        } catch (e) {
            return res.status(response.status).json({ message: responseText });
        }
    }
    
    const streamData = JSON.parse(responseText);
    return res.status(200).json(streamData);

  } catch (error) {
    console.error('Error fetching stream from Strava:', error);
    return res.status(500).json({ error: 'Server failed to process stream request.', details: error.message });
  }
}