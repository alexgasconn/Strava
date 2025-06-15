async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Failed to refresh token:', text);
    throw new Error('Token refresh failed');
  }

  return await response.json(); // returns new access_token, refresh_token, expires_at
}

async function getValidAccessToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const payloadRaw = authHeader.split(' ')[1];
  const tokenData = JSON.parse(Buffer.from(payloadRaw, 'base64').toString());
  const { access_token, refresh_token, expires_at } = tokenData;

  if (!access_token || !refresh_token || !expires_at) {
    throw new Error('Incomplete token data');
  }

  const now = Math.floor(Date.now() / 1000);
  if (expires_at > now) {
    return { access_token, updatedTokens: null };
  }

  // Token expired, refresh
  const refreshed = await refreshAccessToken(refresh_token);
  return {
    access_token: refreshed.access_token,
    updatedTokens: {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at
    }
  };
}

export default async function handler(req, res) {
  try {
    const { access_token, updatedTokens } = await getValidAccessToken(req);

    const activitiesUrl = 'https://www.strava.com/api/v3/athlete/activities';
    let allActivities = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${activitiesUrl}?page=${page}&per_page=${perPage}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Strava API error:', errorData);
        throw new Error(`Strava API: ${errorData.message}`);
      }

      const pageActivities = await response.json();
      if (pageActivities.length === 0) hasMore = false;
      else {
        allActivities.push(...pageActivities);
        page++;
      }
    }

    return res.status(200).json({ activities: allActivities, tokens: updatedTokens });

  } catch (error) {
    console.error('Error in strava-activities:', error);
    return res.status(500).json({ error: error.message });
  }
}
