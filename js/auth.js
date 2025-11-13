// js/auth.js
import { showLoading, handleError, hideLoading } from './ui.js';

const STRAVA_CLIENT_ID = '143540';
const REDIRECT_URI = window.location.origin + window.location.pathname;

export function redirectToStrava() {
    console.log("Redirecting to Strava for authorization...");
    const scope = 'read,activity:read_all,profile:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

export function logout() {
    localStorage.removeItem('strava_tokens');
    localStorage.removeItem('strava_athlete_data');
    localStorage.removeItem('strava_training_zones');
    window.location.reload();
}

async function getTokensFromCode(code) {
    try {
        const response = await fetch('/api/strava-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Authentication failed');

        localStorage.setItem('strava_tokens', JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at
        }));

        window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
        handleError('Authentication failed', error);
        throw error;
    }
}

export async function handleAuth(onAuthenticated) {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        showLoading('Authenticating...');
        await getTokensFromCode(code);
    }

    const tokenDataRaw = localStorage.getItem('strava_tokens');
    if (tokenDataRaw) {
        const tokenData = JSON.parse(tokenDataRaw);
        const now = Math.floor(Date.now() / 1000);

        if (tokenData.access_token && tokenData.expires_at > now) {
            await onAuthenticated(tokenData);
            return;
        } else {
            localStorage.removeItem('strava_tokens');
            localStorage.removeItem('strava_athlete_data');
            localStorage.removeItem('strava_training_zones');
        }
    }

    hideLoading(); 
}
