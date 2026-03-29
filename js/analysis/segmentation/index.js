/**
 * SEGMENTATION INDEX.JS — Intelligent activity segmentation
 */

import { Segment } from '../../models/segment.js';

export class SegmentationEngine {
    constructor(config = {}) {
        this.config = {
            distance_segment_km: config.distance_segment_km ?? 1,
            time_segment_min: config.time_segment_min ?? 5,
            terrain_segment_distance: config.terrain_segment_distance ?? 0.1
        };
    }

    /**
     * Create all segment types for an activity
     */
    segment(track) {
        return {
            distance_segments: this._createDistanceSegments(track),
            time_segments: this._createTimeSegments(track),
            terrain_segments: this._createTerrainSegments(track)
        };
    }

    /**
     * Create fixed-distance segments (e.g., 1km splits)
     */
    _createDistanceSegments(track) {
        const segments = [];
        const segmentDistance = this.config.distance_segment_km;
        const maxDistance = track.getTotalDistance();

        for (let i = 0; i < maxDistance; i += segmentDistance) {
            const startKm = i;
            const endKm = i + segmentDistance;
            const pointsInSegment = track.getPointsByDistance(startKm, endKm);

            if (pointsInSegment.length < 2) continue;

            const segment = this._buildSegment(track, pointsInSegment, 'distance');
            segment.name = `${(startKm).toFixed(1)}-${(endKm).toFixed(1)} km`;
            segments.push(segment);
        }

        return segments;
    }

    /**
     * Create fixed-time segments (e.g., 5-minute splits)
     */
    _createTimeSegments(track) {
        const segments = [];
        const segmentMinutes = this.config.time_segment_min;
        const segmentSeconds = segmentMinutes * 60;
        const maxTime = (track.points[track.points.length - 1].timestamp - 
                        track.points[0].timestamp) / 1000;

        for (let i = 0; i < maxTime; i += segmentSeconds) {
            const startSec = i;
            const endSec = i + segmentSeconds;
            const pointsInSegment = track.getPointsByTime(startSec, endSec);

            if (pointsInSegment.length < 2) continue;

            const segment = this._buildSegment(track, pointsInSegment, 'time');
            const startMin = Math.floor(startSec / 60);
            const endMin = Math.floor(endSec / 60);
            segment.name = `${startMin}-${endMin} min`;
            segments.push(segment);
        }

        return segments;
    }

    /**
     * Create terrain-based segments
     */
    _createTerrainSegments(track) {
        const segments = [];
        let currentSegmentStart = 0;
        let currentTerrain = track.points[0].terrain_type;

        for (let i = 1; i < track.points.length; i++) {
            const point = track.points[i];
            const prevPoint = track.points[i - 1];

            // Check if terrain changed
            if (point.terrain_type !== currentTerrain || 
                point.distance_from_start - prevPoint.distance_from_start > this.config.terrain_segment_distance) {
                
                // End current segment
                const pointsInSegment = track.points.slice(currentSegmentStart, i);
                if (pointsInSegment.length > 0) {
                    const segment = this._buildSegment(track, pointsInSegment, 'terrain');
                    segment.terrain_type = currentTerrain;
                    segment.name = this._getTerrainName(currentTerrain);
                    segments.push(segment);
                }

                currentSegmentStart = i;
                currentTerrain = point.terrain_type;
            }
        }

        // Handle last segment
        if (currentSegmentStart < track.points.length) {
            const pointsInSegment = track.points.slice(currentSegmentStart);
            if (pointsInSegment.length > 0) {
                const segment = this._buildSegment(track, pointsInSegment, 'terrain');
                segment.terrain_type = currentTerrain;
                segment.name = this._getTerrainName(currentTerrain);
                segments.push(segment);
            }
        }

        return segments;
    }

    /**
     * Build segment from track points
     */
    _buildSegment(track, points, type) {
        if (points.length === 0) return null;

        const startPoint = points[0];
        const endPoint = points[points.length - 1];

        // Calculate metrics
        const avgSpeed = this._calculateAverage(points, 'speed');
        const maxSpeed = Math.max(...points.map(p => p.speed));
        const avgHR = this._calculateAverage(points.filter(p => p.heart_rate), 'heart_rate');
        const maxHR = Math.max(...points.map(p => p.heart_rate ?? 0));
        const avgPower = this._calculateAverage(points.filter(p => p.power), 'power');
        const maxPower = Math.max(...points.map(p => p.power ?? 0));
        const avgCadence = this._calculateAverage(points.filter(p => p.cadence), 'cadence');
        const avgGrade = this._calculateAverage(points, 'grade');

        const elevGain = endPoint.vertical_gain - startPoint.vertical_gain;
        const elevLoss = endPoint.vertical_loss - startPoint.vertical_loss;

        const duration = (endPoint.timestamp - startPoint.timestamp) / 1000;
        const distance = endPoint.distance_from_start - startPoint.distance_from_start;

        const segment = new Segment({
            type,
            start_index: track.points.indexOf(startPoint),
            end_index: track.points.indexOf(endPoint),
            start_distance: startPoint.distance_from_start,
            end_distance: endPoint.distance_from_start,
            distance,
            duration,
            elevation_gain: elevGain,
            elevation_loss: elevLoss,
            min_elevation: Math.min(...points.map(p => p.elevation ?? 0)),
            max_elevation: Math.max(...points.map(p => p.elevation ?? 0)),
            avg_speed: avgSpeed,
            max_speed: maxSpeed,
            avg_heart_rate: avgHR,
            max_heart_rate: maxHR,
            avg_power: avgPower,
            max_power: maxPower,
            avg_cadence: avgCadence,
            avg_grade: avgGrade,
            max_grade: Math.max(...points.map(p => p.grade)),
            terrain_type: points[0].terrain_type
        });

        // Calculate VAM if climbing
        if (elevGain > 0 && duration > 0) {
            segment.vam = (elevGain / (duration / 3600));
        }

        return segment;
    }

    /**
     * Calculate average of a property
     */
    _calculateAverage(points, property) {
        const values = points.map(p => p[property]).filter(v => v !== null && !isNaN(v));
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b) / values.length;
    }

    /**
     * Get human-readable terrain name
     */
    _getTerrainName(terrain) {
        const names = {
            'flat': 'Flat',
            'climb': 'Climb',
            'descent': 'Descent',
            'technical': 'Technical'
        };
        return names[terrain] || terrain;
    }
}
