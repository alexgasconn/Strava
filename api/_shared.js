// api/_shared.js — Shared authentication utilities for all API endpoints

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
        const errorText = await response.text();
        console.error('Token refresh failed:', errorText);
        throw new Error('Token refresh failed');
    }

    return await response.json();
}

export async function getValidAccessToken(req) {
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
    if (expires_at > now + 60) {
        return { accessToken: access_token, updatedTokens: null };
    }

    // Token expired (or about to), refresh it
    const refreshed = await refreshAccessToken(refresh_token);
    return {
        accessToken: refreshed.access_token,
        updatedTokens: {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at
        }
    };
}

export function validateEnv() {
    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
        throw new Error('Server configuration error: Strava environment variables are not set.');
    }
}
