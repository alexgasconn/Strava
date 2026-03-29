/**
 * INSIGHTS_GENERATOR.JS — Generate automatic insights from analysis results
 */

export class InsightsGenerator {
    /**
     * Generate all insights from complete analysis
     */
    static generate(analysis_result, track, sport_type) {
        console.log(`💡 Generating automatic insights...`);
        const insights = [];

        // Basic activity insights
        insights.push(...this._generateBasicInsights(analysis_result));

        // Performance insights
        insights.push(...this._generatePerformanceInsights(analysis_result, sport_type));

        // Elevation insights
        insights.push(...this._generateElevationInsights(analysis_result));

        // Fatigue insights
        if (analysis_result.fatigue_detected) {
            insights.push(...this._generateFatigueInsights(analysis_result));
        }

        // Pace/Speed insights
        insights.push(...this._generatePaceInsights(analysis_result, sport_type));

        // Power insights (cycling)
        if (analysis_result.power_avg) {
            insights.push(...this._generatePowerInsights(analysis_result));
        }

        // HR insights
        if (analysis_result.hr_avg) {
            insights.push(...this._generateHRInsights(analysis_result));
        }

        // Climb insights
        if (analysis_result.climbs && analysis_result.climbs.length > 0) {
            insights.push(...this._generateClimbInsights(analysis_result));
        }

        // Efficiency insights
        insights.push(...this._generateEfficiencyInsights(analysis_result));

        console.log(`✅ Generated ${insights.length} insights`);
        return insights;
    }

    /**
     * Generate basic activity insights
     */
    static _generateBasicInsights(result) {
        const insights = [];

        insights.push(`Completed ${result.distance_total.toFixed(2)} km in ${this._formatTime(result.time_moving)}`);

        const speed_avg = result.speed_avg;
        if (speed_avg < 10) {
            insights.push(`Average speed was ${speed_avg.toFixed(1)} km/h`);
        } else if (speed_avg > 30) {
            insights.push(`Quick pace! Average speed was ${speed_avg.toFixed(1)} km/h`);
        }

        if (result.elevation_gain > 500) {
            insights.push(`Significant climbing: ${result.elevation_gain}m of elevation gain`);
        }

        return insights;
    }

    /**
     * Generate performance insights
     */
    static _generatePerformanceInsights(result, sport_type) {
        const insights = [];
        const sport = (sport_type || '').toLowerCase();

        if (sport.includes('run') && result.pace_avg) {
            const pace_str = `${result.pace_avg.minutes}:${result.pace_avg.seconds.toString().padStart(2, '0')}/km`;
            insights.push(`Average pace: ${pace_str}`);

            if (result.pace_fastest_km) {
                const fastest = `${result.pace_fastest_km.minutes}:${result.pace_fastest_km.seconds.toString().padStart(2, '0')}/km`;
                const slowest = `${result.pace_slowest_km.minutes}:${result.pace_slowest_km.seconds.toString().padStart(2, '0')}/km`;
                insights.push(`Fastest km: ${fastest}, Slowest: ${slowest}`);
            }
        }

        return insights;
    }

    /**
     * Generate elevation insights
     */
    static _generateElevationInsights(result) {
        const insights = [];

        if (result.elevation_gain > 200) {
            const gain_per_km = result.elevation_gain / result.distance_total;
            insights.push(`Elevation gain of ${result.elevation_gain}m (${gain_per_km.toFixed(1)}m/km average gradient)`);
        }

        return insights;
    }

    /**
     * Generate fatigue insights
     */
    static _generateFatigueInsights(result) {
        const insights = [];

        if (result.fatigue_detected) {
            if (result.fatigue_onset_distance) {
                insights.push(`⚠️ Fatigue detected at km ${result.fatigue_onset_distance.toFixed(1)}`);
            }

            const fatigue_severity = result.fatigue_severity;
            if (fatigue_severity > 0.75) {
                insights.push(`Severe fatigue impact detected during the activity`);
            } else if (fatigue_severity > 0.5) {
                insights.push(`Moderate fatigue indicators observed`);
            }
        }

        return insights;
    }

    /**
     * Generate pace insights
     */
    static _generatePaceInsights(result, sport_type) {
        const insights = [];
        const sport = (sport_type || '').toLowerCase();

        if (sport.includes('trail') && result.sport_analysis?.gap_avg) {
            insights.push(`Grade-adjusted pace (GAP) average: ${result.sport_analysis.gap_avg.minutes}:${result.sport_analysis.gap_avg.seconds.toString().padStart(2, '0')}/km`);
        }

        return insights;
    }

    /**
     * Generate power insights
     */
    static _generatePowerInsights(result) {
        const insights = [];

        insights.push(`Average power: ${Math.round(result.power_avg)}W`);

        if (result.power_normalized) {
            insights.push(`Normalized power: ${Math.round(result.power_normalized)}W`);
        }

        if (result.tss) {
            insights.push(`Training Stress Score (TSS): ${result.tss}`);
        }

        if (result.sport_analysis?.vam) {
            insights.push(`Best VAM on climbs: ${Math.round(result.sport_analysis.vam.max)} m/h`);
        }

        return insights;
    }

    /**
     * Generate HR insights
     */
    static _generateHRInsights(result) {
        const insights = [];

        insights.push(`Average heart rate: ${Math.round(result.hr_avg)} bpm (max ${result.hr_max} bpm)`);

        if (result.hr_drift && Math.abs(result.hr_drift) > 5) {
            if (result.hr_drift > 0) {
                insights.push(`Heart rate drift: +${result.hr_drift}% (signs of fatigue)`);
            } else {
                insights.push(`Negative HR drift: good pacing stability`);
            }
        }

        return insights;
    }

    /**
     * Generate climb insights
     */
    static _generateClimbInsights(result) {
        const insights = [];

        const climbs = result.climbs;
        if (climbs.length > 0) {
            const hardest = climbs.reduce((max, c) => c.avg_grade > max.avg_grade ? c : max);
            insights.push(`Hardest climb: ${hardest.distance.toFixed(2)}km at ${hardest.avg_grade.toFixed(1)}%`);

            const vams = climbs.map(c => c.vam).filter(v => v > 0);
            if (vams.length > 0) {
                const best_vam = Math.max(...vams);
                insights.push(`Best VAM: ${Math.round(best_vam)} m/h`);
            }
        }

        return insights;
    }

    /**
     * Generate efficiency insights
     */
    static _generateEfficiencyInsights(result) {
        const insights = [];

        if (result.sport_analysis?.cadence_efficiency) {
            const cadence = result.sport_analysis.cadence_efficiency;
            insights.push(`Cadence stability: ${cadence.stability_score}% (${cadence.consistency})`);
        }

        return insights;
    }

    /**
     * Format time in readable format
     */
    static _formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.round(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        }
        return `${secs}s`;
    }
}
