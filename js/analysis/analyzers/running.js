/**
 * RUNNING.JS — Road running analyzer
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class RunningAnalyzer extends BaseAnalyzer {
    async analyze() {
        // Calculate basic metrics
        this._calculateBasicMetrics();

        // Running-specific metrics
        this._calculatePaceMetrics();
        this._calculateCadenceMetrics();
        this._calculateRunningDynamics();
        this._calculateHRZones();

        // Detect running session type
        this._classifySession();

        return this.result;
    }

    /**
     * Calculate pace-specific metrics
     */
    _calculatePaceMetrics() {
        const paces = this.track.points
            .filter(p => p.pace && p.moving)
            .map(p => p.pace);

        if (paces.length === 0) return;

        // Calculate average pace
        const avgMinutes = paces.reduce((sum, p) => sum + (p.minutes + p.seconds / 60), 0) / paces.length;
        const avgMin = Math.floor(avgMinutes);
        const avgSec = Math.round((avgMinutes - avgMin) * 60);
        this.result.pace_avg = { minutes: avgMin, seconds: avgSec };

        // Find fastest and slowest km
        const fastest = this._getFastestSegment('km', 1);
        const slowest = this._getSlowestSegment('km', 1);

        if (fastest) {
            const fPace = 60 / fastest.avg_speed;
            const fMin = Math.floor(fPace);
            const fSec = Math.round((fPace - fMin) * 60);
            this.result.pace_fastest_km = { minutes: fMin, seconds: fSec, speed: fastest.avg_speed };
        }

        if (slowest) {
            const sPace = 60 / slowest.avg_speed;
            const sMin = Math.floor(sPace);
            const sSec = Math.round((sPace - sMin) * 60);
            this.result.pace_slowest_km = { minutes: sMin, seconds: sSec, speed: slowest.avg_speed };
        }

        // Check for negative/positive split
        const splitPoint = Math.floor(this.track.points.length / 2);
        const firstHalf = this.track.points.slice(0, splitPoint);
        const secondHalf = this.track.points.slice(splitPoint);

        const firstHalfAvg = firstHalf.filter(p => p.pace).reduce((sum, p) => sum + (p.minutes + p.seconds / 60), 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.filter(p => p.pace).reduce((sum, p) => sum + (p.minutes + p.seconds / 60), 0) / secondHalf.length;

        this.result.split_analysis = {
            first_half_pace: firstHalfAvg,
            second_half_pace: secondHalfAvg,
            is_positive_split: secondHalfAvg > firstHalfAvg,
            difference: Math.abs(secondHalfAvg - firstHalfAvg)
        };
    }

    /**
     * Calculate cadence metrics
     */
    _calculateCadenceMetrics() {
        const cadences = this.track.points
            .filter(p => p.cadence && p.cadence > 0)
            .map(p => p.cadence);

        if (cadences.length === 0) return;

        const avg = cadences.reduce((a, b) => a + b) / cadences.length;
        const max = Math.max(...cadences);
        const min = Math.min(...cadences);

        this.result.cadence_avg = Math.round(avg);
        this.result.cadence_max = max;

        this.result.sport_analysis = this.result.sport_analysis || {};
        this.result.sport_analysis.cadence_efficiency = this._analyzeCadenceEfficiency(cadences);
    }

    /**
     * Analyze cadence efficiency
     */
    _analyzeCadenceEfficiency(cadences) {
        if (cadences.length < 2) return null;

        const sorted = [...cadences].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;

        // Count stable cadence points (within IQR)
        const stable = cadences.filter(c => c >= q1 && c <= q3).length;
        const efficiency = (stable / cadences.length) * 100;

        return {
            avg_cadence: Math.round(cadences.reduce((a, b) => a + b) / cadences.length),
            stability_score: Math.round(efficiency),
            consistency: efficiency > 80 ? 'high' : efficiency > 60 ? 'moderate' : 'low'
        };
    }

    /**
     * Calculate running dynamics
     */
    _calculateRunningDynamics() {
        if (!this.result.hr_avg || !this.result.cadence_avg) return;

        const pace_hr_ratio = this.result.speed_avg / (this.result.hr_avg / 100);
        const cadence_hr_ratio = this.result.cadence_avg / (this.result.hr_avg / 100);

        this.result.sport_analysis = this.result.sport_analysis || {};
        this.result.sport_analysis.running_dynamics = {
            pace_per_hr: pace_hr_ratio,
            cadence_per_hr: cadence_hr_ratio,
            efficiency_score: Math.round(pace_hr_ratio * 10)
        };

        // HR drift detection
        if (this.result.hr_avg > 0) {
            const firstHourPoints = this.track.points.slice(0, Math.floor(this.track.points.length * 0.25));
            const lastHourPoints = this.track.points.slice(Math.floor(this.track.points.length * 0.75));

            const firstHrAvg = firstHourPoints.filter(p => p.heart_rate).reduce((sum, p) => sum + p.heart_rate, 0) / 
                             firstHourPoints.filter(p => p.heart_rate).length || 0;
            const lastHrAvg = lastHourPoints.filter(p => p.heart_rate).reduce((sum, p) => sum + p.heart_rate, 0) / 
                            lastHourPoints.filter(p => p.heart_rate).length || 0;

            if (firstHrAvg > 0) {
                this.result.hr_drift = Math.round(((lastHrAvg - firstHrAvg) / firstHrAvg) * 100);
            }
        }
    }

    /**
     * Classify running session type
     */
    _classifySession() {
        const elevGain = this.result.elevation_gain;
        const distance = this.result.distance_total;
        const avgPace = this.result.pace_avg;
        const hrDrift = this.result.hr_drift ?? 0;

        let sessionType = 'easy run';

        if (elevGain / distance > 0.05) {
            sessionType = 'hill workout';
        } else if (distance > 20) {
            sessionType = 'long run';
        } else if (hrDrift > 5) {
            sessionType = 'tempo run';
        }

        this.result.sport_analysis.session_type = sessionType;
    }
}
