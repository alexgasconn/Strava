/**
 * ANALYSIS_RESULT.JS — Complete analysis output for a single activity
 */

export class AnalysisResult {
    constructor(data = {}) {
        // Metadata
        this.activity_id = data.activity_id ?? null;
        this.sport_type = data.sport_type ?? 'unknown';
        this.timestamp_generated = data.timestamp_generated ?? new Date().toISOString();
        
        // Core metrics (all sports)
        this.distance_total = data.distance_total ?? 0;
        this.distance_moving = data.distance_moving ?? 0;
        this.time_total = data.time_total ?? 0;
        this.time_moving = data.time_moving ?? 0;
        this.time_stopped = data.time_stopped ?? 0;
        
        // Elevation
        this.elevation_gain = data.elevation_gain ?? 0;
        this.elevation_loss = data.elevation_loss ?? 0;
        this.elevation_max = data.elevation_max ?? 0;
        this.elevation_min = data.elevation_min ?? 0;
        
        // Speed
        this.speed_avg = data.speed_avg ?? 0;
        this.speed_max = data.speed_max ?? 0;
        this.speed_min = data.speed_min ?? 0;
        
        // Pace (for running/hiking)
        this.pace_avg = data.pace_avg ?? null;
        this.pace_fastest_km = data.pace_fastest_km ?? null;
        this.pace_slowest_km = data.pace_slowest_km ?? null;
        
        // Heart rate
        this.hr_avg = data.hr_avg ?? null;
        this.hr_max = data.hr_max ?? null;
        this.hr_min = data.hr_min ?? null;
        this.hr_zones = data.hr_zones ?? null;           // {Z1: %, Z2: %, ...}
        this.hr_drift = data.hr_drift ?? null;           // % increase over time
        
        // Power (cycling)
        this.power_avg = data.power_avg ?? null;
        this.power_max = data.power_max ?? null;
        this.power_normalized = data.power_normalized ?? null;
        this.power_zones = data.power_zones ?? null;
        this.tss = data.tss ?? null;
        this.if_intensity_factor = data.if_intensity_factor ?? null;
        
        // Cadence
        this.cadence_avg = data.cadence_avg ?? null;
        this.cadence_max = data.cadence_max ?? null;
        
        // Detected features
        this.climbs = data.climbs ?? [];                  // Climb[]
        this.segments = data.segments ?? [];              // Segment[]
        this.stops = data.stops ?? [];                    // Stop[]
        this.intervals = data.intervals ?? [];            // Interval[]
        
        // Sport-specific results
        this.sport_analysis = data.sport_analysis ?? {}; // RunningAnalysis, CyclingAnalysis, etc.
        
        // Advanced analysis
        this.fatigue_detected = data.fatigue_detected ?? false;
        this.fatigue_data = data.fatigue_data ?? null;
        this.aero_data = data.aero_data ?? null;         // {headwind, tailwind, drag, wap}
        this.terrain_data = data.terrain_data ?? null;   // {roughness, technical_score}
        
        // Insights
        this.insights = data.insights ?? [];              // String[]
        this.highlights = data.highlights ?? [];          // {type, value, description}
        
        // Meta
        this.processing_time_ms = data.processing_time_ms ?? 0;
        this.analysis_version = data.analysis_version ?? '1.0';
    }

    /**
     * Add an insight
     */
    addInsight(insight) {
        this.insights.push(insight);
    }

    /**
     * Add a highlight
     */
    addHighlight(type, value, description) {
        this.highlights.push({ type, value, description });
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return { ...this };
    }

    /**
     * Export for frontend
     */
    toFrontend() {
        return {
            metadata: {
                activity_id: this.activity_id,
                sport_type: this.sport_type,
                timestamp: this.timestamp_generated
            },
            summary: {
                distance: this.distance_total,
                time: this.time_total,
                elevation_gain: this.elevation_gain,
                elevation_loss: this.elevation_loss,
                avg_speed: this.speed_avg,
                max_speed: this.speed_max,
                avg_hr: this.hr_avg,
                max_hr: this.hr_max,
                avg_pace: this.pace_avg,
                avg_power: this.power_avg,
                avg_cadence: this.cadence_avg,
                tss: this.tss
            },
            detailed: {
                climbs: this.climbs,
                segments: this.segments,
                stops: this.stops,
                sport_analysis: this.sport_analysis,
                fatigue: this.fatigue_data,
                aero: this.aero_data,
                terrain: this.terrain_data
            },
            insights: this.insights,
            highlights: this.highlights
        };
    }
}
