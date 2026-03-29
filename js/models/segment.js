/**
 * SEGMENT.JS — Represents a meaningful segment of an activity
 * Can be distance-based, time-based, terrain-based, or effort-based
 */

export class Segment {
    constructor(data = {}) {
        // Identification
        this.id = data.id ?? null;
        this.type = data.type ?? 'distance';  // 'distance', 'time', 'terrain', 'effort', 'climb'
        this.start_index = data.start_index ?? 0;
        this.end_index = data.end_index ?? 0;
        
        // Distance/Time boundaries
        this.start_distance = data.start_distance ?? 0;  // km
        this.end_distance = data.end_distance ?? 0;
        this.duration = data.duration ?? 0;              // seconds
        this.distance = data.distance ?? 0;              // segment distance
        
        // Elevation
        this.elevation_gain = data.elevation_gain ?? 0;
        this.elevation_loss = data.elevation_loss ?? 0;
        this.min_elevation = data.min_elevation ?? 0;
        this.max_elevation = data.max_elevation ?? 0;
        this.avg_grade = data.avg_grade ?? 0;
        this.max_grade = data.max_grade ?? 0;
        
        // Speed/Pace
        this.avg_speed = data.avg_speed ?? 0;
        this.max_speed = data.max_speed ?? 0;
        this.avg_pace = data.avg_pace ?? null;           // {minutes, seconds}
        
        // Effort
        this.avg_heart_rate = data.avg_heart_rate ?? null;
        this.max_heart_rate = data.max_heart_rate ?? null;
        this.avg_power = data.avg_power ?? null;
        this.max_power = data.max_power ?? null;
        this.avg_cadence = data.avg_cadence ?? null;
        
        // Classification
        this.terrain_type = data.terrain_type ?? null;   // 'flat', 'climb', 'descent', 'technical'
        this.effort_level = data.effort_level ?? null;   // 'easy', 'steady', 'tempo', 'hard', 'recovery'
        this.wind_type = data.wind_type ?? null;         // 'headwind', 'tailwind', 'crosswind'
        
        // Derived metrics
        this.vam = data.vam ?? null;                      // vertical ascent m/h
        this.efficiency = data.efficiency ?? null;        // pace/HR or W/kg
        this.fatigue_index = data.fatigue_index ?? 0;
        
        // Labels/Names
        this.name = data.name ?? null;
        this.description = data.description ?? null;
    }

    /**
     * Calculate VAM if elevation and duration known
     */
    calculateVAM() {
        if (this.duration <= 0 || this.elevation_gain <= 0) return 0;
        const hours = this.duration / 3600;
        return this.elevation_gain / hours;
    }

    /**
     * Get segment as simple object
     */
    toJSON() {
        return { ...this };
    }
}
