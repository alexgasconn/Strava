/**
 * STOPS.JS — Detect stops/pauses during activity
 */

export class StopDetector {
    constructor(config = {}) {
        this.config = {
            speed_threshold: config.speed_threshold ?? 0.5, // km/h
            min_duration: config.min_duration ?? 5 // seconds
        };
    }

    /**
     * Detect all stops in an ActivityTrack
     */
    detect(track) {
        const stops = [];
        let stopStart = null;
        let stopDuration = 0;

        for (let i = 0; i < track.points.length; i++) {
            const point = track.points[i];
            const isStopped = point.speed < this.config.speed_threshold && !point.moving;

            if (isStopped) {
                if (stopStart === null) {
                    stopStart = i;
                    stopDuration = 0;
                }
                stopDuration += point.delta_time;
            } else {
                if (stopStart !== null) {
                    if (stopDuration >= this.config.min_duration) {
                        const stop = {
                            start_index: stopStart,
                            end_index: i - 1,
                            start_distance: track.points[stopStart].distance_from_start,
                            end_distance: track.points[i - 1].distance_from_start,
                            duration: stopDuration,
                            start_time: track.points[stopStart].timestamp,
                            end_time: track.points[i - 1].timestamp,
                            latitude: track.points[stopStart].latitude,
                            longitude: track.points[stopStart].longitude
                        };
                        stops.push(stop);
                    }
                    stopStart = null;
                    stopDuration = 0;
                }
            }
        }

        // Handle stop at end of activity
        if (stopStart !== null && stopDuration >= this.config.min_duration) {
            const stop = {
                start_index: stopStart,
                end_index: track.points.length - 1,
                start_distance: track.points[stopStart].distance_from_start,
                end_distance: track.points[track.points.length - 1].distance_from_start,
                duration: stopDuration,
                start_time: track.points[stopStart].timestamp,
                end_time: track.points[track.points.length - 1].timestamp,
                latitude: track.points[stopStart].latitude,
                longitude: track.points[stopStart].longitude
            };
            stops.push(stop);
        }

        return stops;
    }

    /**
     * Get stop statistics
     */
    getStats(stops) {
        if (stops.length === 0) {
            return {
                count: 0,
                total_time: 0,
                avg_duration: 0,
                longest: 0
            };
        }

        const total_time = stops.reduce((sum, s) => sum + s.duration, 0);
        const durations = stops.map(s => s.duration);

        return {
            count: stops.length,
            total_time,
            avg_duration: total_time / stops.length,
            longest: Math.max(...durations),
            shortest: Math.min(...durations)
        };
    }
}
