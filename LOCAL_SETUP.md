# Local Setup

This project includes a local Node.js dev server so the browser app can call the Strava API routes in `api/`.

## Prerequisites

- Node.js 18+
- A Strava account
- A Strava Developer App

## Strava OAuth Setup

1. In the Strava developer dashboard, create or open your app.
2. Set the app's callback domain to `localhost` for local development.
3. Copy the app's client ID and client secret.
4. Copy the example environment file:

```bash
cp .env.example .env.local
```

5. Fill in `.env.local`:

```bash
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
```

Do not commit `.env.local`.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by the dev server, then click Connect with Strava.

If you switch to a different Strava app, clear the browser `localStorage` key named `strava_tokens` and sign in again.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `/api/strava-auth` returns 404 | Start the app with `npm run dev`; opening `index.html` directly will not run API functions. |
| Missing `STRAVA_CLIENT_ID` | Check that `.env.local` exists, contains `STRAVA_CLIENT_ID`, and restart `npm run dev`. |
| Strava auth failed | Confirm the frontend client ID and backend client secret belong to the same Strava app. |
| Token or cache issues | Clear `strava_tokens` from browser `localStorage`, then sign in again. |
| CDN charts do not load | Check network access to jsdelivr, unpkg, and d3 resources. |
