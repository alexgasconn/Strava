/**
 * Demo Mode Controller
 * Handles loading and managing demo data in localStorage
 */

import { generateDemoData, generateDemoAthlete, generateDemoZones } from './generator.js';

export const DEMO_MODE_KEY = 'strava_demo_mode';
export const DEMO_TOKENS_KEY = 'strava_tokens_demo';

export function isDemoMode() {
    return localStorage.getItem(DEMO_MODE_KEY) === 'true';
}

export function setDemoMode(enabled) {
    if (enabled) {
        localStorage.setItem(DEMO_MODE_KEY, 'true');
    } else {
        localStorage.removeItem(DEMO_MODE_KEY);
    }
}

/**
 * Load demo data into localStorage (mimics Strava API responses)
 */
export function loadDemoData() {
    console.log('[Demo] Generating 250 activities...');

    // Generate all demo data
    const activities = generateDemoData();
    const athlete = generateDemoAthlete();
    const zones = generateDemoZones();

    // Store in localStorage (same structure as real API)
    localStorage.setItem('strava_demo_activities', JSON.stringify(activities));
    localStorage.setItem('strava_athlete_data', JSON.stringify(athlete));
    localStorage.setItem('strava_training_zones', JSON.stringify(zones));

    // Set timestamps to appear fresh
    const now = Date.now();
    localStorage.setItem('strava_athlete_data_timestamp', String(now));
    localStorage.setItem('strava_training_zones_timestamp', String(now));

    // Set demo token (fake but valid structure)
    const demoTokens = {
        access_token: 'demo_token_' + Math.random().toString(36),
        refresh_token: 'demo_refresh_' + Math.random().toString(36),
        expires_at: Math.floor(Date.now() / 1000) + 21600, // 6h from now
    };
    localStorage.setItem('strava_tokens', JSON.stringify(demoTokens));

    // Enable demo mode
    setDemoMode(true);

    console.log('[Demo] Data loaded! ', {
        activities: activities.length,
        athlete: athlete.firstname,
        zones: zones.heartrate?.length,
    });

    return { activities, athlete, zones };
}

/**
 * Clear demo data and exit demo mode
 */
export function clearDemoData() {
    localStorage.removeItem('strava_demo_mode');
    localStorage.removeItem('strava_demo_activities');
    localStorage.removeItem('strava_tokens');
    localStorage.removeItem('strava_athlete_data');
    localStorage.removeItem('strava_training_zones');
    localStorage.removeItem('strava_athlete_data_timestamp');
    localStorage.removeItem('strava_training_zones_timestamp');
    console.log('[Demo] Data cleared');
}

/**
 * Get activities from demo storage
 * (Used by api.js to return demo activities instead of calling real API)
 */
export function getDemoActivities() {
    const stored = localStorage.getItem('strava_demo_activities');
    if (!stored) {
        console.warn('[Demo] No activities found in storage');
        return [];
    }
    return JSON.parse(stored);
}

/**
 * Inject demo mode check into API calls
 * This is done in api.js by checking isDemoMode() before fetch
 */
export function setupDemoModeInterceptor() {
    // This is called from main.js after auth.js to setup demo mode if enabled
    if (isDemoMode()) {
        console.log('[Demo] Demo mode active, API calls will use demo data');
        return true;
    }
    return false;
}
