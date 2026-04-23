# Strava Dashboard

Web app to analyze your Strava activities with a focus on training, performance, and consistency. The app connects to Strava via OAuth, downloads activities, computes derived metrics (for example TSS, CTL, ATL, TSB), and displays interactive panels by sport and goal.

Demo: <https://stravastats.vercel.app/>

## What the app does

- Connects to your Strava account (OAuth 2.0).
- Downloads paginated activities and applies local cache for better performance.
- Computes global and sport-specific statistics.
- Generates visualizations (bar, line, scatter, histograms, heatmaps, route map).
- Includes gear analysis (shoes/bikes), annual calendar, annual report, and AI assistant.

## Available tabs and what they show

- Dashboard: load, consistency, goals, global summary.
- Run: running analysis with date and gear filters.
- Bike: cycling analysis with bike-type segmentation.
- Swim: swim analysis (pool and open water).
- Athlete: profile, records, zones, and time patterns.
- Predictor: PBs and distance predictions.
- Gear: equipment health and usage.
- Activities: universal table with advanced filters.
- Calendar: annual heatmap, streaks, and period summary.
- Weather: weather context and relationship with performance.
- Map: global heatmap and route rendering.
- Report: annual/wrapped summary and year-over-year comparisons.
- AI Coach: chat with context from your data.

Detailed documentation of stats, charts, filters, and views for each tab is in PWA_GUIA.md.

## Architecture

- Frontend: HTML + modular JavaScript.
- Backend API: Vercel Functions in api/.
- Visualization: Chart.js, Cal-Heatmap, Leaflet, Leaflet.heat.
- Local persistence: localStorage for tokens, filters, cache, and preferences.

Main structure:

- index.html: main layout and tab containers.
- js/app/main.js: bootstrap, global state, tab routing.
- js/tabs/: rendering logic for each tab.
- js/services/api.js: API calls and cache.
- js/shared/: utilities and preprocessing.
- api/: serverless Strava endpoints.

## Authentication and data flow

1. Login from frontend using Strava OAuth.
2. Strava returns a code to the redirect URI.
3. Frontend sends code to /api/strava-auth.
4. Backend exchanges code for access_token and refresh_token.
5. Tokens are stored in localStorage.
6. The app consumes /api/strava-activities and auxiliary endpoints.
7. Activities are preprocessed and tabs are rendered.

## API endpoints (project-internal)

- POST /api/strava-auth: OAuth exchange.
- GET /api/strava-activities: paginated activities.
- GET /api/strava-athlete: athlete profile.
- GET /api/strava-zones: training zones.
- GET /api/strava-gear?id=<gearId>: gear detail.
- GET /api/strava-streams?id=<activityId>&type=<streamType>: activity streams.

## Configuration

### Requirements

- Node.js 18+
- Strava account and registered app in Strava Developers

### Environment variables (backend)

Define these variables in your environment (for example in Vercel):

- STRAVA_CLIENT_ID
- STRAVA_CLIENT_SECRET

Optionally, you can keep client ID in the frontend if the current flow requires it, but the recommendation is to centralize sensitive configuration in the backend.

## Local development

1. Install dependencies:

```bash
npm install
```

1. Run locally:

```bash
npm run dev
```

1. Open the local URL and connect with Strava.

## Local persistence (localStorage)

Relevant keys:

- strava_tokens
- strava_athlete_data
- strava_training_zones
- strava_gears
- strava_activities
- dashboard_filters
- dashboard_settings
- dashboard_acute_load_mode
- ai_chat_history
- gemini_api_key

## Export and utilities

- CSV export from header.
- PDF print using browser print dialog.
- Unit settings (metric/imperial), age, and max HR.

## PWA

The project includes manifest.json and a service worker (sw.js) for installability and partial offline use of static assets.

## Notes

- Strava data and maps require internet connection.
- The AI Coach tab uses the user's own Gemini API key.
- This app is intended for personal training analysis, not medical diagnosis.
