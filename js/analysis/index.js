/**
 * ACTIVITY_ANALYSIS_ENGINE.JS — Main orchestrator for complete activity analysis
 * Coordinates: Virtual GPX reconstruction → preprocessing → detection → 
 * segmentation → sport-specific analysis → advanced engines → insights
 */

import { VirtualGPXReconstructor } from './virtual-gpx.js';
import { PreprocessingPipeline } from './preprocessing.js';
import { ClimbDetector } from './detection/climbs.js';
import { StopDetector } from './detection/stops.js';
import { SegmentationEngine } from './segmentation/index.js';
import { getAnalyzerForSport } from './analyzers/index.js';
import { FatigueEngine } from './engines/fatigue.js';
import { AeroEngine } from './engines/aero.js';
import { PhysiologyEngine } from './engines/physiology.js';
import { InsightsGenerator } from './engines/insights-generator.js';

export class ActivityAnalysisEngine {
    constructor(config = {}) {
        this.config = {
            enable_preprocessing: config.enable_preprocessing ?? true,
            enable_climb_detection: config.enable_climb_detection ?? true,
            enable_stop_detection: config.enable_stop_detection ?? true,
            enable_segmentation: config.enable_segmentation ?? true,
            enable_fatigue_analysis: config.enable_fatigue_analysis ?? true,
            enable_aero_analysis: config.enable_aero_analysis ?? false,
            enable_physiology_analysis: config.enable_physiology_analysis ?? true,
            enable_insights: config.enable_insights ?? true,
            ...config
        };
    }

    /**
     * Execute complete analysis pipeline
     */
    async analyze(metadata, streams) {
        const startTime = Date.now();
        const result = {};

        try {
            // 1. Reconstruct virtual GPX
            console.log('🛰️  Reconstructing virtual GPX...');
            const track = VirtualGPXReconstructor.reconstruct(metadata, streams);
            result.track = track;

            // 2. Preprocessing
            if (this.config.enable_preprocessing) {
                console.log('🧪 Preprocessing data...');
                const preprocess = new PreprocessingPipeline(this.config);
                result.track = preprocess.process(track);
            }

            // 3. Detect climbs and stops
            if (this.config.enable_climb_detection) {
                console.log('⛰️  Detecting climbs...');
                const climbDetector = new ClimbDetector(this.config);
                result.climbs = climbDetector.detect(result.track);
            }

            if (this.config.enable_stop_detection) {
                console.log('🛑 Detecting stops...');
                const stopDetector = new StopDetector(this.config);
                result.stops = stopDetector.detect(result.track);
            }

            // 4. Segmentation
            if (this.config.enable_segmentation) {
                console.log('📊 Segmenting activity...');
                const segmentation = new SegmentationEngine(this.config);
                result.segments = segmentation.segment(result.track);
            }

            // 5. Sport-specific analysis
            console.log(`🏃 Running ${metadata.sport_type} analysis...`);
            const analyzer = await getAnalyzerForSport(metadata.sport_type, result.track);
            result.sport_analysis = await analyzer.analyze();

            // Merge climb and stop data
            result.sport_analysis.climbs = result.climbs || [];
            result.sport_analysis.segments = result.segments || {};
            result.sport_analysis.stops = result.stops || [];

            // 6. Advanced engines
            if (this.config.enable_fatigue_analysis) {
                console.log('😓 Analyzing fatigue...');
                const fatigueEngine = new FatigueEngine(this.config);
                result.sport_analysis.fatigue_data = fatigueEngine.detect(result.track);
            }

            if (this.config.enable_aero_analysis) {
                console.log('💨 Analyzing aerodynamics...');
                const aeroEngine = new AeroEngine(this.config);
                result.sport_analysis.aero_data = aeroEngine.calculate(result.track);
            }

            if (this.config.enable_physiology_analysis) {
                console.log('❤️  Analyzing physiology...');
                const physiologyEngine = new PhysiologyEngine(this.config);
                result.sport_analysis.physiology_data = physiologyEngine.analyze(result.track, result.sport_analysis);
            }

            // 7. Generate insights
            if (this.config.enable_insights) {
                console.log('💡 Generating insights...');
                result.sport_analysis.insights = InsightsGenerator.generate(
                    result.sport_analysis,
                    result.track,
                    metadata.sport_type
                );
            }

            result.sport_analysis.processing_time_ms = Date.now() - startTime;
            result.sport_analysis.analysis_version = '1.0';

            console.log(`✅ Analysis complete in ${result.sport_analysis.processing_time_ms}ms`);

            return result.sport_analysis;

        } catch (error) {
            console.error('❌ Analysis failed:', error);
            throw error;
        }
    }

    /**
     * Quick analysis (only essential metrics)
     */
    async analyzeQuick(metadata, streams) {
        const oldConfig = { ...this.config };
        this.config.enable_aero_analysis = false;
        this.config.enable_segmentation = false;

        const result = await this.analyze(metadata, streams);

        this.config = oldConfig;
        return result;
    }

    /**
     * Deep analysis (all features enabled)
     */
    async analyzeDeep(metadata, streams, athlete_profile = null) {
        const oldConfig = { ...this.config };
        
        this.config.enable_preprocessing = true;
        this.config.enable_climb_detection = true;
        this.config.enable_stop_detection = true;
        this.config.enable_segmentation = true;
        this.config.enable_fatigue_analysis = true;
        this.config.enable_aero_analysis = true;
        this.config.enable_physiology_analysis = true;
        this.config.enable_insights = true;

        if (athlete_profile) {
            this.config = { ...this.config, ...athlete_profile };
        }

        const result = await this.analyze(metadata, streams);

        this.config = oldConfig;
        return result;
    }
}

/**
 * Convenience function for frontend use
 */
export async function analyzeActivity(activity_id, metadata, streams, profile = null, mode = 'normal') {
    const engine = new ActivityAnalysisEngine(profile || {});

    switch (mode) {
        case 'quick':
            return engine.analyzeQuick(metadata, streams);
        case 'deep':
            return engine.analyzeDeep(metadata, streams, profile);
        default:
            return engine.analyze(metadata, streams);
    }
}
