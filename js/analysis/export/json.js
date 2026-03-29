/**
 * EXPORT - JSON.JS — Export analysis results to JSON
 */

export class JSONExporter {
    /**
     * Convert AnalysisResult to JSON
     */
    static export(analysis_result) {
        return JSON.stringify(analysis_result.toJSON(), null, 2);
    }

    /**
     * Export track as JSON
     */
    static exportTrack(track) {
        return JSON.stringify(track.toJSON(), null, 2);
    }

    /**
     * Download JSON as file
     */
    static download(data, filename = 'analysis.json') {
        const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
