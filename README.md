# Strava Running Analytics Dashboard

A web app built to answer the questions that Strava alone doesn’t solve: *Am I improving? How consistent is my training? What shape am I in? What races could I run?* This dashboard connects to your Strava account and transforms raw GPS activities into clear, interactive metrics.

**Demo:** [https://stravastats.vercel.app/](https://stravastats.vercel.app/)

---

## Overview

The app pulls your Strava running data and presents it through intuitive charts, tables, and analysis modules. You can filter by year or custom dates, explore long‑term patterns, inspect individual activities in depth, and access planning tools for your next races.

Everything is designed around practical running insights — not vanity metrics.

---

## Dashboard

### Period Filters

Choose a specific year or enter a custom date range. Training patterns vary through the season, so filtering helps you compare the right blocks: base phase, peak, taper, or recovery.

### KPI Tiles

For the selected period:

* **Activities**
* **Total Distance**
* **Moving Time**
* **Elevation Gain**

These tiles give a quick volume and consistency snapshot.

### Consistency Heatmap

A calendar-style heatmap (similar to GitHub contributions) showing daily running frequency and duration. It highlights streaks, gaps, slumps, and high‑density periods.

### Monthly Distance & Frequency

Two bars per month:

* Total running distance
* Number of runs

Great for spotting whether volume came from many short runs or a few long ones.

### Pace vs. Distance Scatter Plot

Each run becomes a point (distance vs. average pace). Outliers and breakthroughs stand out clearly, helping you track improving fitness or flag fatigue.

### Gear Usage

Mileage per shoe across months plus total accumulated distance. Useful for monitoring wear, experimenting with footwear, and tracking cost per kilometer.

### Training Load (CTL / ATL / TSB)

* **CTL:** long‑term fitness
* **ATL:** short‑term fatigue
* **TSB:** readiness

These metrics help you avoid overtraining and time your peak for a race.

### Run Start Heatmap

A geographical density map showing where your runs begin. Reveals favorite routes, travel miles, and training habits.

### Elevation Analysis

* **Elevation Histogram:** frequency of elevation profiles.
* **Distance vs. Elevation Scatter:** see whether your runs are flat, rolling, or hilly.

---

## Progress & Fitness

### Accumulated Distance

A running total of your yearly mileage. Steeper slope = higher consistency.

### Rolling Mean Distance

Average distance of your last 10 runs. Smooths random fluctuations to show long‑term trends in training volume.

### VO₂ Max Trend (Monthly)

Estimated aerobic capacity shown month‑by‑month. Highlights improvements, plateaus, or dips due to rest, illness, or tough blocks.

---

## Personal Bests

PBs for standard distances:

* Mile
* 5K
* 10K
* Half Marathon
* Marathon

Each entry shows pace, date, and a button to open the original run. A **Top 3** view adds context to see if a PB was a one‑off performance or part of a rising trend.

Empty entries help you spot distances you’ve never raced.

---

## Races

A compact table listing every race you’ve run:

* Date
* Name
* Distance
* Time
* Pace
* Details button

Useful for tracking long‑term race performance and trends across distances.

---

## Planner & Tools

### Race Time Predictor

Uses three models:

* Riegel formula
* A machine‑learning fit based on your history
* Your actual PBs as anchors

You can mix the models with sliders to produce conservative or aggressive predictions.

### VDOT Calculator

Based on Jack Daniels’ system. Enter a recent race result to get:

* VDOT score
* Easy, marathon, threshold, interval, and repetition paces

This helps you plan workouts that match your fitness.

---

## Deep-Dive Activity View

### Run Type Classification

An algorithm labels each run as:

* Recovery
* Long
* Tempo
* Intervals
* Hills
* Race

It uses pace variation, HR, elevation, and cadence — more reliable than manual Strava tags.

### Three-Column Summary

* **Left:** general details (route, weather, gear)
* **Center:** performance metrics (pace CV, HR CV, elevation, cost/km)
* **Right:** advanced metrics (normalized pace, efficiency, form index)

### Interactive Route Map

Zoomable map with terrain layers and elevation overlay.

### Splits

Bar charts of pace and heart rate per kilometer. Great for checking pacing strategy or fatigue.

### Stream Plots

Continuous charts of pace, HR, cadence, and altitude. Useful for spotting surges, form breakdown, and effort patterns.

### Best Efforts Within the Run

Your fastest 1K, 1 mile, 5K, 10K, HM, etc., detected inside the activity.

### Segment Analysis

List of all Strava segments from the route with ranks, PRs, and improvements.

### Laps Table

For each kilometer:

* Lap time
* Pace
* Elevation gain
* Avg HR

Helps identify fatigue points and pacing strategy.

---

## Try the App

Live demo: **[https://stravastats.vercel.app/](https://stravastats.vercel.app/)**

GitHub repo: **[https://github.com/alexgasconn/strava-stats](https://github.com/alexgasconn/strava-stats)**

The app is actively evolving. Feedback is welcome through the repo.
