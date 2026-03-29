/**
 * TRAIL_RUN.JS — Trail running analyzer
 */

import { RunningAnalyzer } from './running.js';

export class TrailRunAnalyzer extends RunningAnalyzer {
    async analyze() {
        // Calculate base running metrics
        await super.analyze();

        // Trail-specific metrics
        this._calculateGAP();
        this._calculateTerrainComplexity();
        this._analyzeDescentEfficiency();
        this._detectTechnicalTerrain();

        return this.result;
    }

    /**
     * Calculate GAP (Grade Adjusted Pace)
     */
    _calculateGAP() {
        const gaps = [];

        for (const point of this.track.points) {
            if (!point.pace || !point.moving || point.speed <= 0) continue;

            // GAP formula: adjust for grade
            const grade = point.grade;
            const adjustment = Math.exp((grade / 100) * 0.05);
            const gap_speed = point.speed / adjustment;

            if (gap_speed > 0) {
                const gap_pace = 60 / gap_speed;
                gaps.push(gap_pace);
            }
        }

        if (gaps.length > 0) {
            const avgGap = gaps.reduce((a, b) => a + b) / gaps.length;
            const gapMin = Math.floor(avgGap);
            const gapSec = Math.round((avgGap - gapMin) * 60);

            this.result.sport_analysis = this.result.sport_analysis || {};
            this.result.sport_analysis.gap_avg = { minutes: gapMin, seconds: gapSec };
        }
    }

    /**
     * Calculate terrain complexity
     */
    _calculateTerrainComplexity() {
        const climbs = this.result.climbs || [];
        const descents = [];
        let technicalPoints = 0;

        // Count descents
        let descentStart = null;
        for (let i = 0; i < this.track.points.length; i++) {
            const point = this.track.points[i];
            if (point.grade < -2) {
                if (!descentStart) descentStart = i;
            } else {
                if (descentStart !== null) {
                    descents.push({ start: descentStart, end: i });
                    descentStart = null;
                }
            }

            // Count technical points
            if (Math.abs(point.grade) > 8) technicalPoints++;
        }

        const totalPoints = this.track.points.filter(p => p.moving).length;
        const climbDensity = climbs.length / (this.result.distance_total || 1);
        const technicalScore = (technicalPoints / totalPoints) * 100;

        this.result.sport_analysis.terrain_complexity = {
            climb_count: climbs.length,
            climb_density: climbDensity,
            descent_count: descents.length,
            technical_score: Math.round(technicalScore),
            technical_terrain: technicalScore > 15 ? 'technical' : technicalScore > 5 ? 'moderate' : 'easy'
        };
    }

    /**
     * Analyze descent efficiency
     */
    _analyzeDescentEfficiency() {
        const descentPoints = this.track.points.filter(p => p.grade < -2 && p.moving);
        if (descentPoints.length === 0) return;

        const speeds = descentPoints.map(p => p.speed).filter(s => s > 0);
        const avg_descent_speed = speeds.reduce((a, b) => a + b) / speeds.length;
        const max_descent_speed = Math.max(...speeds);

        const efficiency = avg_descent_speed / (this.result.speed_avg || 1);

        this.result.sport_analysis.descent_efficiency = {
            avg_speed: Math.round(avg_descent_speed * 10) / 10,
            max_speed: Math.round(max_descent_speed * 10) / 10,
            efficiency_ratio: Math.round(efficiency * 100),
            quality: efficiency > 1.5 ? 'excellent' : efficiency > 1.2 ? 'good' : 'moderate'
        };
    }

    /**
     * Detect technical terrain
     */
    _detectTechnicalTerrain() {
        const technicalZones = [];
        let zoneStart = null;

        for (let i = 0; i < this.track.points.length; i++) {
            const point = this.track.points[i];
            const isRough = Math.abs(point.grade) > 8 || (i >0 && Math.abs(point.elevation - this.track.points[i-1].elevation) > 2);

            if (isRough && !point.moving) {
                if (!zoneStart) zoneStart = i;
            } else {
                if (zoneStart !== null) {
                    technicalZones.push({
                        start_idx: zoneStart,
                        end_idx: i,
                        start_dist: this.track.points[zoneStart].distance_from_start,
                        end_dist: this.track.points[i - 1].distance_from_start
                    });
                    zoneStart = null;
                }
            }
        }

        this.result.sport_analysis.technical_zones = technicalZones;
    }
}
