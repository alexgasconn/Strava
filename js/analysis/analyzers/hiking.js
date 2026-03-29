/**
 * HIKING.JS — Hiking/Trekking analyzer
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class HikingAnalyzer extends BaseAnalyzer {
    async analyze() {
        // Calculate basic metrics
        this._calculateBasicMetrics();

        // Hiking-specific metrics
        this._calculateVerticalMetrics();
        this._calculateClimbEfficiency();
        this._calculateDescentMetrics();
        this._classifyTerrainDifficulty();

        return this.result;
    }

    /**
     * Calculate vertical-focused metrics
     */
    _calculateVerticalMetrics() {
        const distance = this.result.distance_total;
        const elevation_gain = this.result.elevation_gain;

        this.result.sport_analysis = this.result.sport_analysis || {};
        this.result.sport_analysis.vertical = {
            gain_per_km: distance > 0 ? elevation_gain / distance : 0,
            steepest_section: Math.max(...this.track.points.map(p => p.grade)),
            total_gain: elevation_gain,
            total_loss: this.result.elevation_loss,
            gain_loss_ratio: this.result.elevation_loss > 0 ? elevation_gain / this.result.elevation_loss : 0
        };
    }

    /**
     * Calculate climb efficiency
     */
    _calculateClimbEfficiency() {
        const climbPoints = this.track.points.filter(p => p.grade > 2 && p.moving);
        if (climbPoints.length === 0) return;

        const climb_duration = climbPoints.reduce((sum, p) => sum + p.delta_time, 0);
        const climb_distance = climbPoints[climbPoints.length - 1].distance_from_start - climbPoints[0].distance_from_start;
        const climb_elevation = climbPoints[climbPoints.length - 1].vertical_gain - climbPoints[0].vertical_gain;

        const speeds = climbPoints.map(p => p.speed).filter(s => s > 0);
        const avg_climb_speed = speeds.reduce((a, b) => a + b) / speeds.length || 0;

        this.result.sport_analysis.climb_efficiency = {
            avg_climb_speed: Math.round(avg_climb_speed * 10) / 10,
            climb_time_pct: Math.round((climb_duration / this.result.time_moving) * 100),
            avg_gradient_on_climbs: Math.round((climb_elevation / (climb_distance * 1000)) * 100)
        };
    }

    /**
     * Calculate descent metrics
     */
    _calculateDescentMetrics() {
        const descentPoints = this.track.points.filter(p => p.grade < -1 && p.moving);
        if (descentPoints.length === 0) return;

        const descent_duration = descentPoints.reduce((sum, p) => sum + p.delta_time, 0);
        const descent_distance = descentPoints[descentPoints.length - 1].distance_from_start - descentPoints[0].distance_from_start;

        const speeds = descentPoints.map(p => p.speed).filter(s => s > 0);
        const avg_descent_speed = speeds.reduce((a, b) => a + b) / speeds.length || 0;

        this.result.sport_analysis.descent_efficiency = {
            avg_descent_speed: Math.round(avg_descent_speed * 10) / 10,
            max_descent_speed: Math.round(Math.max(...speeds) * 10) / 10,
            descent_time_pct: Math.round((descent_duration / this.result.time_moving) * 100)
        };
    }

    /**
     * Classify terrain difficulty
     */
    _classifyTerrainDifficulty() {
        const vertical_gain = this.result.elevation_gain;
        const distance = this.result.distance_total;
        const max_grade = Math.max(...this.track.points.map(p => Math.abs(p.grade)));

        const gain_per_km = distance > 0 ? vertical_gain / distance : 0;
        const intensity_score = (gain_per_km * 10) + (max_grade / 2);

        let difficulty = 'easy';
        if (intensity_score > 15) difficulty = 'very_hard';
        else if (intensity_score > 10) difficulty = 'hard';
        else if (intensity_score > 5) difficulty = 'moderate';

        this.result.sport_analysis.terrain_difficulty = {
            score: intensity_score,
            difficulty,
            vertical_intensity: gain_per_km,
            steepness_intensity: max_grade
        };
    }
}
