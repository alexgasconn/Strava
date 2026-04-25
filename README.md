# Strava Dashboard

Strava Dashboard is a privacy-oriented sports analytics web application for athletes who want more control, transparency, and technical depth than the default Strava experience provides. The application connects directly to a user's Strava account, retrieves activity history, enriches it with derived metrics, and renders a multi-tab analysis workspace for running, cycling, swimming, planning, weather, route mapping, gear lifecycle tracking, annual reporting, and browser-side AI-assisted coaching.

The project is designed for self-coached athletes, endurance amateurs, data-oriented hobbyists, and engineers interested in training analytics. It solves a common gap in consumer fitness products: raw workout history is easy to collect, but difficult to transform into an interpretable model of consistency, training load, performance trends, equipment wear, and sport-specific patterns. This application addresses that gap by combining Strava data retrieval, client-side preprocessing, derived feature engineering, interactive visualizations, and sport-specific heuristics in a single progressive web app.

The application is deployed as a static frontend plus Vercel serverless API layer. Authentication and token refresh are handled through serverless proxies, while the majority of transformation and visualization logic executes in the browser. No application database is used.

## Documentation Map

- [Technical guide](./TECHNICAL_GUIDE.md)
- [PWA guide](./PWA_GUIA.md)

## Project Overview

### What the application does

At a high level, the application:

- Authenticates a user with Strava using OAuth 2.0.
- Downloads complete activity history through paginated Strava API requests.
- Caches athlete, zone, gear, and activity data locally with different TTL policies.
- Computes global and sport-specific summaries such as distance, duration, elevation, pace, speed, cadence, HR-derived load, and trend metrics.
- Organizes the experience into specialized tabs for dashboarding, per-sport analysis, athlete profiling, predictions, gear lifecycle tracking, activity search, calendar consistency, weather correlation, geographic visualization, annual reporting, and AI-based question answering.
- Provides deeper activity-level analysis through dedicated detail pages that ingest Strava streams and run a point-level preprocessing and analysis pipeline.

### Intended users

This project is for:

- Runners who want better control over pace, consistency, PB tracking, and prediction models.
- Cyclists who want distance, elevation, power, cadence, bike-type segmentation, and route-level analysis.
- Swimmers who need pool versus open-water separation, pace-per-100m metrics, and pool-length estimation.
- Multi-sport athletes who want one consolidated training data surface.
- Engineers and analysts who prefer transparent, inspectable heuristics over opaque product metrics.

### Problem solved

Most training platforms expose activity history, but not a production-quality analytical workflow. Athletes often need to piece together spreadsheets, exported files, or third-party dashboards to answer routine questions such as:

- Is my training load trending productively or dangerously?
- What are my real patterns by weekday, hour, or season?
- Which shoes are near replacement?
- How does weather affect my running pace?
- What can my recent race history plausibly predict for the next distance?
- Where do my routes cluster geographically?
- What happened inside a given activity at the stream level?

Strava Dashboard answers those questions in a single system with explicit data flow and reproducible calculations.

## Data Sources

The application combines several classes of data:

- Strava athlete metadata via `/api/strava-athlete`
- Strava activity history via `/api/strava-activities`
- Strava activity detail metadata via `/api/strava-activity`
- Strava training zones via `/api/strava-zones`
- Strava gear metadata via `/api/strava-gear`
- Strava activity streams via `/api/strava-streams`
- Local browser persistence via `localStorage`
- Historical weather enrichment from Open-Meteo archive endpoints for geolocated runs
- Derived outputs exported as GPX, CSV, and JSON from the advanced activity analysis flow

### File and payload types involved

- JSON: all API payloads, cached objects, derived analysis artifacts
- GPX: reconstructed export of analyzed activities
- CSV: tabular export of processed track points
- Encoded polylines: route rendering for the Map tab and detail pages
- Browser storage keys: authentication tokens, filters, gear settings, athlete profile, zones, cached activities, and AI conversation state

## Key Features

### Dashboard

The Dashboard tab provides a training-load and consistency overview. It uses derived metrics such as TSS, ATL, CTL, TSB, rolling load, and goal progress to answer whether the user is building fitness, carrying fatigue, or drifting away from annual targets.

### Run

The Run tab focuses on running-only activity subsets and includes date and gear filters, summary cards, consistency heatmaps, distance and elevation distributions, pace scatter plots, rolling trends, top runs, and a sortable activity table.

### Bike

The Bike tab segments cycling activity by bike type and gear, then visualizes distance, elevation, speed, power, cadence, and accumulated volume. It is designed to distinguish road, MTB, gravel, indoor, and electric usage patterns.

### Swim

The Swim tab separates pool and open-water sessions, computes pace per 100 m, estimates pool length when possible, and exposes swim-specific summaries and distributions.

### Athlete

The Athlete tab acts as a profile and behavior lens. It combines athlete metadata, all-time totals, records, training zones, time-of-day patterns, weekday patterns, yearly comparisons, and dense matrix-style heatmaps.

### Predictor

The Predictor tab blends classical endurance formulas and personal-history heuristics to estimate future race performance. It combines Riegel scaling, VDOT logic, direct PB matching, and a personal curve model with adjustable user-controlled weights.

### Gear

The Gear tab tracks equipment usage, estimated health, average pace by gear, usage counts, last-use dates, and custom durability metadata stored locally.

### Activities

The Activities tab is the universal query layer over the raw activity catalog. It supports advanced filtering and sorting across sport, name, date, distance, duration, HR, and TSS dimensions.

### Calendar

The Calendar tab exposes year-level consistency and streak behavior using day and week streak calculations and an annual heatmap view.

### Weather

The Weather tab enriches runs with historical weather conditions and explores the relationship between temperature, wind, humidity, precipitation, and observed performance.

### Map

The Map tab visualizes activity geographies using decoded route polylines or density heatmaps, with filters for sport, date range, and display mode.

### Report

The Report tab provides a year-in-sport summary with year-over-year comparison, monthly volume, sport distribution, streak summaries, and top periods.

### AI Coach

The AI Coach tab is a browser-side assistant powered by a user-supplied Gemini API key. It constructs a context block from the loaded Strava history and lets the user ask natural-language questions about trends, performance, and planning.

### Activity-level advanced analysis

Separate activity pages expose stream-level analysis for individual workouts. These pages fetch per-activity metadata and streams, reconstruct a track, run preprocessing and sport-specific analysis engines, render charts, and support GPX/CSV/JSON export.

## Architecture And System Design

### High-level architecture

The application uses a hybrid architecture:

- Frontend: static HTML plus native ES modules served directly in the browser
- Backend: Vercel serverless functions that proxy Strava API requests and handle secure OAuth token exchange and refresh
- Storage: browser `localStorage` for cached resources and UI state
- Visualization: Chart.js, `chartjs-chart-matrix`, D3, Cal-Heatmap, Leaflet, and Leaflet.heat
- Deployment: Vercel rewrites route tab paths to the SPA entrypoint

The main architectural separation is between:

- Tab-level product analytics for the multi-tab dashboard experience
- Stream-level detailed analysis for individual activities

### Data flow

The primary dashboard flow is:

1. The user authenticates with Strava.
2. The frontend exchanges the authorization code through `/api/strava-auth`.
3. Tokens are stored in `localStorage` and encoded into an Authorization header for subsequent backend calls.
4. The frontend requests athlete metadata, training zones, complete paginated activity history, and gear metadata.
5. `preprocessActivities` enriches the activity collection with derived fields such as training stress and contextual metrics.
6. Tab renderers consume the processed activities and apply tab-specific filters and aggregations.
7. Charts, tables, heatmaps, and map layers are rendered lazily when tabs are first opened.

The activity-detail flow is more granular:

1. A selected activity ID is read from the detail-page URL.
2. The frontend requests activity metadata and the required Strava streams.
3. Stream data is converted into a structured track model.
4. The preprocessing pipeline removes anomalies and smooths noisy series.
5. Detection, segmentation, sport-specific analyzers, and advanced engines compute insights.
6. The UI renders charts, splits, climb summaries, HR analysis, and export actions.

### ETL pipeline

The project contains a clear ETL-style processing path.

#### Ingestion

Data ingestion occurs through the Vercel API layer. Activity history is fetched from Strava using page size 100 and repeated until an empty page is returned. Athlete profile, training zones, gear metadata, individual activity metadata, and activity streams are retrieved through dedicated endpoints.

#### Cleaning

The cleaning stage includes:

- JSON cache validation and TTL expiry checks
- Swim distance correction for a known athlete-specific historical pool misconfiguration
- GPS spike interpolation on point-level tracks
- Hampel-filter-based altitude anomaly replacement
- Speed spike reduction

#### Transformation

Transformations include:

- Pace, speed, cadence, elevation-ratio, and time-normalized metric derivation
- HR-zone-aware TSS estimation with fallbacks to simpler methods when data is incomplete
- Calendar and weekly bucketing for trend views
- Gear aggregation and name mapping
- Weather enrichment for geolocated runs
- Polyline decoding for geographic visualization

#### Feature extraction

Feature extraction includes:

- CTL, ATL, TSB, and injury-risk style heuristics
- Run and bike activity classifications
- Swim type identification and pool-length inference
- Terrain, climb, stop, and segment detection on detailed activities
- Fatigue, physiological, and aero-derived indicators on stream-based analysis
- Predictor-model features derived from PBs and race-distance matching

#### Visualization

The visualization stage renders transformed data into summary cards, tables, histograms, scatter plots, line charts, pie charts, matrix heatmaps, and map layers.

### State management

There is no framework-managed application store. State is handled through module-level variables in `js/app/main.js`, DOM-driven controls, and persisted browser state.

Key state classes include:

- Loaded activities
- Global date filters
- Per-tab gear filters
- Athlete tab sport and data-type selectors
- User settings such as unit system, age, and max HR
- Cached API payloads and timestamps
- AI chat history and Gemini API key

Tabs are lazily rendered and tracked through a `renderedTabs` set so initial load cost remains bounded.

### Filtering model

Filtering operates in three layers:

- Global tab-local date filters shared across several tabs
- Domain filters such as gear, sport, chart variable, or year selectors
- Table-level query filters such as name and numeric ranges

Most filters are applied in memory to the already-loaded activity array. This keeps the interface responsive once data is fetched, but it means the browser owns the analysis workload.

### Chart generation

Charts are generated on the client and depend on per-tab aggregation logic. The system primarily uses:

- Chart.js for line, bar, pie, scatter, and histogram-style views
- Chart.js matrix plugin for dense matrix heatmaps
- Cal-Heatmap for GitHub-style calendar consistency views
- Leaflet and Leaflet.heat for map rendering
- D3 as a supporting visualization dependency

### Authentication, token refresh, and API behavior

Authentication uses Strava OAuth 2.0. Tokens are stored locally and refreshed server-side when they are about to expire. Each API request sends a base64-encoded token payload in the Authorization header to the Vercel backend, where the token is decoded and validated.

Important operational details:

- Activity pagination fetches all pages until exhaustion.
- Athlete, zones, and gear are cached for 24 hours.
- Activities are cached for 1 hour.
- Updated tokens are returned by backend endpoints and written back to `localStorage`.
- The current implementation does not include a server-side database or queue.

### Routing and deployment design

The app is a path-routed SPA. Vercel rewrites route segments such as `/run`, `/dashboard`, `/bike`, `/weather`, and `/ai-coach` to `/index.html`, while static asset paths and `/api/*` remain directly addressable.

## Technical Stack

### Frontend

- HTML5
- CSS
- Vanilla JavaScript using native ES modules
- Chart.js
- `chartjs-chart-matrix`
- D3.js
- Cal-Heatmap
- Leaflet
- Leaflet.heat

### Backend

- Vercel serverless functions
- Node.js runtime
- `node-fetch`

### Analytics and runtime services

- Strava API v3
- Open-Meteo historical archive API
- Gemini Flash preview endpoint for AI Coach
- Vercel Speed Insights

### Deployment

- Vercel
- PWA manifest and service worker for installability and static-asset caching

## How To Run The Project

### Prerequisites

- Node.js 18+
- A Strava account
- A registered Strava developer application
- Vercel CLI for local serverless emulation

### Required environment variables

Configure these server-side variables for local development and deployment:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

The AI Coach feature does not require a server environment variable. The user supplies a Gemini API key inside the UI, and the key is stored only in the browser under `localStorage`.

### Installation

```bash
npm install
```

### Local development

The repository currently does not define local `npm` scripts in `package.json`. The correct local workflow is to run the application through Vercel's local serverless environment:

```bash
npx vercel dev
```

Then open the local URL provided by Vercel and authenticate with Strava.

### Recommended local setup sequence

1. Create or configure your Strava developer application with the correct redirect URL.
2. Set `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in your Vercel local environment.
3. Install dependencies with `npm install`.
4. Run `npx vercel dev`.
5. Open the app and connect with Strava.
6. If you want AI Coach, paste your Gemini API key into the AI tab after the app loads.

### Deployment notes

For production deployment on Vercel:

1. Import the repository into Vercel.
2. Configure the same Strava environment variables.
3. Ensure the Strava redirect URI matches the deployed domain.
4. Deploy and validate OAuth login, token refresh, and route rewrites.

## Data Engineering Details

### Cleaning and data quality handling

The project contains explicit data-quality logic rather than assuming raw API cleanliness.

- Missing fields are handled with fallbacks in most summary calculations.
- Cached JSON is guarded against parse errors.
- Altitude outliers are replaced using a Hampel-style filter.
- GPS spikes are interpolated based on neighboring points.
- Speed anomalies are smoothed to prevent visually unstable stream charts.
- Swim records without GPS are treated as indoor/pool candidates.
- Historical swim distance correction is applied for a known athlete-specific case.

### Outliers, noise, and smoothing

The detailed analysis pipeline performs several denoising steps:

- GPS jitter mitigation through spike interpolation
- Altitude smoothing through moving windows after anomaly correction
- Grade smoothing
- Speed smoothing only on moving segments
- Derived-metric recomputation after cleaning

These steps improve downstream climb detection, fatigue heuristics, and chart readability.

### Aggregations and rolling windows

Across the app, the codebase uses:

- Daily bucketing for calendars and TSS distributions
- ISO-style weekly aggregation for trend charts and streak logic
- Monthly aggregation for seasonal and annual views
- Rolling means such as 5-week run and bike volume trends
- Exponential moving averages for ATL and CTL

### Domain-specific metrics

Notable domain metrics include:

- Pace in min/km for running
- Pace per 100 m for swimming
- Speed in km/h for cycling and general movement sports
- Elevation ratio in m/km
- TSS with power, HR-zone, HR-ratio, suffer-score, and time-only fallback modes
- VO2max estimate for qualifying runs
- CTL, ATL, TSB, and injury-risk proxies
- HR zone time distribution
- Pool-length estimation for swims
- VAM and climb segmentation for analyzed activities
- Fatigue onset and severity heuristics
- Environmental difficulty scoring for weather-enriched runs

## Machine Learning And Analytics

This application is analytics-heavy but intentionally lightweight on opaque machine learning. Most models are deterministic, interpretable, and built for personal training analytics rather than offline supervised training.

### Models and heuristics used

- Riegel prediction formula for endurance race-time scaling
- VDOT-style prediction logic for running performance transfer
- Personal curve fitting in the Predictor tab
- Heuristic run classification
- Heuristic bike classification
- HR-zone-based load estimation
- Fatigue onset heuristics on stream windows
- Environmental difficulty scoring

### Why these methods were chosen

These methods are appropriate for a browser-first product because they:

- Are explainable to end users
- Require no external model-serving layer
- Degrade gracefully when data is incomplete
- Fit the personal analytics use case better than heavyweight generalized models

### Evaluation and interpretation

The codebase does not expose a formal offline evaluation suite for prediction accuracy or classifier benchmarking. Instead, it favors transparent formulas whose failure modes are understandable. In practical terms, the quality of outputs depends on:

- Coverage of heart rate, cadence, and power streams
- Correctness of Strava metadata
- Availability of race-like efforts in personal history
- GPS quality and route geometry

## Visualizations

The project uses a broad visualization set, each chosen for a specific analytical role.

- Summary cards communicate scalar KPIs quickly.
- Line charts show progression and rolling behavior over time.
- Scatter plots reveal pace-distance, power-speed, and temperature-performance relationships.
- Histograms show distributions and variability.
- Pie charts expose composition, such as bike-type or sport-share splits.
- Calendar heatmaps communicate consistency and streak behavior.
- Matrix heatmaps reveal temporal patterns across combinations like hour by weekday or year by month.
- Leaflet route maps and density heatmaps provide geographic context.

Interactivity includes:

- Tab-level lazy rendering
- Sortable tables
- Gear, date, year, sport, and variable selectors
- Route mode versus heatmap mode on maps
- Sliders and scenario selectors in the Predictor tab
- AI-chat prompt entry and persisted conversation history

## Performance Considerations

- All dashboard analytics execute in the browser after data fetch.
- Detailed activity analysis also runs on the main thread, so large activities may temporarily block the UI.
- Activity history pagination can trigger many Strava calls for long-tenure athletes.
- Weather enrichment increases network cost for runs with GPS coordinates.
- `localStorage` is simple and privacy-friendly, but not ideal for large structured datasets.
- Lazy tab rendering reduces first-paint cost by deferring chart generation.

## Limitations

- No database means no long-term server-side persistence, offline sync, or multi-device shared state.
- Strava rate limits remain a practical constraint for large activity histories and repeated refreshes.
- Some analytics depend on HR, cadence, power, or GPS streams that may be absent.
- Swim distance correction includes a hardcoded athlete-specific rule and is not generalized.
- Detailed analysis is richer than the tab-level summaries, which means some metrics exist only on activity pages.
- The project currently relies on local browser storage for tokens and preferences.

## Known Issues And Caveats

- The local development workflow depends on Vercel CLI because `package.json` currently has no scripts.
- The predictor and classification layers are heuristic and should be treated as decision support, not ground truth.
- Weather enrichment is approximate and based on hourly historical data, not exact on-route microclimate.
- GPX export is reconstructed from processed streams rather than original device files.

## Future Improvements

- Introduce Web Workers for heavy stream analysis.
- Add IndexedDB for larger local caches and better offline behavior.
- Generalize athlete-specific correction logic into configurable user settings.
- Add formal test coverage for predictor outputs and classification heuristics.
- Expand sport-specific models for trail running, open-water swimming, and structured cycling sessions.
- Introduce server-side aggregation or snapshot caching to reduce repeated Strava fetch pressure.

## Repository Structure

```text
api/                 Vercel serverless functions and shared auth helpers
activities/          Static activity resources by sport
html/                Dedicated detail pages
js/app/              App bootstrap, auth, UI orchestration
js/analysis/         Detailed activity analysis pipeline and exporters
js/models/           Analysis domain models
js/pages/            Activity, bike, run, swim, and gear page controllers
js/services/         API clients and browser cache layer
js/shared/           Shared preprocessing and utility helpers
js/tabs/             Main dashboard tab renderers
styles/              Global styling
index.html           SPA entrypoint
sw.js                Service worker
manifest.json        PWA manifest
vercel.json          Route rewrite configuration
```

## Additional Reading

The full engineering-oriented breakdown of tabs, ETL stages, visualizations, analytics logic, and implementation caveats is documented in [TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md).
