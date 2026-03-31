/**
 * CLIMB.JS — Represents a detected climb
 * Extends Segment with climbing-specific metrics
 */

import { Segment } from './segment.js';

export class Climb extends Segment {
    constructor(data = {}) {
        super({
            ...data,
            type: 'climb',
            terrain_type: 'climb'
        });
        
        // Climb-specific fields
        this.category = data.category ?? null;          // '4', '3', '2', '1', 'HC'
        this.climb_speed = data.climb_speed ?? 0;       // m/min
        this.avg_vertical_speed = data.avg_vertical_speed ?? 0; // m/s
        this.steepest_section = data.steepest_section ?? 0; // % grade
        this.technical_difficulty = data.technical_difficulty ?? 0; // 0-10 scale
        this.surface = data.surface ?? null;             // 'asphalt', 'gravel', 'dirt', 'trail', etc.
    }

    /**
     * Categorize climb based on Strava-like rules
     * Cat 4: <2 km, <100m
     * Cat 3: 2-5 km, 100-250m
     * Cat 2: 5-10 km, 250-500m
     * Cat 1: 10-20 km, 500-1000m
     * HC: >20 km or >1000m
     */
    categorizeClimb() {
        console.log("classifyClimb: length=", this.distance, "km, elevation_gain=", this.elevation_gain, "m");
        const length = this.distance;  // km
        const elevation = this.elevation_gain;  // m
        
        if (elevation > 1000 || length > 20) return 'HC';
        if (elevation >= 500 || length >= 10) return 'Cat 1';
        if (elevation >= 250 || length >= 5) return 'Cat 2';
        if (elevation >= 100 || length >= 2) return 'Cat 3';
        return 'Cat 4';
    }

    /**
     * Determine if this is a valid climb
     */
    isValidClimb() {
        // Minimum 300m length and 20m elevation gain and >3% average grade
        return this.distance >= 0.3 && this.elevation_gain >= 20 && this.avg_grade >= 3;
    }

    /**
     * Get difficulty rating (1-10)
     */
    getDifficultyRating() {
        const gradeScore = Math.min(10, this.avg_grade / 2);
        const lengthScore = Math.min(10, (this.distance / 2) * 10);
        const categoryScore = ['4', '3', '2', '1', 'HC'].indexOf(this.category) * 2;
        
        return (gradeScore + lengthScore + categoryScore) / 3;
    }

    /**
     * Get climb intensity
     */
    getIntensity() {
        const difficulty = this.getDifficultyRating();
        if (difficulty < 2) return 'easy';
        if (difficulty < 4) return 'moderate';
        if (difficulty < 6) return 'hard';
        if (difficulty < 8) return 'very_hard';
        return 'extreme';
    }
}
