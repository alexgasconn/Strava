// js/auth.js
import { showLoading, handleError } from './ui.js';
import { initializeApp } from './main.js';

const STRAVA_CLIENT_ID = '143540'; // Tu Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname;

export function redirectToStrava() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
}

export function logout() {
    localStorage.clear();
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
        // Limpia el código de la URL
        window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
        handleError('Authentication failed', error);
        throw error; // Propaga el error para detener la ejecución
    }
}

export async function handleAuth() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        showLoading('Authenticating...');
        await getTokensFromCode(code);
    }

    const tokenData = localStorage.getItem('strava_tokens');
    if (tokenData) {
        await initializeApp(tokenData);
    }
}