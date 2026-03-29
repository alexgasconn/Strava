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
    console.log(`🏃 Loading analyzer for sport: ${sport_type}...`);
    const type = sport_type.toLowerCase();

    if (type.includes('run')) {
        if (type.includes('trail')) {
            return import('./trail-run.js').then(m => {
                const analyzer = new m.TrailRunAnalyzer(track);
                console.log(`✅ Analyzer loaded: TrailRunAnalyzer`);
                return analyzer;
            });
        }
        return import('./running.js').then(m => {
            const analyzer = new m.RunningAnalyzer(track);
            console.log(`✅ Analyzer loaded: RunningAnalyzer`);
            return analyzer;
        });
    }

    if (type.includes('ride') || type.includes('bike') || type.includes('mtb')) {
        if (type.includes('gravel') || type.includes('mtb')) {
            return import('./gravel-mtb.js').then(m => {
                const analyzer = new m.GravelMTBAnalyzer(track);
                console.log(`✅ Analyzer loaded: GravelMTBAnalyzer`);
                return analyzer;
            });
        }
        return import('./cycling.js').then(m => {
            const analyzer = new m.CyclingAnalyzer(track);
            console.log(`✅ Analyzer loaded: CyclingAnalyzer`);
            return analyzer;
        });
    }

    if (type.includes('hike')) {
        return import('./hiking.js').then(m => {
            const analyzer = new m.HikingAnalyzer(track);
            console.log(`✅ Analyzer loaded: HikingAnalyzer`);
            return analyzer;
        });
    }

    return import('./base-analyzer.js').then(m => {
        const analyzer = new m.BaseAnalyzer(track);
        console.log(`✅ Analyzer loaded: BaseAnalyzer`);
        return analyzer;
    });
}
