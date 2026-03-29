/**
 * EXPORT - GPX.JS — Export ActivityTrack to GPX format
 */

export class GPXExporter {
    /**
     * Convert ActivityTrack to GPX XML string
     */
    static export(track, activity_name = 'Activity') {
        if (!track.points || track.points.length === 0) {
            throw new Error('No track points to export');
        }

        const points = track.points.filter(p => p.latitude && p.longitude);
        if (points.length === 0) {
            throw new Error('No valid coordinates found');
        }

        const now = new Date().toISOString();
        const startTime = new Date(points[0].timestamp).toISOString();

        let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        gpx += `<gpx version="1.1" creator="Strava Activity Intelligence"\n`;
        gpx += `     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
        gpx += `     xmlns="http://www.topografix.com/GPX/1/1"\n`;
        gpx += `     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n`;

        // Metadata
        gpx += `  <metadata>\n`;
        gpx += `    <name>${this._escapeXml(activity_name)}</name>\n`;
        gpx += `    <desc>Reconstructed from Strava Streams</desc>\n`;
        gpx += `    <time>${now}</time>\n`;
        gpx += `  </metadata>\n`;

        // Track segment
        gpx += `  <trk>\n`;
        gpx += `    <name>${this._escapeXml(activity_name)}</name>\n`;
        gpx += `    <trkseg>\n`;

        for (const point of points) {
            gpx += `      <trkpt lat="${point.latitude}" lon="${point.longitude}">\n`;

            if (point.elevation !== null) {
                gpx += `        <ele>${point.elevation.toFixed(2)}</ele>\n`;
            }

            const timestamp = new Date(point.timestamp).toISOString();
            gpx += `        <time>${timestamp}</time>\n`;

            // Extensions (custom data)
            gpx += `        <extensions>\n`;
            if (point.speed !== null) gpx += `          <speed>${point.speed.toFixed(2)}</speed>\n`;
            if (point.heart_rate !== null) gpx += `          <heartrate>${point.heart_rate}</heartrate>\n`;
            if (point.cadence !== null) gpx += `          <cadence>${point.cadence}</cadence>\n`;
            if (point.power !== null) gpx += `          <power>${point.power}</power>\n`;
            if (point.temperature !== null) gpx += `          <temperature>${point.temperature.toFixed(1)}</temperature>\n`;
            gpx += `        </extensions>\n`;

            gpx += `      </trkpt>\n`;
        }

        gpx += `    </trkseg>\n`;
        gpx += `  </trk>\n`;
        gpx += `</gpx>\n`;

        return gpx;
    }

    /**
     * Download GPX as file
     */
    static download(track, filename = 'activity.gpx') {
        const gpx = this.export(track, filename.replace('.gpx', ''));
        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Escape XML special characters
     */
    static _escapeXml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
