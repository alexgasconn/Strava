/**
 * ANALYZERS INDEX — Export all sport analyzers
 */

export { BaseAnalyzer } from './base-analyzer.js';
export { RunningAnalyzer } from './running.js';
export { TrailRunAnalyzer } from './trail-run.js';
export { CyclingAnalyzer } from './cycling.js';
export { HikingAnalyzer } from './hiking.js';
export { GravelMTBAnalyzer } from './gravel-mtb.js';

/**
 * Factory function to get appropriate analyzer for sport type
 */
export function getAnalyzerForSport(sport_type, track) {
    const type = sport_type.toLowerCase();

    if (type.includes('run')) {
        if (type.includes('trail')) {
            return import('./trail-run.js').then(m => new m.TrailRunAnalyzer(track));
        }
        return import('./running.js').then(m => new m.RunningAnalyzer(track));
    }

    if (type.includes('ride') || type.includes('bike') || type.includes('mtb')) {
        if (type.includes('gravel') || type.includes('mtb')) {
            return import('./gravel-mtb.js').then(m => new m.GravelMTBAnalyzer(track));
        }
        return import('./cycling.js').then(m => new m.CyclingAnalyzer(track));
    }

    if (type.includes('hike')) {
        return import('./hiking.js').then(m => new m.HikingAnalyzer(track));
    }

    return import('./base-analyzer.js').then(m => new m.BaseAnalyzer(track));
}
