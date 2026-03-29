/**
 * EXPORT - CSV.JS — Export track data to CSV format
 */

export class CSVExporter {
    /**
     * Convert ActivityTrack to CSV string
     */
    static export(track) {
        if (!track.points || track.points.length === 0) {
            throw new Error('No track points to export');
        }

        const headers = [
            'timestamp',
            'distance_km',
            'latitude',
            'longitude',
            'elevation_m',
            'speed_kmh',
            'pace_min_km',
            'grade_pct',
            'heart_rate_bpm',
            'cadence_rpm',
            'power_watts',
            'temperature_c',
            'vertical_gain_m',
            'vertical_loss_m',
            'vertical_speed_ms',
            'bearing_deg',
            'acceleration_ms2',
            'moving'
        ];

        let csv = headers.join(',') + '\n';

        for (const point of track.points) {
            const row = [
                new Date(point.timestamp).toISOString(),
                point.distance_from_start.toFixed(3),
                point.latitude?.toFixed(6) || '',
                point.longitude?.toFixed(6) || '',
                point.elevation?.toFixed(2) || '',
                point.speed?.toFixed(2) || '',
                point.pace ? `${point.pace.minutes}:${point.pace.seconds.toString().padStart(2, '0')}` : '',
                point.grade?.toFixed(2) || '',
                point.heart_rate || '',
                point.cadence || '',
                point.power || '',
                point.temperature?.toFixed(1) || '',
                point.vertical_gain?.toFixed(2) || '',
                point.vertical_loss?.toFixed(2) || '',
                point.vertical_speed?.toFixed(3) || '',
                point.bearing?.toFixed(1) || '',
                point.acceleration?.toFixed(3) || '',
                point.moving ? 'true' : 'false'
            ];

            csv += row.map(cell => {
                // Escape cells containing commas or quotes
                if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',') + '\n';
        }

        return csv;
    }

    /**
     * Download CSV as file
     */
    static download(track, filename = 'activity-track.csv') {
        const csv = this.export(track);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
