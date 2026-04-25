# Strava Dashboard Technical Guide

## Purpose

This document describes the current implementation of Strava Dashboard as an engineering system. It covers the product surface, architecture, ETL flow, feature engineering, visualization design, caching, authentication, detailed tab behavior, and the advanced activity-analysis pipeline.

It is intended for maintainers, collaborators, reviewers, and technically oriented users who need to understand how the application works beyond the top-level README.

## 1. System Overview

Strava Dashboard is a browser-first analytical application built around Strava activity data. It combines a static frontend, a small Vercel-based backend proxy layer, and a significant amount of client-side analytics code.

The system has two major operating modes:

1. A multi-tab dashboard experience driven by preprocessed activity summaries.
2. A deep per-activity analysis experience driven by Strava streams and point-level analysis.

The product design philosophy is explicit in the implementation:

- keep most user data in the browser
- avoid an application database
- use serverless endpoints only where secrets or token refresh are required
- favor explainable heuristics and transparent formulas over opaque models

## 2. Current Product Surface

### Main tab routes

The SPA exposes the following route-to-tab mapping through the History API and Vercel rewrites:

- `/` and `/run`: Run analysis
- `/dashboard`: Dashboard
- `/bike`: Bike
- `/swim`: Swim
- `/athlete`: Athlete
- `/planner`: Predictor
- `/gear`: Gear
- `/activities`: Activities
- `/calendar`: Calendar
- `/weather`: Weather
- `/map`: Map
- `/wrapped`: Report
- `/ai-coach`: AI Coach

### Dedicated pages

The repository also includes page-level controllers and HTML shells for dedicated detail views:

- `html/activity-router.html`
- `html/activity.html`
- `html/run.html`
- `html/bike.html`
- `html/swim.html`
- `html/gear.html`
- `html/wrapped.html`

These pages support richer, activity-specific or gear-specific exploration outside the main tab shell.

## 3. Architecture And Module Boundaries

### Frontend architecture

The frontend is implemented as native browser ES modules without a bundler. The architecture is intentionally layered:

- `js/app/*`: app bootstrap, authentication, navigation, shared UI orchestration
- `js/services/*`: API clients, browser cache helpers, server interactions
- `js/shared/*`: utilities and shared preprocessing used across product surfaces
- `js/tabs/*`: tab-level renderers for the main SPA
- `js/pages/*`: controllers for dedicated detail pages
- `js/analysis/*`: stream-level advanced analysis pipeline, models, analyzers, detectors, and exporters
- `js/models/*`: typed domain-style objects such as tracks, segments, and climbs

### Backend architecture

The backend is intentionally thin. It exists mainly to:

- exchange authorization codes for Strava OAuth tokens
- refresh access tokens when they are close to expiry
- proxy Strava endpoints so secrets remain server-side

Key API modules:

- `api/strava-auth.js`
- `api/strava-activities.js`
- `api/strava-activity.js`
- `api/strava-athlete.js`
- `api/strava-gear.js`
- `api/strava-streams.js`
- `api/strava-zones.js`
- `api/_shared.js`

### Routing model

The SPA is path-based rather than hash-based. `vercel.json` rewrites known tab routes to `index.html`, while API and static assets remain distinct. This yields clean URLs such as `/run` and `/weather` without introducing a full frontend router framework.

## 4. Authentication, Session Handling, And Security Model

### OAuth flow

Authentication uses Strava OAuth 2.0:

1. The frontend triggers a redirect to Strava's authorization endpoint.
2. Strava returns an authorization code to the configured redirect URI.
3. The frontend posts the code to `/api/strava-auth`.
4. The backend exchanges the code for an access token, refresh token, and expiration timestamp.
5. The frontend stores those tokens in `localStorage`.

### Token transport and refresh

Subsequent API requests send a base64-encoded serialized token payload through the Authorization header. The serverless layer decodes it, checks expiry, and refreshes the access token when needed. If refresh occurs, updated tokens are returned in the response payload and written back to `localStorage`.

### Security posture

The application makes a privacy-forward tradeoff:

- no database is used
- tokens are not persisted server-side
- most analytics run locally

This keeps architecture simple and user data localized, but it also means the browser is the effective session store.

## 5. Caching And Local Persistence

### Local cache durations

The client-side cache stores payloads with timestamps and applies differentiated TTLs:

- athlete profile: 24 hours
- training zones: 24 hours
- gear: 24 hours
- activities: 1 hour

### Cached data keys

Notable persisted keys include:

- `strava_tokens`
- `strava_athlete_data`
- `strava_training_zones`
- `strava_gears`
- `strava_activities`
- `dashboard_filters`
- `dashboard_settings`
- `dashboard_acute_load_mode`
- `ai_chat_history`
- `gemini_api_key`
- gear-specific custom configuration records

### Why this matters operationally

The cache strategy reduces repeated API calls while still favoring reasonably fresh activity data. It is a pragmatic middle ground between stateless behavior and persistent server-side storage.

## 6. ETL Pipeline

The codebase implements a practical ETL pipeline, even though it is not packaged as a traditional data platform.

### 6.1 Ingestion

The ingestion stage pulls:

- paginated Strava activity history
- athlete metadata
- training zones
- gear metadata
- detailed activity streams
- historical weather records for eligible runs

`api/strava-activities.js` requests athlete activities with `per_page=100` and continues fetching until a page returns no rows. This guarantees complete history retrieval, which is a good analytical default but can stress rate limits for athletes with long histories.

### 6.2 Cleaning

For activity collections, the preprocessing layer performs broad cleanup and enrichment tasks such as:

- cache validation and parse-guarding
- targeted swim distance corrections for a known historical issue
- null-safe defaults in metrics
- local bucketing without UTC date drift for many views

For stream-level activity analysis, the cleaning pipeline performs more sophisticated operations:

- GPS spike detection and interpolation
- altitude outlier replacement with a Hampel-style filter
- speed spike cleanup
- smoothing of altitude, speed, and grade series

### 6.3 Transformation

Transformations generate normalized analytical fields such as:

- pace and speed representations by sport
- TSS and related load metadata
- weekly and monthly aggregates
- route point arrays decoded from polylines
- activity-type and bike-type classification labels
- pool/open-water labels and pool-length estimates

### 6.4 Feature extraction

Feature extraction generates the signals used by charts and advanced analytics:

- CTL, ATL, TSB, rolling load, and injury-risk proxy values
- environmental difficulty scores
- distance, elevation, pace, power, HR, and cadence summaries
- time-in-zone distributions
- climb, stop, and segment objects
- fatigue onset and severity markers
- VAM, GAP, and terrain-derived summaries

### 6.5 Visualization-ready outputs

The final ETL outputs are view-specific aggregated tables and point sets used for:

- summary cards
- line charts
- scatter plots
- pie charts
- histograms
- calendar heatmaps
- matrix heatmaps
- geographic layers
- sortable tables

## 7. Data Engineering Details

### Missing values and fallback logic

The code is defensive in several places:

- HR-dependent metrics fall back to simpler estimates if HR is missing.
- TSS computation can use power, HR zones, HR ratio, suffer score, or time-only approximations.
- Swim type inference falls back on `trainer` and GPS availability.
- Route and stream analyses degrade if optional series such as cadence or watts are absent.

### Outlier and noise handling

The detailed analysis pipeline is where most signal hygiene is enforced:

- GPS points with unrealistic distance jumps are interpolated.
- Altitude anomalies are replaced with robust local medians.
- Speed outliers are dampened using median-based local windows.
- Derived metrics are recomputed after denoising to keep downstream outputs internally consistent.

### Aggregation strategies

The dashboard relies heavily on grouping and windowing:

- day-level grouping for heatmaps and streaks
- ISO-style week grouping for weekly trends and top-week logic
- month-level grouping for annual and seasonal summaries
- rolling mean windows for training trends
- EMAs for ATL and CTL

### Smoothing and normalization

At the activity-detail layer, the code supports smoothing controls that change how stream charts are rendered. This is useful because stream-level HR, cadence, altitude, and power curves can otherwise be too noisy to interpret.

Normalization strategies include:

- unit conversions by sport and chart context
- distance normalization for pace-per-100m and elevation-per-km
- interpolation within HR zones for a refined zone-weighted intensity factor

## 8. Analytics, Models, And Heuristics

### 8.1 Training load and performance management

The dashboard computes a familiar endurance-training trio:

- ATL: short-term fatigue proxy using a 7-day exponential moving average
- CTL: long-term fitness proxy using a 42-day exponential moving average
- TSB: freshness/form proxy computed from CTL minus ATL

An additional injury-risk heuristic is inferred from negative TSB and acute load spikes.

### 8.2 TSS computation

The code computes a TSS-like value with a hierarchy of methods:

1. power-based when average watts and FTP exist
2. HR-zone-weighted when training zones and average HR exist
3. HR-ratio-squared against max HR when zones are unavailable
4. suffer-score-based approximation
5. time-only fallback

Sport-specific multipliers are applied so load estimates vary across running, cycling, swimming, hiking, HIIT, and other activity types.

### 8.3 Predictor models

The Predictor tab combines multiple interpretable models:

- Riegel scaling: $T_2 = T_1 \times (D_2 / D_1)^{1.06}$
- VDOT-inspired performance transfer
- direct PB matching at nearby race distances
- personal curve fitting based on the user's historical performances

Users can control the weight of each model and select optimistic, realistic, or conservative scenarios. This is a strong product choice because it turns the prediction experience into a transparent decision-support tool rather than an opaque model verdict.

### 8.4 Classification heuristics

Run classification uses weighted heuristics over inputs such as pace, elevation, HR behavior, and pace variability to infer categories like recovery, long run, tempo, speed work, race, and trail/hills.

Bike classification uses sport type, elevation-per-kilometer, average speed, speed variability, and moving ratio to distinguish road from MTB-style rides. The tab-level bike summary further labels rides as road, MTB, gravel, indoor, or electric through sport-type and metadata logic.

### 8.5 Swim analytics

Swim analysis includes:

- pace per 100 m
- indoor/pool versus open-water separation
- pool-length inference among typical metric and yard standards
- moving-time to elapsed-time comparison

### 8.6 Activity-detail engines

The advanced activity pipeline includes several higher-resolution engines:

- climb detection
- stop detection
- distance, time, and terrain segmentation
- sport-specific analyzers for running, trail running, cycling, gravel/MTB, and hiking
- fatigue engine
- aero engine
- physiology engine
- automatic insight generation

### 8.7 Evaluation posture

The repository does not currently expose a formal offline evaluation or benchmarking suite. The models are chosen for interpretability and practical usefulness rather than ML-paper-style measurement. This is appropriate for a personal analytics product, but it should be documented clearly when making performance claims.

## 9. Visualization System

### Libraries used

- Chart.js for general charting
- `chartjs-chart-matrix` for matrix heatmaps
- D3 for supporting visualization workflows
- Cal-Heatmap for daily consistency grids
- Leaflet for route maps
- Leaflet.heat for density heatmaps

### Visualization design principles in the current implementation

- summary first, detail second
- sport-aware metric representation
- time aggregation for trend readability
- dense time-pattern views for temporal behavior analysis
- geographic context only where route data is available

### Interactivity model

Interactivity is implemented through DOM controls rather than a framework state container. Typical interactions include:

- filter application and reset buttons
- dynamic year-button generation
- chart variable selectors
- sort toggles on tables
- predictor weight sliders
- map mode switching
- AI chat suggestions and conversation history persistence

## 10. Detailed Feature Breakdown By Tab

### Dashboard

What the user sees:

- time-range presets
- custom date range
- acute-load mode selector
- KPI summary cards
- training-load charts
- goal-progress views

What data is used:

- full activity collection after preprocessing
- derived `tss`, `ctl`, `atl`, `tsb`, and injury-risk-style signals

What runs behind the scenes:

- activity filtering by date window
- daily TSS aggregation
- EMA-based load computation
- goal-progress accumulation

What insight the user gets:

- recent workload trajectory
- fatigue-versus-fitness balance
- consistency over the selected period
- whether goal volume is on track

Interactive elements:

- quick time presets
- custom from/to controls
- acute-load band mode
- goal editing flow

### Run

What the user sees:

- summary cards
- consistency heatmap
- activity-type chart
- monthly distance chart
- pace-versus-distance scatter
- distance and elevation histograms
- accumulated distance chart
- rolling weekly trend
- top runs area
- activity table

What data is used:

- activities matching running-related types
- filtered by date and selected gear

What runs behind the scenes:

- pace formatting in min/km
- weekday and monthly bucketing
- weekly distance aggregation and rolling mean
- gear subset filtering
- run-type classification heuristics

What insight the user gets:

- consistency patterns
- distribution of session lengths and climbing load
- pace behavior across distances
- gear-specific usage context

Interactive elements:

- date range
- year shortcuts
- gear selector
- sortable tables and drilldown links

### Bike

What the user sees:

- bike summary cards
- bike-type summary
- consistency heatmap
- bike-type distribution chart
- histograms for distance and elevation
- speed, power, and elevation scatter charts
- cumulative distance and rolling trend charts
- top rides and activities table

What data is used:

- ride-like activity types, including virtual and off-road variants
- optional gear filter

What runs behind the scenes:

- bike-type labeling
- speed conversion to km/h
- elevation-per-km normalization
- power-versus-speed pairing

What insight the user gets:

- how different bike categories contribute to volume
- whether climbing-heavy rides differ materially from speed-focused rides
- route and power distribution characteristics

Interactive elements:

- date range
- year buttons
- bike selector
- sortable tables

### Swim

What the user sees:

- swim summary cards
- consistency heatmap
- pool-versus-open-water summary
- histograms and scatter charts
- swim activity table

What data is used:

- swim activity types
- location availability, trainer flag, and distance/time values

What runs behind the scenes:

- pace-per-100m derivation
- pool/open-water inference
- candidate pool-length evaluation against common metric and yard pools

What insight the user gets:

- whether swim volume is mostly pool or open water
- the likely pool configuration behind indoor sessions
- pace distribution and session-length habits

Interactive elements:

- date range
- year buttons
- sortable tables

### Athlete

What the user sees:

- athlete profile card
- training zones display
- all-time totals
- records
- duration and start-time histograms
- yearly comparison
- weekly and monthly mix views
- multiple matrix heatmaps
- interactive matrix controls

What data is used:

- athlete profile payload
- training zones payload
- all activities with sport and date filters

What runs behind the scenes:

- aggregation by different temporal axes
- sport filter application
- data-type switching among time, count, and distance
- favorite day and favorite hour inference

What insight the user gets:

- macro profile of training behavior
- seasonal and circadian preferences
- long-term changes in training structure

Interactive elements:

- sport selector
- data-type selector
- date range
- matrix axis selectors

### Predictor

What the user sees:

- PB table
- top historical efforts per standard race distance
- model weight sliders
- scenario selector
- prediction table
- prediction evolution chart

What data is used:

- running history, especially race-like and near-standard distances

What runs behind the scenes:

- direct PB matching
- Riegel scaling
- VDOT-style transfer
- personal curve fitting
- weighted blending of models

What insight the user gets:

- plausible target times for standard distances
- how sensitive the prediction is to model assumptions
- whether current history is coherent across distances

Interactive elements:

- per-model weights
- optimistic/realistic/conservative mode
- chart distance selector

### Gear

What the user sees:

- gear list with usage metrics
- distance-by-gear view
- usage timeline/Gantt-style display
- custom durability and price editing
- health indicators

What data is used:

- Strava gear metadata
- gear-linked activities
- locally persisted custom gear properties

What runs behind the scenes:

- distance aggregation per gear
- last-use detection
- average pace calculation for run gear
- health percentage based on expected lifetime

What insight the user gets:

- which shoes or bikes are heavily used
- which items are nearing replacement thresholds
- how gear usage maps across time

Interactive elements:

- sort selector
- edit/delete custom metadata actions
- gear detail links

### Activities

What the user sees:

- advanced filter panel
- full sortable activity table

What data is used:

- the complete preprocessed activity list

What runs behind the scenes:

- conjunctive filter logic across sport, name, date, distance, duration, HR, and TSS
- sport-aware display formatting for pace versus speed

What insight the user gets:

- precise searchable access to the raw training catalog
- quick identification of sessions meeting specific criteria

Interactive elements:

- multi-select sport filter
- text search
- date range
- numeric ranges
- clickable column sorting

### Calendar

What the user sees:

- year selector
- annual heatmap
- streak summary
- activity groups by date

What data is used:

- all activities grouped by local calendar date

What runs behind the scenes:

- day-streak and week-streak calculations
- per-day grouping and intensity derivation

What insight the user gets:

- how consistent training is over the year
- where streaks start, break, and peak

Interactive elements:

- year selector
- date-group interaction

### Weather

What the user sees:

- weather summary cards
- weather-distribution and trend charts
- temperature-versus-pace scatter
- selectable weather histogram
- enriched run table

What data is used:

- runs with start coordinates and timestamps
- Open-Meteo hourly archive results

What runs behind the scenes:

- batched weather requests
- summary aggregation
- environmental difficulty scoring
- pace-weather pair building

What insight the user gets:

- how training conditions vary by month
- whether certain weather factors coincide with better or worse pace
- overall environmental stress across the run history

Interactive elements:

- histogram variable selector

### Map

What the user sees:

- Leaflet map
- sport selector
- date filters
- heatmap versus route mode
- tile selector
- heatmap tuning sliders
- color-by-sport toggle

What data is used:

- encoded route polylines from Strava activities

What runs behind the scenes:

- polyline decoding
- point-density layer generation
- route coloring by sport

What insight the user gets:

- geographic concentration of training
- route reuse and regional distribution

Interactive elements:

- map mode toggle
- sport filter
- date range
- tile changes
- heatmap parameter sliders

### Report

What the user sees:

- year selector
- annual summary cards
- sport highlights
- monthly volume chart
- sport distribution chart
- year-over-year comparisons
- top weeks summary
- heatmap-style monthly volume view

What data is used:

- activities grouped by year, month, week, and sport
- previous-year comparison baseline

What runs behind the scenes:

- year filtering
- YoY deltas
- top-week ranking
- sport-share aggregation

What insight the user gets:

- yearly training narrative
- strongest months and weeks
- how the current year compares to the previous one

Interactive elements:

- year selector
- print/export-oriented workflow

### AI Coach

What the user sees:

- API-key entry or confirmation banner
- chat transcript area
- starter suggestion prompts
- chat input and send control

What data is used:

- loaded activities summarized into a large context block
- optional gear summaries and recent activity highlights
- user-provided Gemini API key stored locally

What runs behind the scenes:

- context assembly over totals, sport breakdowns, PB-like stats, recent activities, and monthly volume
- browser-side call to the Gemini Flash preview endpoint
- local persistence of recent message history

What insight the user gets:

- natural-language interpretation of their own dataset
- conversational access to trends and planning guidance

Interactive elements:

- key management inside the browser
- suggestion buttons
- chat history clearing

## 11. Activity Detail And Advanced Analysis Pipeline

The activity-detail experience is materially more sophisticated than the tab-level summaries and deserves separate treatment.

### Data acquisition

For an individual activity, the controller requests:

- activity metadata from `/api/strava-activity`
- the stream set appropriate to the sport from `/api/strava-streams`

Required streams vary by sport, but the common base includes:

- time
- latlng
- distance
- altitude
- velocity_smooth
- grade_smooth
- moving

Additional streams such as heart rate, cadence, and watts are requested when appropriate.

### Track reconstruction

The advanced analyzer reconstructs structured tracks and points from stream payloads. This enables point-level analytics rather than simple activity-summary analytics.

### Preprocessing pipeline

The preprocessing pipeline applies multiple stages:

1. GPS spike removal
2. altitude anomaly correction
3. speed spike cleanup
4. altitude smoothing
5. grade smoothing
6. speed smoothing
7. terrain classification
8. derived-metric recomputation

This sequence reduces noise before segmentation and insight generation.

### Detection modules

The advanced analysis layer contains dedicated detection modules for:

- climbs
- stops

These detectors enable features such as climb summaries, stop timing, terrain-aware segmentation, and fatigue interpretation.

### Segmentation

The system segments activities by:

- distance
- time
- terrain

This creates the basis for split-level summaries and variability analysis.

### Advanced engines

The activity analyzer then runs higher-level engines for:

- fatigue
- aerodynamics and wind effects
- physiology and zone usage
- automatic textual insights

### Exports

The advanced activity flow supports export to:

- GPX
- CSV
- JSON

This is particularly useful because it turns the application into both an analytics viewer and a derived-data generator.

## 12. Visualizations In Detail

### Histograms

Used for distance, elevation, pace, duration, and weather variables. Histograms make it easy to see central tendency, spread, and skew in a way summary averages cannot.

### Scatter plots

Used where relationships matter more than totals, such as:

- pace vs distance
- distance vs elevation
- speed vs distance
- power vs speed
- temperature vs pace

These plots reveal tradeoffs, clusters, and outliers.

### Rolling trend charts

Used in run and bike views to smooth noisy week-to-week volume changes. Rolling means are more useful than raw weekly totals when the goal is to reason about trend direction.

### Calendar heatmaps

Used in sport tabs and the Calendar tab to surface consistency, streaks, and training density.

### Matrix heatmaps

Used heavily in the Athlete tab to show temporal density patterns across combinations such as weekday/hour or year/month. These views are particularly effective for detecting routine, seasonality, and behavior change.

### Map layers

The map system supports both route-line rendering and density heatmaps, which address two different questions:

- where did I go exactly?
- where do I most often train?

## 13. Stack And Runtime Environment

### Languages and libraries

- JavaScript
- HTML
- CSS
- Chart.js
- `chartjs-chart-matrix`
- D3.js
- Cal-Heatmap
- Leaflet
- Leaflet.heat
- `node-fetch`
- `@vercel/speed-insights`

### Hosting and operations

- frontend static hosting on Vercel
- serverless API execution on Vercel
- PWA manifest and service worker for installability and static-asset caching

## 14. Local Development And Operations

### Setup steps

1. Install dependencies with `npm install`.
2. Configure `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
3. Start the app with `npx vercel dev`.
4. Open the local URL and authenticate against your Strava app.

### Why Vercel CLI is required

The repository uses Vercel serverless functions directly and does not currently define local `npm` scripts. `vercel dev` is the correct local emulation layer for the API endpoints.

### Runtime assumptions

- the browser supports native ES modules
- the deployment environment supports Vercel serverless functions
- the Strava developer app is configured with matching redirect URIs

## 15. Performance Considerations

### Current strengths

- lazy tab rendering avoids generating all charts up front
- lightweight serverless backend keeps operational complexity low
- local caching reduces repeated requests for athlete, zones, and gear data

### Current bottlenecks

- all heavy analytics run on the main thread
- full activity-history fetches can be expensive
- weather enrichment adds many external requests for large running histories
- localStorage is not ideal for large-object persistence

### Recommended improvements

- move stream-level computation to Web Workers
- introduce IndexedDB for larger local caches
- precompute some reusable tab aggregates once per load
- consider optional server-side snapshots for power users with very large histories

## 16. Limitations And Known Issues

- no server-side persistence or user accounts beyond Strava OAuth
- dependence on Strava rate limits and upstream availability
- athlete-specific swim correction currently hardcoded for one known profile case
- weather data is archive-based and approximate
- predictor outputs are only as good as the user's historical race coverage
- GPX export is reconstructed, not original-device data
- browser storage is convenient but not enterprise-grade session infrastructure

## 17. Future Engineering Opportunities

- generalized configuration for athlete-specific corrections and sport preferences
- formal unit and integration tests around predictors and classification logic
- broader swim analytics, including structured interval handling
- richer cycling metrics such as FTP modeling or power-duration curves
- better offline support through richer service-worker strategies and IndexedDB
- explicit observability around Strava API rate consumption and request timing

## 18. Summary

Strava Dashboard is best understood as a client-heavy analytics application rather than a conventional CRUD web app. Its strongest qualities are transparency, breadth of sport coverage, and a clear separation between summary dashboards and high-resolution activity analysis. The system favors local computation, explicit heuristics, and practical visual analytics. That makes it well suited to technically minded athletes and maintainers, while also leaving clear paths for future scaling and refinement.
