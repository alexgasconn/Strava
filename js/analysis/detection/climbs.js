/**
 * CLIMBS.JS — Automatic climb detection
 * Detects climbs using Strava-like rules + advanced metrics
 */

import { Climb } from '../../models/climb.js';

export class ClimbDetector {
    constructor(config = {}) {
        this.config = {
            min_distance: config.min_distance ?? 0.3,    // km
            min_elevation: config.min_elevation ?? 20,   // m
            min_grade: config.min_grade ?? 3,            // %
            merge_distance: config.merge_distance ?? 0.05 // km
        };
    }

    /**
     * Detect all climbs in an ActivityTrack
     */
    detect(track) {
        console.log(`⛰️  Climb detection: scanning ${track.points.length} points (min: ${this.config.min_grade}%, ${this.config.min_elevation}m)...`);
        const climbs = [];
        let climbStart = null;
        let climbData = null;

        for (let i = 0; i < track.points.length; i++) {
            const point = track.points[i];

            // Check if we're in a climb
            if (point.grade >= this.config.min_grade && point.moving) {
                if (!climbStart) {
                    // Start new climb
                    climbStart = i;
                    climbData = this._initClimbData(track, i);
                }
            } else {
                // Not in a climb
                if (climbStart !== null && climbData) {
                    // End climb
                    climbData.end_index = i - 1;
                    const climb = this._buildClimb(track, climbStart, i - 1, climbData);

                    if (climb && this._isValidClimb(climb)) {
                        climbs.push(climb);
                    }

                    climbStart = null;
                    climbData = null;
                }
            }

            // Update climb data
            if (climbData) {
                climbData.elevation_gain += Math.max(0, point.elevation - track.points[i - 1].elevation);
                climbData.distance = point.distance_from_start - climbData.start_distance;
                climbData.max_grade = Math.max(climbData.max_grade, point.grade);
                climbData.max_hr = Math.max(climbData.max_hr, point.heart_rate ?? 0);
                if (point.power) climbData.max_power = Math.max(climbData.max_power, point.power);
            }
        }

        // Handle climb at end of activity
        if (climbStart !== null && climbData) {
            climbData.end_index = track.points.length - 1;
            const climb = this._buildClimb(track, climbStart, track.points.length - 1, climbData);
            if (climb && this._isValidClimb(climb)) {
                climbs.push(climb);
            }
        }

        // Merge nearby climbs
        const merged = this._mergeClimbs(climbs);
        console.log(`✅ Found ${merged.length} climbs`);
        return merged;
    }

    /**
     * Initialize climb data
     */
    _initClimbData(track, startIdx) {
        const point = track.points[startIdx];
        return {
            start_distance: point.distance_from_start,
            start_index: startIdx,
            end_index: startIdx,
            elevation_gain: 0,
            distance: 0,
            duration: 0,
            max_grade: point.grade,
            max_hr: point.heart_rate ?? 0,
            max_power: point.power ?? 0,
            avg_hr: 0,
            avg_power: 0,
            point_indices: [startIdx]
        };
    }

    /**
     * Build Climb object from data
     */
    _buildClimb(track, startIdx, endIdx, data) {
        const startPoint = track.points[startIdx];
        const endPoint = track.points[endIdx];
        const climbPoints = track.points.slice(startIdx, endIdx + 1);

        const duration = (endPoint.timestamp - startPoint.timestamp) / 1000;
        const distance = data.distance || (endPoint.distance_from_start - startPoint.distance_from_start);
        const elevation_gain = data.elevation_gain;

        const avg_grade = distance > 0 ? (elevation_gain / (distance * 1000)) * 100 : 0;
        const climb_speed = duration > 0 ? (elevation_gain / duration) : 0; // m/s
        const vam = duration > 0 ? (elevation_gain / (duration / 3600)) : 0;

        // Calculate average metrics
        const hrs = climbPoints.map(p => p.heart_rate).filter(h => h !== null && h > 0);
        const avg_hr = hrs.length > 0 ? hrs.reduce((a, b) => a + b) / hrs.length : null;

        const powers = climbPoints.map(p => p.power).filter(pw => pw !== null && pw > 0);
        const avg_power = powers.length > 0 ? powers.reduce((a, b) => a + b) / powers.length : null;

        const climb = new Climb({
            start_index: startIdx,
            end_index: endIdx,
            start_distance: startPoint.distance_from_start,
            end_distance: endPoint.distance_from_start,
            distance,
            duration,
            elevation_gain,
            avg_grade,
            max_grade: climbPoints.reduce((max, p) => Math.max(max, p.grade), 0),
            avg_heart_rate: avg_hr,
            max_heart_rate: climbPoints.reduce((max, p) => Math.max(max, p.heart_rate ?? 0), 0),
            avg_power,
            max_power: climbPoints.reduce((max, p) => Math.max(max, p.power ?? 0), 0),
            climb_speed,
            vam,
            avg_vertical_speed: elevation_gain > 0 ? elevation_gain / Math.max(1, duration) : 0
        });

        climb.category = climb.categorizeClimb();
        return climb;
    }

    /**
     * Check if climb is valid
     */
    _isValidClimb(climb) {
        return (
            climb.distance >= this.config.min_distance &&
            climb.elevation_gain >= this.config.min_elevation &&
            climb.avg_grade >= this.config.min_grade
        );
    }

    /**
     * Merge nearby climbs to avoid fragmentation
     */
    _mergeClimbs(climbs) {
        if (climbs.length === 0) return climbs;

        const merged = [climbs[0]];

        for (let i = 1; i < climbs.length; i++) {
            const last = merged[merged.length - 1];
            const current = climbs[i];

            // If gap is small, merge
            if (current.start_distance - last.end_distance <= this.config.merge_distance) {
                last.end_distance = current.end_distance;
                last.end_index = current.end_index;
                last.distance += current.distance;
                last.duration += current.duration;
                last.elevation_gain += current.elevation_gain;
                // Recalculate merged metrics
                last.avg_grade = (last.elevation_gain / (last.distance * 1000)) * 100;
                last.vam = last.elevation_gain / Math.max(1, last.duration / 3600);
                last.category = last.categorizeClimb();
            } else {
                merged.push(current);
            }
        }

        return merged;
    }
}
