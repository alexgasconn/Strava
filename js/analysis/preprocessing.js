/**
 * PREPROCESSING.JS — Data cleaning, smoothing, and enrichment pipeline
 */

import { ActivityTrack } from '../models/activity-track.js';

export class PreprocessingPipeline {
    constructor(config = {}) {
        this.config = {
            gps_spike_threshold: config.gps_spike_threshold ?? 0.1, // km max delta
            altitude_hampel_window: config.altitude_hampel_window ?? 5,
            altitude_hampel_sigma: config.altitude_hampel_sigma ?? 2.5,
            speed_hampel_window: config.speed_hampel_window ?? 5,
            speed_hampel_sigma: config.speed_hampel_sigma ?? 2.5,
            grade_smooth_window: config.grade_smooth_window ?? 7,
            altitude_smooth_window: config.altitude_smooth_window ?? 5,
            speed_smooth_window: config.speed_smooth_window ?? 7,
            min_stop_duration: config.min_stop_duration ?? 5, // seconds
            stop_speed_threshold: config.stop_speed_threshold ?? 0.5 // km/h
        };
    }

    /**
     * Execute full preprocessing pipeline
     */
    process(track) {
        let result = track;
        console.log(`🧪 Preprocessing: Starting 5-stage pipeline on ${track.points.length} points...`);

        // 1. Clean GPS spikes
        console.log(`  1️⃣ Removing GPS spikes...`);
        result = this._removeGPSSpikes(result);

        // 2. Fix altitude anomalies
        console.log(`  2️⃣ Fixing altitude anomalies (Hampel filter)...`);
        result = this._fixAltitude(result);

        // 3. Remove speed spikes
        console.log(`  3️⃣ Removing speed spikes...`);
        result = this._removeSpeedSpikes(result);

        // 4. Smooth elevation data
        result = this._smoothAltitude(result);

        // 5. Smooth grade
        result = this._smoothGrade(result);

        // 6. Smooth speed
        console.log(`  4️⃣ Smoothing data (altitude, grade, speed)...`);
        result = this._smoothSpeed(result);

        // 7. Detect terrain types
        console.log(`  5️⃣ Classifying terrain (flat/climb/descent/technical)...`);
        result = this._detectTerrain(result);

        // 8. Recalculate derived metrics
        result = this._recalculateDerivedMetrics(result);

        console.log(`✅ Preprocessing complete: ${result.points.length} cleaned points`);
        return result;
    }

    /**
     * Remove GPS spikes (unrealistic distance jumps)
     */
    _removeGPSSpikes(track) {
        const points = [...track.points];
        const threshold = this.config.gps_spike_threshold;

        for (let i = 1; i < points.length; i++) {
            if (points[i].delta_distance > threshold) {
                // Likely a GPS spike - interpolate
                const prev = points[i - 1];
                const next = i < points.length - 1 ? points[i + 1] : null;

                if (next) {
                    // Average with neighbors
                    points[i].latitude = (prev.latitude + next.latitude) / 2;
                    points[i].longitude = (prev.longitude + next.longitude) / 2;
                    points[i].delta_distance = (prev.delta_distance + (next.delta_distance ?? 0)) / 2;
                } else {
                    // Extrapolate from neighbors
                    points[i].latitude = prev.latitude;
                    points[i].longitude = prev.longitude;
                    points[i].delta_distance = prev.delta_distance;
                }
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Fix altitude anomalies using Hampel filter
     */
    _fixAltitude(track) {
        const points = [...track.points];
        const window = this.config.altitude_hampel_window;
        const sigma = this.config.altitude_hampel_sigma;

        const elevations = points.map(p => p.elevation).filter(e => e !== null);
        if (elevations.length === 0) return track;

        for (let i = 0; i < points.length; i++) {
            if (points[i].elevation === null) continue;

            const start = Math.max(0, i - window);
            const end = Math.min(points.length, i + window + 1);
            const window_values = points
                .slice(start, end)
                .map(p => p.elevation)
                .filter(e => e !== null)
                .sort((a, b) => a - b);

            if (window_values.length < 3) continue;

            const median = window_values[Math.floor(window_values.length / 2)];
            const mad = window_values.map(v => Math.abs(v - median))
                .sort((a, b) => a - b)[Math.floor(window_values.length / 2)];

            const value = points[i].elevation;
            if (Math.abs(value - median) > sigma * mad && mad > 0) {
                // Anomaly detected - use median
                points[i].elevation = median;
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Remove speed spikes
     */
    _removeSpeedSpikes(track) {
        const points = [...track.points];
        const window = this.config.speed_hampel_window;
        const sigma = this.config.speed_hampel_sigma;

        for (let i = 0; i < points.length; i++) {
            const start = Math.max(0, i - window);
            const end = Math.min(points.length, i + window + 1);
            const speeds = points.slice(start, end).map(p => p.speed).sort((a, b) => a - b);

            if (speeds.length < 3) continue;

            const median = speeds[Math.floor(speeds.length / 2)];
            const mad = speeds.map(v => Math.abs(v - median))
                .sort((a, b) => a - b)[Math.floor(speeds.length / 2)];

            if (Math.abs(points[i].speed - median) > sigma * mad && mad > 0) {
                points[i].speed = median;
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Smooth altitude data
     */
    _smoothAltitude(track) {
        const points = [...track.points];
        const window = this.config.altitude_smooth_window;

        for (let i = 0; i < points.length; i++) {
            const start = Math.max(0, i - Math.floor(window / 2));
            const end = Math.min(points.length, i + Math.ceil(window / 2));
            const values = points.slice(start, end)
                .map(p => p.elevation)
                .filter(e => e !== null);

            if (values.length > 0) {
                points[i].elevation = values.reduce((a, b) => a + b) / values.length;
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Smooth grade data
     */
    _smoothGrade(track) {
        const points = [...track.points];
        const window = this.config.grade_smooth_window;

        for (let i = 0; i < points.length; i++) {
            const start = Math.max(0, i - Math.floor(window / 2));
            const end = Math.min(points.length, i + Math.ceil(window / 2));
            const values = points.slice(start, end).map(p => p.grade);

            if (values.length > 0) {
                points[i].grade = values.reduce((a, b) => a + b) / values.length;
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Smooth speed data
     */
    _smoothSpeed(track) {
        const points = [...track.points];
        const window = this.config.speed_smooth_window;

        for (let i = 0; i < points.length; i++) {
            if (!points[i].moving) continue;

            const start = Math.max(0, i - Math.floor(window / 2));
            const end = Math.min(points.length, i + Math.ceil(window / 2));
            const values = points.slice(start, end)
                .filter(p => p.moving)
                .map(p => p.speed)
                .filter(s => s > 0);

            if (values.length > 0) {
                points[i].speed = values.reduce((a, b) => a + b) / values.length;
                points[i].pace = points[i].calculatePace();
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Classify terrain type for each point
     */
    _detectTerrain(track) {
        const points = [...track.points];

        for (let i = 0; i < points.length; i++) {
            const grade = Math.abs(points[i].grade);

            if (grade > 8) {
                points[i].terrain_type = 'technical';
                points[i].in_climb = points[i].grade > 0;
                points[i].in_descent = points[i].grade < 0;
            } else if (grade > 5) {
                points[i].terrain_type = points[i].grade > 0 ? 'climb' : 'descent';
                points[i].in_climb = points[i].grade > 0;
                points[i].in_descent = points[i].grade < 0;
            } else if (grade > 2) {
                points[i].terrain_type = points[i].grade > 0 ? 'climb' : 'descent';
                points[i].in_climb = points[i].grade > 0;
                points[i].in_descent = points[i].grade < 0;
            } else {
                points[i].terrain_type = 'flat';
                points[i].in_climb = false;
                points[i].in_descent = false;
            }
        }

        return new ActivityTrack(track, points);
    }

    /**
     * Recalculate all derived metrics based on cleaned data
     */
    _recalculateDerivedMetrics(track) {
        const points = [...track.points];

        for (let i = 0; i < points.length; i++) {
            // Recalculate pace
            points[i].pace = points[i].calculatePace();

            // Recalculate vertical metrics
            if (i > 0) {
                const prevPoint = points[i - 1];
                const elevDiff = points[i].elevation - prevPoint.elevation;

                if (i === 1) {
                    points[i].vertical_gain = elevDiff > 0 ? elevDiff : 0;
                    points[i].vertical_loss = elevDiff < 0 ? Math.abs(elevDiff) : 0;
                } else {
                    points[i].vertical_gain = prevPoint.vertical_gain + (elevDiff > 0 ? elevDiff : 0);
                    points[i].vertical_loss = prevPoint.vertical_loss + (elevDiff < 0 ? Math.abs(elevDiff) : 0);
                }

                if (points[i].delta_time > 0) {
                    points[i].vertical_speed = elevDiff / points[i].delta_time;
                }
            }

            // Recalculate acceleration
            if (i > 0 && points[i].delta_time > 0) {
                points[i].acceleration = (points[i].speed - points[i - 1].speed) / points[i].delta_time;
            }
        }

        return new ActivityTrack(track, points);
    }
}
