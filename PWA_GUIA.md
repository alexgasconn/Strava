# Complete guide to tabs, stats, charts, filters, and views

This document describes, tab by tab, everything currently shown by the application: filters, statistics, visualizations, and user actions.

## 0) Shared app foundation

### Authentication

- Login with Strava OAuth 2.0.
- Access token and refresh token stored in localStorage.
- Automatic token refresh in backend.

### Data sources

- Activities: paginated list from Strava.
- Athlete profile.
- Training zones.
- Gear details.
- Activity streams for detailed views.

### Local cache

- Athlete, zones, gear: longer TTL (24h).
- Activities: shorter TTL (1h).

## 1) Dashboard

### Filters

- Quick time range (week, 7d, 30d, 3m, 6m, year, 365d).
- From/to date filter.
- Acute load band mode selector (conservative/aggressive).

### Stats and KPIs

- Total number of activities.
- Total distance.
- Total moving time.
- Longest activity.
- Sport mix.
- CTL (fitness), ATL (fatigue), TSB (freshness), injury risk, 7-day rolling load.
- Annual/monthly goal progress (distance, hours, or activity count).

### Charts and views

- Acute Load Chart (load lines and productive band).
- Consistency heatmap (calendar).
- Load time series (CTL/ATL/TSB/risk).
- Goal progress chart.

### Actions

- Apply filters.
- Change range presets.
- Change acute load mode.
- Edit goals.

## 2) Run

### Filters

- From/to date.
- Shoe filter (gear).
- Apply and reset filters.

### Stats and KPIs

- Total runs.
- Total distance.
- Total time.
- Total elevation.
- Average run distance.
- Average pace.
- Average and max HR.
- Min/max/average speed.

### Charts and views

- Activity-type bars (trail, long run, race, intensity).
- Monthly distance (with session frequency).
- Pace vs distance scatter.
- Distance histogram.
- Elevation histogram.
- Distance vs elevation scatter.
- Accumulated distance.
- Weekly rolling-mean trend.
- Consistency heatmap.
- Runs heatmap map.
- Top runs.
- Monthly shoe-usage Gantt.
- Sortable activities table.

### Actions

- Sort columns.
- Open activity detail.
- Apply/reset date and gear filters.

## 3) Bike

### Filters

- From/to date.
- Bike filter (gear).
- Apply and reset filters.

### Stats and KPIs

- Total rides.
- Total distance.
- Total time.
- Total elevation.
- Average distance.
- Average speed.
- Average cadence.
- Average power.
- Average HR.
- Summary by bike type: road, mtb, gravel, indoor, electric.

### Charts and views

- Bike-type pie chart.
- Distance histogram.
- Elevation histogram.
- Speed vs distance scatter.
- Distance vs elevation scatter.
- Elevation ratio chart.
- Power vs speed scatter.
- Accumulated distance.
- Weekly trend.
- Consistency heatmap.
- Top activities.
- Activities table.

### Actions

- Filter by date range and bike.
- Sort table.

## 4) Swim

### Filters

- From/to date.
- Apply and reset.

### Stats and KPIs

- Total swims.
- Total distance.
- Total time.
- Average session distance.
- Average pace (sec/100m).
- Average HR.
- Pool vs open-water comparison (count, distance, average time).
- Pool length estimation (when available).

### Charts and views

- Distance histogram.
- Pace histogram.
- Pace vs distance scatter (pool/open water).
- Swims table (date, name, distance, time, pace/100m, type, pool length).

### Actions

- Filter by date.

## 5) Athlete

### Filters

- Sport filter.
- Data type selector (time, count, distance).
- From/to date.

### Stats and KPIs

- Athlete profile (name, location, followers, friends).
- All-time totals (activities, distance, time, elevation).
- Records: longest run, fastest run, most elevation.
- Time preferences: favorite day and favorite hour.
- Average distance and average pace.
- Solo vs group workouts.
- Training zones (HR and power).

### Charts and views

- Start-time histogram.
- Duration histogram.
- Yearly comparison (bars).
- Weekly and monthly mix.
- Time matrices (hour x day, year x month, month x day, etc.).
- Interactive matrix.

### Actions

- Change sport/data type and time range.

## 6) Predictor

### Filters/inputs

- Base distance/result.
- Model-weight sliders.
- Conservative/moderate/aggressive profile selector.

### Stats and calculations

- Personal bests for standard distances.
- Historical top 3 by distance.
- Riegel model prediction.
- VDOT model prediction.
- Final weighted prediction.

### Charts and views

- PB table.
- Prediction table (time, pace, margin).

### Actions

- Adjust model weights and recalculate predictions.

## 7) Gear

### Filters

- Sort by last use, distance, health, or name.

### Stats and KPIs

- Total distance by gear.
- Number of uses.
- First and last use dates.
- Average distance per use.
- Average pace by gear.
- Health percentage (usage vs expected lifetime).

### Charts and views

- Gear list with metrics.
- Distance-by-gear chart.
- Monthly gear-usage Gantt.
- Gear detail view (model, brand, price, durability).

### Actions

- Open detail.
- Edit custom fields (price, expected durability).
- Delete custom configuration.

## 8) Activities

### Filters

- Sport (multi-select).
- Name text filter.
- Date range.
- Distance range.
- Duration range.
- HR range.
- TSS range.

### Stats and views

- Universal table with columns:
  - Date, hour, sport, name.
  - Distance, duration, pace/speed.
  - Average/max HR.
  - Elevation, cadence, power, TSS.

### Actions

- Sort by any column.
- Open activity detail from activity name.

## 9) Calendar

### Filters

- Year selector.

### Stats and KPIs

- Current and longest day streak.
- Current and longest week streak.
- Activities in period.
- Total distance.
- Total hours.
- Active days.
- Total TSS.

### Charts and views

- Annual calendar heatmap.
- Activities list grouped by date.

### Actions

- Navigate by year.
- Click a day to view details.

## 10) Weather

### Filters

- Histogram variable selector (temperature, rain, wind, humidity, clouds, pressure).

### Stats and KPIs

- Average temperature.
- Average wind.
- Average humidity.
- Total rain.
- Most common weather condition.
- Most common wind direction.
- Average pressure.
- Estimated environmental difficulty.

### Charts and views

- Monthly multi-variable overview.
- Weather conditions pie chart.
- Temperature vs pace scatter.
- Histogram of selected variable.
- Weather-per-activity table.

### Actions

- Change histogram variable.

## 11) Map

### Filters

- Sport.
- Visualization mode (heat or routes).
- Map tiles (OSM, Carto, etc.).
- From/to date.
- Heatmap intensity/radius/blur.
- Color-by-sport toggle.

### Stats and views

- Global map with two modes:
  - Density heatmap.
  - Route polylines.
- Popups with activity names.

### Actions

- Change map layers and visualization style.
- Tune heatmap parameters.

## 12) Report (Wrapped)

### Filters

- Year selector.

### Stats and KPIs

- Distance, time, elevation, activities, active days.
- Longest activity, average distance, most active month.
- Year-over-year changes (percent).
- Current and longest streaks.
- Sport highlights.

### Charts and views

- Monthly volume.
- Sport distribution pie chart.
- Year comparison.
- Top weeks.
- Monthly heatmap.

### Actions

- Change report year.
- Export/print summary.

## 13) AI Coach

### Inputs

- User-provided Gemini API key.
- Chat prompt.

### Context used by the assistant

- Global training summary.
- Sport breakdown.
- PBs.
- Gear summary.
- Recent activities.
- Recent monthly volume.

### Views

- Persistent chat history.
- User/assistant messages.

### Actions

- Send prompt.
- Clear history.

## Cross-app settings

Global settings panel with:

- Metric/imperial units.
- Age.
- Max HR.

These preferences affect unit conversion and HR-dependent calculations.

## Exports

- Global CSV export from header.
- PDF print through browser.

## Quick guide

If you want training control and consistency, use Dashboard and Calendar.
If you want deep sport-specific analysis, use Run/Bike/Swim.
If you want planning support, use Predictor and AI Coach.
If you want year-end retrospective, use Report.
