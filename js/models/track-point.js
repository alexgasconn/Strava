/**
 * TRACK_POINT.JS — Core data model for a single point in activity track
 * Represents reconstructed GPX point with all derived metrics
 */

export class TrackPoint {
    constructor(data = {}) {
        // Raw/Required fields
        this.index = data.index ?? 0;                    // Position in track
        this.timestamp = data.timestamp ?? null;         // Epoch ms
        this.latitude = data.latitude ?? null;
        this.longitude = data.longitude ?? null;
        this.elevation = data.elevation ?? null;         // meters

        // Distance metrics
        this.distance_from_start = data.distance_from_start ?? 0;  // cumulative km
        this.delta_distance = data.delta_distance ?? 0;            // segment distance km
        
        // Time metrics
        this.delta_time = data.delta_time ?? 0;          // seconds since last point
        
        // Speed / Pace
        this.speed = data.speed ?? 0;                    // km/h
        this.pace = data.pace ?? null;                   // min/km
        
        // Grade / Elevation
        this.grade = data.grade ?? 0;                    // % gradient
        this.vertical_speed = data.vertical_speed ?? 0;  // m/s (vertical climb speed)
        
        // Effort sensors
        this.heart_rate = data.heart_rate ?? null;       // bpm
        this.cadence = data.cadence ?? null;             // steps/min or rpm
        this.power = data.power ?? null;                 // watts
        this.temperature = data.temperature ?? null;     // °C
        
        // Flags
        this.moving = data.moving ?? true;               // true if athlete was moving
        
        // Derived fields (calculated during preprocessing)
        this.vertical_gain = data.vertical_gain ?? 0;    // cumulative vertical meters gained
        this.vertical_loss = data.vertical_loss ?? 0;    // cumulative vertical meters lost
        this.bearing = data.bearing ?? null;             // direction in degrees (0-360)
        this.acceleration = data.acceleration ?? 0;      // m/s² acceleration
        
        // Environmental
        this.wind_speed = data.wind_speed ?? null;       // km/h
        this.wind_direction = data.wind_direction ?? null; // degrees
        this.headwind_component = data.headwind_component ?? 0; // km/h
        
        // Classification
        this.terrain_type = data.terrain_type ?? null;   // 'flat', 'climb', 'descent', 'technical'
        this.in_climb = data.in_climb ?? false;
        this.in_descent = data.in_descent ?? false;
        this.is_stopped = data.is_stopped ?? false;
    }

    /**
     * Calculate pace from speed
     */
    calculatePace() {
        if (this.speed <= 0) return null;
        const pace_minutes = 60 / this.speed;
        const minutes = Math.floor(pace_minutes);
        const seconds = Math.round((pace_minutes - minutes) * 60);
        return { minutes, seconds };
    }

    /**
     * Format pace as MM:SS
     */
    getPaceString() {
        const p = this.calculatePace();
        if (!p) return '--:--';
        return `${p.minutes}:${p.seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Estimate VAM (vertical ascent meters / hour)
     */
    getVAM() {
        if (this.vertical_speed <= 0) return 0;
        return this.vertical_speed * 3600; // convert m/s to m/h
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return { ...this };
    }
}
