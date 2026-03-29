/**
 * CYCLING.JS — Road cycling analyzer
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class CyclingAnalyzer extends BaseAnalyzer {
    async analyze() {
        // Calculate basic metrics
        this._calculateBasicMetrics();

        // Cycling-specific metrics
        this._calculateSpeedByTerrain();
        this._calculatePowerMetrics();
        this._calculateVAM();
        this._calculateCadenceMetrics();
        this._calculatePowerZones();

        // Estimate power if not available
        if (!this.result.power_avg) {
            this._estimatePower();
        }

        return this.result;
    }

    /**
     * Calculate speed breakdown by terrain
     */
    _calculateSpeedByTerrain() {
        const terrains = { flat: [], climb: [], descent: [] };

        for (const point of this.track.points) {
            if (!point.moving || point.speed <= 0) continue;
            const terrain = point.terrain_type || 'flat';
            if (terrains[terrain]) terrains[terrain].push(point.speed);
        }

        const result = {};
        for (const [terrain, speeds] of Object.entries(terrains)) {
            if (speeds.length > 0) {
                result[terrain] = Math.round(speeds.reduce((a, b) => a + b) / speeds.length * 10) / 10;
            }
        }

        this.result.sport_analysis = this.result.sport_analysis || {};
        this.result.sport_analysis.speed_by_terrain = result;
    }

    /**
     * Calculate power metrics
     */
    _calculatePowerMetrics() {
        if (!this.result.power_avg) return;

        const powers = this.track.points
            .filter(p => p.power && p.power > 0)
            .map(p => p.power);

        if (powers.length === 0) return;

        const sorted = [...powers].sort((a, b) => a - b);
        const normalized_power = this._calculateNormalizedPower();

        this.result.power_normalized = normalized_power;
        this.result.sport_analysis.power_metrics = {
            avg_power: Math.round(this.result.power_avg),
            normalized_power: Math.round(normalized_power),
            max_power: Math.round(this.result.power_max),
            median_power: sorted[Math.floor(sorted.length / 2)]
        };

        // Calculate IF and TSS
        this._calculateIntensityMetrics();
    }

    /**
     * Calculate normalized power (4th second moving average)
     */
    _calculateNormalizedPower() {
        const powers = [];
        const window = Math.floor(30); // 30 seconds

        for (let i = 0; i < this.track.points.length - window; i++) {
            const window_powers = this.track.points.slice(i, i + window)
                .map(p => p.power)
                .filter(pw => pw && pw > 0);

            if (window_powers.length > 0) {
                const avg = window_powers.reduce((a, b) => a + b) / window_powers.length;
                powers.push(Math.pow(avg, 4));
            }
        }

        if (powers.length === 0) return this.result.power_avg;
        const avg_power_4 = powers.reduce((a, b) => a + b) / powers.length;
        return Math.pow(avg_power_4, 0.25);
    }

    /**
     * Calculate Intensity Factor and TSS
     */
    _calculateIntensityMetrics(ftp = 250) {
        if (!this.result.power_normalized) return;

        const if_value = this.result.power_normalized / ftp;
        const hours = this.result.time_moving / 3600;
        const tss = (hours * this.result.power_normalized * if_value) / (ftp * 3600) * 100;

        this.result.if_intensity_factor = Math.round(if_value * 100) / 100;
        this.result.tss = Math.round(tss);

        this.result.sport_analysis.intensity = {
            if: if_value,
            tss: tss,
            effort_level: this._getEffortLevel(if_value)
        };
    }

    /**
     * Get effort level from IF
     */
    _getEffortLevel(if_value) {
        if (if_value < 0.75) return 'endurance';
        if (if_value < 0.85) return 'steady';
        if (if_value < 1.05) return 'tempo';
        if (if_value < 1.2) return 'threshold';
        return 'vo2max';
    }

    /**
     * Calculate VAM for climbs
     */
    _calculateVAM() {
        if (!this.result.climbs || this.result.climbs.length === 0) return;

        const vams = this.result.climbs
            .map(c => c.vam)
            .filter(v => v > 0);

        if (vams.length > 0) {
            this.result.sport_analysis.vam = {
                avg: Math.round(vams.reduce((a, b) => a + b) / vams.length),
                max: Math.round(Math.max(...vams)),
                climb_count: vams.length
            };
        }
    }

    /**
     * Calculate cadence metrics
     */
    _calculateCadenceMetrics() {
        const cadences = this.track.points
            .filter(p => p.cadence && p.cadence > 0)
            .map(p => p.cadence);

        if (cadences.length === 0) return;

        this.result.cadence_avg = Math.round(cadences.reduce((a, b) => a + b) / cadences.length);
        this.result.cadence_max = Math.max(...cadences);

        this.result.sport_analysis.cadence_analysis = {
            avg: this.result.cadence_avg,
            max: this.result.cadence_max,
            min: Math.min(...cadences)
        };
    }

    /**
     * Estimate power from speed and grade (if not available)
     */
    _estimatePower() {
        const powers = [];

        for (const point of this.track.points) {
            if (point.speed <= 0) {
                powers.push(0);
                continue;
            }

            // Simplified physics: P = F * v
            // Assume 75kg athlete
            const mass = 75;
            const cda = 0.35;
            const crr = 0.004;
            const g = 9.81;

            const grade = point.grade / 100;
            const gravity_power = mass * g * grade * point.speed / 3.6;
            const rolling_resistance = mass * g * crr * point.speed / 3.6;
            const air_resistance = 0.5 * 1.225 * cda * Math.pow(point.speed / 3.6, 3);

            const estimated_power = Math.max(0, gravity_power + rolling_resistance + air_resistance);
            powers.push(estimated_power);
        }

        const validPowers = powers.filter(p => p > 0);
        if (validPowers.length > 0) {
            this.result.power_avg = validPowers.reduce((a, b) => a + b) / validPowers.length;
            this.result.power_max = Math.max(...validPowers);
        }
    }
}
