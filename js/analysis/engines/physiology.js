/**
 * PHYSIOLOGY.JS — Physiological analysis engine
 */

export class PhysiologyEngine {
    constructor(config = {}) {
        this.config = {
            max_hr: config.max_hr ?? 195,
            lthr: config.lthr ?? 170,            // Lactate threshold HR
            hr_rest: config.hr_rest ?? 60,
            ftp: config.ftp ?? 250,              // Functional Threshold Power
            threshold_pace: config.threshold_pace ?? 5.5 // min/km
        };
    }

    /**
     * Calculate physiological metrics
     */
    analyze(track, analysis_result = null) {
        const physiology = {};

        // Heart rate analysis
        if (track.points.some(p => p.heart_rate && p.heart_rate > 0)) {
            physiology.heart_rate = this._analyzeHeartRate(track, analysis_result);
        }

        // Power analysis
        if (track.points.some(p => p.power && p.power > 0)) {
            physiology.power = this._analyzePower(track, analysis_result);
        }

        // Efficiency metrics
        physiology.efficiency = this._calculateEfficiency(track, analysis_result);

        // Stress/Recovery
        physiology.stress = this._calculateStressIndicators(track);

        return physiology;
    }

    /**
     * Analyze heart rate metrics
     */
    _analyzeHeartRate(track, analysis_result) {
        const hrs = track.points
            .filter(p => p.heart_rate && p.heart_rate > 0)
            .map(p => p.heart_rate);

        if (hrs.length === 0) return null;

        const avg_hr = hrs.reduce((a, b) => a + b) / hrs.length;
        const max_hr = Math.max(...hrs);
        const min_hr = Math.min(...hrs);

        // Calculate intensity factor
        const if_hr = avg_hr / this.config.max_hr;

        // Time in zones (simplified)
        const zones = this._calculateHRZones(hrs);

        // HR drift (change in HR as activity progresses despite stable effort)
        const firstQuarter = track.points.slice(0, Math.floor(track.points.length * 0.25))
            .filter(p => p.heart_rate).map(p => p.heart_rate);
        const lastQuarter = track.points.slice(Math.floor(track.points.length * 0.75))
            .filter(p => p.heart_rate).map(p => p.heart_rate);

        const hr_drift = this._calculateHRDrift(firstQuarter, lastQuarter);

        return {
            avg: Math.round(avg_hr),
            max: max_hr,
            min: min_hr,
            intensity_factor: Math.round(if_hr * 100) / 100,
            zones,
            drift_pct: hr_drift,
            efficiency_score: this._calculateHREfficiency(avg_hr, analysis_result)
        };
    }

    /**
     * Analyze power metrics
     */
    _analyzePower(track, analysis_result) {
        const powers = track.points
            .filter(p => p.power && p.power > 0)
            .map(p => p.power);

        if (powers.length === 0) return null;

        const avg_power = powers.reduce((a, b) => a + b) / powers.length;
        const max_power = Math.max(...powers);
        const normalized_power = this._calculateNormalizedPower(powers);

        // Calculate intensity factor
        const if_power = normalized_power / this.config.ftp;

        // Time in power zones
        const zones = this._calculatePowerZones(powers);

        // TSS estimate
        const hours = track.points.filter(p => p.moving).length / 3600;
        const tss = (hours * normalized_power * if_power) / (this.config.ftp * 3600) * 100;

        return {
            avg: Math.round(avg_power),
            max: max_power,
            normalized: Math.round(normalized_power),
            intensity_factor: Math.round(if_power * 100) / 100,
            zones,
            tss: Math.round(tss),
            efficiency_score: avg_power / Math.max(1, analysis_result?.weight || 75)
        };
    }

    /**
     * Calculate efficiency metrics
     */
    _calculateEfficiency(track, analysis_result) {
        const efficiency = {};

        // Speed per HR (running/walking)
        const valid_points = track.points.filter(p => p.moving && p.heart_rate && p.heart_rate > 0);
        if (valid_points.length > 0) {
            const speed_avg = valid_points.reduce((sum, p) => sum + p.speed, 0) / valid_points.length;
            const hr_avg = valid_points.reduce((sum, p) => sum + p.heart_rate, 0) / valid_points.length;

            efficiency.speed_per_hr = Math.round((speed_avg / hr_avg) * 1000) / 1000;
        }

        // Power per kg (cycling)
        if (analysis_result?.power_avg && analysis_result?.weight) {
            efficiency.power_per_kg = Math.round((analysis_result.power_avg / analysis_result.weight) * 100) / 100;
        }

        // Pace per HR (running)
        if (analysis_result?.pace_avg && analysis_result?.hr_avg) {
            const pace_seconds = analysis_result.pace_avg.minutes * 60 + analysis_result.pace_avg.seconds;
            efficiency.pace_per_hr = Math.round((pace_seconds / analysis_result.hr_avg) * 10) / 10;
        }

        return efficiency;
    }

    /**
     * Calculate stress indicators
     */
    _calculateStressIndicators(track) {
        const valid_points = track.points.filter(p => p.heart_rate && p.heart_rate > 0);
        if (valid_points.length === 0) return null;

        const hrs = valid_points.map(p => p.heart_rate);
        const avg_hr = hrs.reduce((a, b) => a + b) / hrs.length;

        // Variability (higher = healthier)
        const mean_hr = avg_hr;
        const variance = hrs.reduce((sum, hr) => sum + Math.pow(hr - mean_hr, 2), 0) / hrs.length;
        const hr_variability = Math.sqrt(variance);

        // Time above threshold
        const above_threshold = hrs.filter(hr => hr > this.config.lthr).length;
        const time_above_threshold_pct = (above_threshold / hrs.length) * 100;

        // Recovery index
        const recovery_index = hr_variability > 5 ? 'good' : 'stressed';

        return {
            hr_variability: Math.round(hr_variability),
            time_above_threshold_pct: Math.round(time_above_threshold_pct),
            recovery_index,
            stress_level: time_above_threshold_pct > 50 ? 'high' : time_above_threshold_pct > 25 ? 'moderate' : 'low'
        };
    }

    // ===== Helper methods =====

    _calculateHRZones(hrs) {
        const zones = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };

        for (const hr of hrs) {
            const pct = (hr / this.config.max_hr) * 100;
            if (pct < 60) zones.Z1++;
            else if (pct < 70) zones.Z2++;
            else if (pct < 80) zones.Z3++;
            else if (pct < 90) zones.Z4++;
            else zones.Z5++;
        }

        const total = hrs.length;
        return Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, Math.round((v / total) * 100)]));
    }

    _calculatePowerZones(powers) {
        const zones = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0 };

        for (const power of powers) {
            const pct = (power / this.config.ftp) * 100;
            if (pct < 55) zones.Z1++;
            else if (pct < 75) zones.Z2++;
            else if (pct < 90) zones.Z3++;
            else if (pct < 105) zones.Z4++;
            else if (pct < 120) zones.Z5++;
            else zones.Z6++;
        }

        const total = powers.length;
        return Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, Math.round((v / total) * 100)]));
    }

    _calculateHRDrift(firstQuarter, lastQuarter) {
        if (firstQuarter.length === 0 || lastQuarter.length === 0) return 0;

        const avg1 = firstQuarter.reduce((a, b) => a + b) / firstQuarter.length;
        const avg2 = lastQuarter.reduce((a, b) => a + b) / lastQuarter.length;

        return Math.round(((avg2 - avg1) / avg1) * 100);
    }

    _calculateHREfficiency(avg_hr, analysis_result) {
        if (!analysis_result || !analysis_result.pace_avg) return 0;

        const pace_seconds = analysis_result.pace_avg.minutes * 60 + analysis_result.pace_avg.seconds;
        return Math.round((60 / pace_seconds) / (avg_hr / 100) * 10);
    }

    _calculateNormalizedPower(powers) {
        if (powers.length < 30) return powers.reduce((a, b) => a + b) / powers.length;

        const p4 = powers.map(p => Math.pow(p, 4));
        const avg_p4 = p4.reduce((a, b) => a + b) / p4.length;

        return Math.pow(avg_p4, 0.25);
    }
}
