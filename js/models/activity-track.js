/**
 * ACTIVITY_TRACK.JS — Container for reconstructed virtual GPX
 * Represents entire activity as ordered array of TrackPoints
 */

import { TrackPoint } from './track-point.js';

export class ActivityTrack {
    constructor(metadata = {}, points = []) {
        // Metadata from Strava API
        this.activity_id = metadata.activity_id ?? null;
        this.name = metadata.name ?? 'Untitled Activity';
        this.sport_type = metadata.sport_type ?? 'unknown';  // Run, Ride, Swim, etc.
        this.start_date = metadata.start_date ?? null;       // ISO string
        this.timezone = metadata.timezone ?? 'UTC';
        this.elapsed_time = metadata.elapsed_time ?? 0;      // seconds
        this.moving_time = metadata.moving_time ?? 0;
        this.total_elevation_gain = metadata.total_elevation_gain ?? 0;
        this.average_speed = metadata.average_speed ?? 0;    // km/h
        this.max_speed = metadata.max_speed ?? 0;
        this.average_heartrate = metadata.average_heartrate ?? null;
        this.max_heartrate = metadata.max_heartrate ?? null;
        this.average_watts = metadata.average_watts ?? null;
        this.weighted_average_watts = metadata.weighted_average_watts ?? null;
        this.start_latlng = metadata.start_latlng ?? null;   // [lat, lon]
        this.end_latlng = metadata.end_latlng ?? null;
        
        // Track points (ordered chronologically)
        this.points = points.map(p => p instanceof TrackPoint ? p : new TrackPoint(p));
    }

    /**
     * Get total track distance in km
     */
    getTotalDistance() {
        if (this.points.length === 0) return 0;
        return this.points[this.points.length - 1].distance_from_start;
    }

    /**
     * Get track bounds [min_lat, min_lon, max_lat, max_lon]
     */
    getBounds() {
        if (this.points.length === 0) return null;
        
        let minLat = Infinity, minLon = Infinity;
        let maxLat = -Infinity, maxLon = -Infinity;
        
        this.points.forEach(p => {
            if (p.latitude !== null && p.longitude !== null) {
                minLat = Math.min(minLat, p.latitude);
                maxLat = Math.max(maxLat, p.latitude);
                minLon = Math.min(minLon, p.longitude);
                maxLon = Math.max(maxLon, p.longitude);
            }
        });
        
        return [minLat, minLon, maxLat, maxLon];
    }

    /**
     * Get elevation statistics
     */
    getElevationStats() {
        const elevations = this.points
            .map(p => p.elevation)
            .filter(e => e !== null && !isNaN(e));
        
        if (elevations.length === 0) {
            return { min: 0, max: 0, gain: 0, loss: 0 };
        }
        
        return {
            min: Math.min(...elevations),
            max: Math.max(...elevations),
            gain: this.points[this.points.length - 1].vertical_gain,
            loss: this.points[this.points.length - 1].vertical_loss
        };
    }

    /**
     * Get speed statistics
     */
    getSpeedStats() {
        const speeds = this.points
            .filter(p => p.moving && p.speed > 0)
            .map(p => p.speed);
        
        if (speeds.length === 0) {
            return { avg: 0, max: 0, min: 0 };
        }
        
        const sorted = [...speeds].sort((a, b) => a - b);
        return {
            avg: speeds.reduce((a, b) => a + b) / speeds.length,
            max: Math.max(...speeds),
            min: Math.min(...speeds),
            median: sorted[Math.floor(sorted.length / 2)]
        };
    }

    /**
     * Get HR statistics
     */
    getHeartRateStats() {
        const hrs = this.points
            .map(p => p.heart_rate)
            .filter(h => h !== null && !isNaN(h) && h > 0);
        
        if (hrs.length === 0) {
            return { avg: 0, max: 0, min: 0, samples: 0 };
        }
        
        return {
            avg: hrs.reduce((a, b) => a + b) / hrs.length,
            max: Math.max(...hrs),
            min: Math.min(...hrs),
            samples: hrs.length
        };
    }

    /**
     * Get power statistics
     */
    getPowerStats() {
        const powers = this.points
            .map(p => p.power)
            .filter(pw => pw !== null && !isNaN(pw) && pw > 0);
        
        if (powers.length === 0) {
            return { avg: 0, max: 0, min: 0, samples: 0 };
        }
        
        return {
            avg: powers.reduce((a, b) => a + b) / powers.length,
            max: Math.max(...powers),
            min: Math.min(...powers),
            samples: powers.length
        };
    }

    /**
     * Get all points within distance range [km]
     */
    getPointsByDistance(startKm, endKm) {
        return this.points.filter(p => 
            p.distance_from_start >= startKm && 
            p.distance_from_start <= endKm
        );
    }

    /**
     * Get points in time window
     */
    getPointsByTime(startSec, endSec) {
        if (!this.points.length) return [];
        const startTime = this.points[0].timestamp + startSec * 1000;
        const endTime = this.points[0].timestamp + endSec * 1000;
        return this.points.filter(p => p.timestamp >= startTime && p.timestamp <= endTime);
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            metadata: {
                activity_id: this.activity_id,
                name: this.name,
                sport_type: this.sport_type,
                start_date: this.start_date,
                timezone: this.timezone,
                elapsed_time: this.elapsed_time,
                moving_time: this.moving_time,
                total_elevation_gain: this.total_elevation_gain,
                average_speed: this.average_speed,
                max_speed: this.max_speed
            },
            points: this.points.map(p => p.toJSON()),
            stats: {
                distance: this.getTotalDistance(),
                elevation: this.getElevationStats(),
                speed: this.getSpeedStats(),
                heart_rate: this.getHeartRateStats(),
                power: this.getPowerStats()
            }
        };
    }
}
