/**
 * FATIGUE.JS — Fatigue detection engine
 */

export class FatigueEngine {
    constructor(config = {}) {
        this.config = {
            pace_drop_threshold: config.pace_drop_threshold ?? 0.1, // 10% drop
            hr_rise_threshold: config.hr_rise_threshold ?? 0.05,    // 5% rise
            cadence_drop_threshold: config.cadence_drop_threshold ?? 0.08,
            power_drop_threshold: config.power_drop_threshold ?? 0.08,
            window_size: config.window_size ?? 60 // seconds
        };
    }

    /**
     * Detect fatigue indicators throughout activity
     */
    detect(track) {
        const fatigueEvents = [];
        let fatigueOnsetIndex = null;
        let severityScore = 0;

        // Analyze 10% windows
        const windowSize = Math.floor(track.points.length * 0.1);

        for (let i = windowSize; i < track.points.length; i++) {
            const firstWindow = track.points.slice(i - windowSize, i);
            const secondWindow = track.points.slice(i, Math.min(i + windowSize, track.points.length));

            if (firstWindow.length === 0 || secondWindow.length === 0) continue;

            const metrics1 = this._calculateMetrics(firstWindow);
            const metrics2 = this._calculateMetrics(secondWindow);

            const fatigueSignals = this._detectSignals(metrics1, metrics2);
            const severity = this._calculateSeverity(fatigueSignals);

            if (severity > 0.5 && !fatigueOnsetIndex) {
                fatigueOnsetIndex = i;
                severityScore = severity;
            }

            if (severity > 0.5) {
                fatigueEvents.push({
                    index: i,
                    distance: track.points[i].distance_from_start,
                    severity,
                    signals: fatigueSignals,
                    metrics1,
                    metrics2
                });
            }
        }

        return {
            fatigue_detected: fatigueEvents.length > 0,
            fatigue_onset_index: fatigueOnsetIndex,
            fatigue_onset_distance: fatigueOnsetIndex ? track.points[fatigueOnsetIndex].distance_from_start : null,
            fatigue_onset_time: fatigueOnsetIndex ? (track.points[fatigueOnsetIndex].timestamp - track.points[0].timestamp) / 1000 : null,
            fatigue_severity: severityScore,
            fatigue_events: fatigueEvents,
            fatigue_index: this._calculateFatigueIndex(fatigueEvents, track)
        };
    }

    /**
     * Calculate average metrics for a set of points
     */
    _calculateMetrics(points) {
        const paces = points.filter(p => p.pace && p.moving).map(p => p.pace.minutes + p.pace.seconds / 60);
        const hrs = points.filter(p => p.heart_rate && p.heart_rate > 0).map(p => p.heart_rate);
        const cadences = points.filter(p => p.cadence && p.cadence > 0).map(p => p.cadence);
        const powers = points.filter(p => p.power && p.power > 0).map(p => p.power);

        return {
            avg_pace: paces.length > 0 ? paces.reduce((a, b) => a + b) / paces.length : null,
            avg_hr: hrs.length > 0 ? hrs.reduce((a, b) => a + b) / hrs.length : null,
            avg_cadence: cadences.length > 0 ? cadences.reduce((a, b) => a + b) / cadences.length : null,
            avg_power: powers.length > 0 ? powers.reduce((a, b) => a + b) / powers.length : null
        };
    }

    /**
     * Detect fatigue signals
     */
    _detectSignals(metrics1, metrics2) {
        const signals = [];

        // Pace drop (slower pace = higher minutes)
        if (metrics1.avg_pace && metrics2.avg_pace) {
            const pace_change = (metrics2.avg_pace - metrics1.avg_pace) / metrics1.avg_pace;
            if (pace_change > this.config.pace_drop_threshold) {
                signals.push({ type: 'pace_drop', value: pace_change });
            }
        }

        // HR rise while pace drops
        if (metrics1.avg_hr && metrics2.avg_hr) {
            const hr_change = (metrics2.avg_hr - metrics1.avg_hr) / metrics1.avg_hr;
            if (hr_change > this.config.hr_rise_threshold) {
                signals.push({ type: 'hr_rise', value: hr_change });
            }
        }

        // Cadence drop
        if (metrics1.avg_cadence && metrics2.avg_cadence) {
            const cad_change = (metrics1.avg_cadence - metrics2.avg_cadence) / metrics1.avg_cadence;
            if (cad_change > this.config.cadence_drop_threshold) {
                signals.push({ type: 'cadence_drop', value: cad_change });
            }
        }

        // Power drop
        if (metrics1.avg_power && metrics2.avg_power) {
            const pow_change = (metrics1.avg_power - metrics2.avg_power) / metrics1.avg_power;
            if (pow_change > this.config.power_drop_threshold) {
                signals.push({ type: 'power_drop', value: pow_change });
            }
        }

        return signals;
    }

    /**
     * Calculate fatigue severity (0-1)
     */
    _calculateSeverity(signals) {
        if (signals.length === 0) return 0;
        return Math.min(1, signals.length * 0.3);
    }

    /**
     * Calculate overall fatigue index
     */
    _calculateFatigueIndex(events, track) {
        if (events.length === 0) return 0;

        const totalPoints = track.points.length;
        const eventCount = events.length;
        const avgSeverity = events.reduce((sum, e) => sum + e.severity, 0) / events.length;

        return Math.round((eventCount / totalPoints) * avgSeverity * 100);
    }
}
