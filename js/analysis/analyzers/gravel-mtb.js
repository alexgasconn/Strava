/**
 * GRAVEL_MTB.JS — Gravel/MTB analyzer
 */

import { CyclingAnalyzer } from './cycling.js';

export class GravelMTBAnalyzer extends CyclingAnalyzer {
    async analyze() {
        // Calculate cycling metrics first
        await super.analyze();

        // Gravel/MTB-specific metrics
        this._calculateRoughnessIndex();
        this._calculateTechnicalScore();
        this._analyzeBrakingPattern();
        this._analyzeAcceleration();

        return this.result;
    }

    /**
     * Calculate Roughness Index (terrain roughness)
     */
    _calculateRoughnessIndex() {
        const speedVariations = [];
        const elevationVariations = [];

        for (let i = 1; i < this.track.points.length; i++) {
            const prev = this.track.points[i - 1];
            const curr = this.track.points[i];

            // Speed variation
            const speedDiff = Math.abs(curr.speed - prev.speed);
            speedVariations.push(speedDiff);

            // Elevation variation
            const elevDiff = Math.abs(curr.elevation - prev.elevation);
            elevationVariations.push(elevDiff);
        }

        const avgSpeedVar = speedVariations.reduce((a, b) => a + b) / speedVariations.length || 0;
        const avgElevVar = elevationVariations.reduce((a, b) => a + b) / elevationVariations.length || 0;

        const roughness = (avgSpeedVar * 10) + (avgElevVar * 5);

        this.result.sport_analysis.roughness_index = {
            score: Math.round(roughness),
            speed_variation: Math.round(avgSpeedVar * 10) / 10,
            elevation_variation: Math.round(avgElevVar * 100) / 100,
            surface_quality: roughness > 50 ? 'very_rough' : roughness > 30 ? 'rough' : roughness > 15 ? 'moderate' : 'smooth'
        };
    }

    /**
     * Calculate technical score
     */
    _calculateTechnicalScore() {
        let technicalPoints = 0;

        for (let i = 1; i < this.track.points.length; i++) {
            const point = this.track.points[i];
            const prev = this.track.points[i - 1];

            // Rapid direction changes
            if (point.bearing && prev.bearing) {
                const bearing_diff = Math.abs(point.bearing - prev.bearing);
                if (bearing_diff > 30) technicalPoints += 2;
            }

            // Steep grades
            if (Math.abs(point.grade) > 10) technicalPoints += 1;

            // Elevation changes
            if (Math.abs(point.elevation - prev.elevation) > 2) technicalPoints += 1;
        }

        const total_points = this.track.points.length;
        const technical_score = (technicalPoints / total_points) * 100;

        this.result.sport_analysis.technical_score = {
            score: Math.round(technical_score),
            difficulty: technical_score > 30 ? 'extreme' : technical_score > 20 ? 'very_technical' : technical_score > 10 ? 'technical' : 'easy'
        };
    }

    /**
     * Analyze braking patterns
     */
    _analyzeBrakingPattern() {
        const brakingEvents = [];

        for (let i = 1; i < this.track.points.length; i++) {
            const point = this.track.points[i];
            const prev = this.track.points[i - 1];

            // Detect braking (negative acceleration > 0.5 m/s²)
            if (point.acceleration < -0.5) {
                brakingEvents.push({
                    index: i,
                    deceleration: Math.abs(point.acceleration),
                    from_speed: prev.speed,
                    to_speed: point.speed
                });
            }
        }

        this.result.sport_analysis.braking = {
            event_count: brakingEvents.length,
            avg_deceleration: brakingEvents.length > 0 ? 
                brakingEvents.reduce((sum, e) => sum + e.deceleration, 0) / brakingEvents.length : 0,
            frequency_per_km: brakingEvents.length / (this.result.distance_total || 1)
        };
    }

    /**
     * Analyze acceleration bursts
     */
    _analyzeAcceleration() {
        const accelerationEvents = [];

        for (let i = 1; i < this.track.points.length; i++) {
            const point = this.track.points[i];

            // Detect acceleration (positive acceleration > 0.5 m/s²)
            if (point.acceleration > 0.5) {
                accelerationEvents.push({
                    index: i,
                    acceleration: point.acceleration,
                    speed: point.speed
                });
            }
        }

        this.result.sport_analysis.acceleration = {
            event_count: accelerationEvents.length,
            avg_acceleration: accelerationEvents.length > 0 ? 
                accelerationEvents.reduce((sum, e) => sum + e.acceleration, 0) / accelerationEvents.length : 0,
            frequency_per_km: accelerationEvents.length / (this.result.distance_total || 1)
        };
    }
}
