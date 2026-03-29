/**
 * BASE_ANALYZER.JS — Abstract base class for sport-specific analyzers
 */

import { AnalysisResult } from '../../models/analysis-result.js';

export class BaseAnalyzer {
    constructor(track, config = {}) {
        this.track = track;
        this.config = config;
        this.result = new AnalysisResult({
            activity_id: track.activity_id,
            sport_type: track.sport_type,
            timestamp_generated: new Date().toISOString()
        });
    }

    /**
     * Execute complete analysis (override in subclasses)
     */
    async analyze() {
        console.warn('BaseAnalyzer.analyze() should be overridden in subclass');
        return this.result;
    }

    /**
     * Calculate basic metrics common to all sports
     */
    _calculateBasicMetrics() {
        const stats = {
            distance: this.track.getTotalDistance(),
            elevation: this.track.getElevationStats(),
            speed: this.track.getSpeedStats(),
            heart_rate: this.track.getHeartRateStats(),
            power: this.track.getPowerStats()
        };

        this.result.distance_total = stats.distance.total_distance ?? stats.distance;
        this.result.distance_moving = stats.distance;
        this.result.time_total = this.track.elapsed_time / 1000;
        this.result.time_moving = this.track.moving_time / 1000;

        this.result.elevation_gain = stats.elevation.gain ?? this.track.total_elevation_gain;
        this.result.elevation_loss = stats.elevation.loss ?? 0;
        this.result.elevation_max = stats.elevation.max;
        this.result.elevation_min = stats.elevation.min;

        this.result.speed_avg = stats.speed.avg;
        this.result.speed_max = stats.speed.max;
        this.result.speed_min = stats.speed.min;

        this.result.hr_avg = stats.heart_rate.avg;
        this.result.hr_max = stats.heart_rate.max;
        this.result.hr_min = stats.heart_rate.min;

        this.result.power_avg = stats.power.avg;
        this.result.power_max = stats.power.max;

        return stats;
    }

    /**
     * Calculate HR zones
     */
    _calculateHRZones(maxHR = 195) {
        const zones = {
            Z1: 0, // 50-60% white
            Z2: 0, // 60-70% blue
            Z3: 0, // 70-80% green
            Z4: 0, // 80-90% yellow
            Z5: 0  // 90-100% red
        };

        let counts = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };
        let totalHR = 0;

        for (const point of this.track.points) {
            if (point.heart_rate && point.heart_rate > 0) {
                const pct = (point.heart_rate / maxHR) * 100;
                totalHR++;

                if (pct < 60) counts.Z1++;
                else if (pct < 70) counts.Z2++;
                else if (pct < 80) counts.Z3++;
                else if (pct < 90) counts.Z4++;
                else counts.Z5++;
            }
        }

        // Calculate percentages
        if (totalHR > 0) {
            zones.Z1 = Math.round((counts.Z1 / totalHR) * 100);
            zones.Z2 = Math.round((counts.Z2 / totalHR) * 100);
            zones.Z3 = Math.round((counts.Z3 / totalHR) * 100);
            zones.Z4 = Math.round((counts.Z4 / totalHR) * 100);
            zones.Z5 = Math.round((counts.Z5 / totalHR) * 100);
        }

        this.result.hr_zones = zones;
    }

    /**
     * Calculate power zones (if watts available)
     */
    _calculatePowerZones(ftp = 250) {
        const zones = {
            Z1: 0, // <55% white
            Z2: 0, // 55-75% blue
            Z3: 0, // 75-90% green
            Z4: 0, // 90-105% yellow
            Z5: 0, // 105-120% red
            Z6: 0  // >120% darkred
        };

        let counts = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0 };
        let totalPower = 0;

        for (const point of this.track.points) {
            if (point.power && point.power > 0) {
                const pct = (point.power / ftp) * 100;
                totalPower++;

                if (pct < 55) counts.Z1++;
                else if (pct < 75) counts.Z2++;
                else if (pct < 90) counts.Z3++;
                else if (pct < 105) counts.Z4++;
                else if (pct < 120) counts.Z5++;
                else counts.Z6++;
            }
        }

        // Calculate percentages
        if (totalPower > 0) {
            zones.Z1 = Math.round((counts.Z1 / totalPower) * 100);
            zones.Z2 = Math.round((counts.Z2 / totalPower) * 100);
            zones.Z3 = Math.round((counts.Z3 / totalPower) * 100);
            zones.Z4 = Math.round((counts.Z4 / totalPower) * 100);
            zones.Z5 = Math.round((counts.Z5 / totalPower) * 100);
            zones.Z6 = Math.round((counts.Z6 / totalPower) * 100);
        }

        this.result.power_zones = zones;
    }

    /**
     * Get fastest N-unit segment
     */
    _getFastestSegment(unit = 'km', units = 1) {
        const segments = [];
        const unitDistance = unit === 'km' ? units : units / 1000;

        for (let i = 0; i < this.track.getTotalDistance() - unitDistance; i += 0.1) {
            const points = this.track.getPointsByDistance(i, i + unitDistance);
            if (points.length === 0) continue;

            const distance = points[points.length - 1].distance_from_start - points[0].distance_from_start;
            const duration = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
            const avgSpeed = (distance / (duration / 3600));

            segments.push({
                start: i,
                distance,
                duration,
                avg_speed: avgSpeed
            });
        }

        if (segments.length === 0) return null;
        return segments.reduce((best, seg) => seg.avg_speed > best.avg_speed ? seg : best);
    }

    /**
     * Get slowest N-unit segment
     */
    _getSlowestSegment(unit = 'km', units = 1) {
        const segments = [];
        const unitDistance = unit === 'km' ? units : units / 1000;

        for (let i = 0; i < this.track.getTotalDistance() - unitDistance; i += 0.1) {
            const points = this.track.getPointsByDistance(i, i + unitDistance);
            if (points.length === 0) continue;

            const distance = points[points.length - 1].distance_from_start - points[0].distance_from_start;
            const duration = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
            const avgSpeed = (distance / (duration / 3600));

            if (avgSpeed > 0) {
                segments.push({
                    start: i,
                    distance,
                    duration,
                    avg_speed: avgSpeed
                });
            }
        }

        if (segments.length === 0) return null;
        return segments.reduce((best, seg) => seg.avg_speed < best.avg_speed ? seg : best);
    }
}
