/**
 * VIRTUAL_GPX.JS — Reconstruct virtual GPX from Strava API streams
 * Core engine: converts raw streams into an ActivityTrack structure
 */

import { ActivityTrack } from '../models/activity-track.js';
import { TrackPoint } from '../models/track-point.js';

export class VirtualGPXReconstructor {
    /**
     * Reconstruct virtual GPX from Strava metadata + streams
     * 
     * @param {Object} metadata - Activity metadata from Strava API
     * @param {Object} streams - Streams object from Strava API
     * @returns {ActivityTrack} 
     */
    static reconstruct(metadata, streams) {
        if (!streams || !streams.latlng) {
            throw new Error('latlng stream is required to reconstruct GPX');
        }

        console.log(`📍 Reconstructing GPX from ${streams.latlng.data.length} points...`);
        const points = this._buildTrackPoints(streams, metadata);
        const track = new ActivityTrack(metadata, points);
        console.log(`✅ GPX reconstructed: ${points.length} TrackPoints with bearing, VAM, acceleration calculated`);
        return track;
    }

    /**
     * Convert raw streams to TrackPoint array
     */
    static _buildTrackPoints(streams, metadata) {
        const latlng = streams.latlng?.data ?? [];
        const time = streams.time?.data ?? [];
        const distance = streams.distance?.data ?? [];
        const altitude = streams.altitude?.data ?? [];
        const velocity_smooth = streams.velocity_smooth?.data ?? [];
        const grade_smooth = streams.grade_smooth?.data ?? [];
        const heartrate = streams.heartrate?.data ?? [];
        const cadence = streams.cadence?.data ?? [];
        const watts = streams.watts?.data ?? [];
        const temperature = streams.temperature?.data ?? [];
        const moving = streams.moving?.data ?? [];

        if (latlng.length === 0) return [];

        const points = [];
        const startTime = new Date(metadata.start_date).getTime();

        for (let i = 0; i < latlng.length; i++) {
            const [lat, lon] = latlng[i];
            const timestamp = startTime + (time[i] ?? 0) * 1000;
            const dist = distance[i] ?? 0;
            const elev = altitude[i] ?? 0;
            const speed = (velocity_smooth[i] ?? 0) * 3.6; // convert m/s to km/h
            const grade = grade_smooth[i] ?? 0;
            const hr = heartrate[i] ?? null;
            const cad = cadence[i] ?? null;
            const pwr = watts[i] ?? null;
            const temp = temperature[i] ?? null;
            const is_moving = moving[i] !== false;

            const point = new TrackPoint({
                index: i,
                timestamp,
                latitude: lat,
                longitude: lon,
                elevation: elev,
                distance_from_start: dist / 1000, // Strava returns in meters
                speed,
                grade,
                heart_rate: hr,
                cadence: cad,
                power: pwr,
                temperature: temp,
                moving: is_moving
            });

            // Calculate delta values
            if (i > 0) {
                const prevPoint = points[i - 1];
                point.delta_distance = (dist - distance[i - 1]) / 1000;
                point.delta_time = time[i] - time[i - 1];

                // Bearing (direction)
                point.bearing = this._calculateBearing(
                    prevPoint.latitude,
                    prevPoint.longitude,
                    lat,
                    lon
                );

                // Acceleration (m/s²)
                if (point.delta_time > 0) {
                    const prevSpeed = (velocity_smooth[i - 1] ?? 0);
                    const currSpeed = (velocity_smooth[i] ?? 0);
                    point.acceleration = (currSpeed - prevSpeed) / point.delta_time;
                }

                // Vertical metrics
                const elevDiff = elev - prevPoint.elevation;
                if (elevDiff > 0) {
                    point.vertical_gain = prevPoint.vertical_gain + elevDiff;
                    point.vertical_loss = prevPoint.vertical_loss;
                } else {
                    point.vertical_gain = prevPoint.vertical_gain;
                    point.vertical_loss = prevPoint.vertical_loss + Math.abs(elevDiff);
                }

                // Vertical speed (m/s)
                if (point.delta_time > 0) {
                    point.vertical_speed = elevDiff / point.delta_time;
                }
            } else {
                point.delta_distance = 0;
                point.delta_time = 0;
                point.vertical_gain = 0;
                point.vertical_loss = 0;
                point.vertical_speed = 0;
            }

            // Pace
            point.pace = point.calculatePace();

            points.push(point);
        }

        return points;
    }

    /**
     * Calculate bearing between two points (degrees 0-360)
     */
    static _calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = lon2 - lon1;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const bearing = Math.atan2(y, x) * (180 / Math.PI);
        return (bearing + 360) % 360;
    }

    /**
     * Get stream statistics for validation
     */
    static getStreamStats(streams) {
        return {
            latlng: streams.latlng?.data?.length ?? 0,
            time: streams.time?.data?.length ?? 0,
            distance: streams.distance?.data?.length ?? 0,
            altitude: streams.altitude?.data?.length ?? 0,
            velocity: streams.velocity_smooth?.data?.length ?? 0,
            heartrate: streams.heartrate?.data?.length ?? 0,
            cadence: streams.cadence?.data?.length ?? 0,
            watts: streams.watts?.data?.length ?? 0,
            temperature: streams.temperature?.data?.length ?? 0,
            moving: streams.moving?.data?.length ?? 0
        };
    }
}
