/**
 * AERO.JS — Aerodynamic analysis engine
 */

export class AeroEngine {
    constructor(config = {}) {
        this.config = {
            default_cda: config.default_cda ?? 0.3,      // Coefficient of drag * frontal area
            default_mass: config.default_mass ?? 75,     // kg
            air_density: config.air_density ?? 1.225,    // kg/m³
            crr: config.crr ?? 0.004,                    // rolling resistance coefficient
            wind_speed: config.wind_speed ?? 0,          // km/h
            wind_direction: config.wind_direction ?? 0   // degrees
        };
    }

    /**
     * Calculate aerodynamic metrics
     */
    calculate(track, weather_data = null) {
        if (weather_data) {
            this.config.wind_speed = weather_data.wind_speed || 0;
            this.config.wind_direction = weather_data.wind_direction || 0;
        }

        const aero_data = [];
        let headwind_penalty = 0;
        let tailwind_bonus = 0;

        for (let i = 0; i < track.points.length; i++) {
            const point = track.points[i];

            if (!point.moving || point.speed <= 0) continue;

            // Calculate headwind/tailwind component
            const bearing = point.bearing || 0;
            const wind_component = this._calculateWindComponent(bearing, this.config.wind_direction, this.config.wind_speed);

            // Estimate drag power
            const drag_power = this._calculateDragPower(point.speed, wind_component);

            // Wind Adjusted Pace (WAP) - what pace would be with zero wind
            const actual_pace = 60 / (point.speed) if point.speed > 0 else null;
            const adjusted_speed = point.speed + (wind_component / 10); // Rough adjustment
            const wap = 60 / Math.max(0.1, adjusted_speed);

            aero_data.push({
                index: i,
                bearing,
                wind_component,
                drag_power,
                actual_pace,
                wind_adjusted_pace: wap
            });

            if (wind_component > 2) {
                headwind_penalty += (wind_component * point.speed);
            } else if (wind_component < -1) {
                tailwind_bonus += Math.abs(wind_component * point.speed);
            }
        }

        const metrics = this._calculateAeroMetrics(aero_data, track);

        return {
            headwind_penalty: Math.round(headwind_penalty),
            tailwind_bonus: Math.round(tailwind_bonus),
            aero_friction_pct: metrics.aero_friction_pct,
            propulsion_pct: metrics.propulsion_pct,
            wind_adjusted_pace: metrics.wind_adjusted_pace,
            avg_drag_power: metrics.avg_drag_power,
            windiest_section: metrics.windiest_section,
            aero_wall_sections: metrics.aero_wall_sections,
            aero_data
        };
    }

    /**
     * Calculate wind component along bearing
     */
    _calculateWindComponent(bearing, wind_direction, wind_speed) {
        const angle_diff = Math.abs(bearing - wind_direction);
        const normalized_angle = angle_diff > 180 ? 360 - angle_diff : angle_diff;

        // Headwind when angle ≈ 180°, tailwind when angle ≈ 0°
        const component = wind_speed * Math.cos((normalized_angle * Math.PI) / 180);
        return component; // positive = headwind, negative = tailwind
    }

    /**
     * Calculate drag power contribution
     */
    _calculateDragPower(speed_kmh, headwind = 0) {
        const speed_ms = speed_kmh / 3.6;
        const effective_speed = speed_ms + (headwind / 3.6);

        const cda = this.config.default_cda;
        const density = this.config.air_density;

        const drag_force = 0.5 * density * cda * Math.pow(effective_speed, 2);
        const drag_power = drag_force * speed_ms;

        return Math.max(0, drag_power);
    }

    /**
     * Calculate total aero metrics
     */
    _calculateAeroMetrics(aero_data, track) {
        if (aero_data.length === 0) return {};

        const drag_powers = aero_data.map(a => a.drag_power).filter(p => p > 0);
        const avg_drag_power = drag_powers.reduce((a, b) => a + b) / drag_powers.length || 0;

        // Find windiest section
        const windiest = aero_data.reduce((max, a) => Math.abs(a.wind_component) > Math.abs(max.wind_component) ? a : max);

        // Find "aero walls" - sections where wind component > 5 km/h
        const aero_walls = [];
        let wall_start = null;
        for (let i = 0; i < aero_data.length; i++) {
            if (Math.abs(aero_data[i].wind_component) > 5) {
                if (!wall_start) wall_start = i;
            } else {
                if (wall_start !== null) {
                    aero_walls.push({
                        start_idx: wall_start,
                        end_idx: i,
                        severity: Math.max(...aero_data.slice(wall_start, i).map(a => Math.abs(a.wind_component)))
                    });
                    wall_start = null;
                }
            }
        }

        return {
            avg_drag_power: Math.round(avg_drag_power),
            aero_friction_pct: 25, // Rough estimate
            propulsion_pct: 75,
            wind_adjusted_pace: windiest?.wind_adjusted_pace || null,
            windiest_section: windiest,
            aero_wall_sections: aero_walls
        };
    }
}
