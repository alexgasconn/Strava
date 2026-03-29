/**
 * QUICK_START_EXAMPLE.JS — Quick start guide for using the analysis engine
 * Add this to your activity page to enable advanced analysis
 */

import { initializeActivityAnalyzer, currentActivityAnalyzer } from './advanced-analysis.js';
import { AnalysisResultsUI, ANALYSIS_STYLES } from './analysis-ui-components.js';

/**
 * USAGE EXAMPLE 1: Basic integration into activity page
 */
export async function setupAnalysisButton() {
    // Add button to activity page
    const buttonHtml = `
        <button id="btn-advanced-analysis" class="btn btn-primary">
            ⚡ Advanced Analysis
        </button>
        <button id="btn-analysis-mode" class="btn btn-secondary" style="display:none;">
            📊 Analysis Mode: <span id="mode-text">Normal</span>
        </button>
    `;

    // Insert into page
    document.getElementById('activity-controls').insertAdjacentHTML('beforeend', buttonHtml);

    // Create results container
    const resultsHtml = `
        <div id="analysis-results" style="display:none; margin: 20px 0;">
            <style>${ANALYSIS_STYLES}</style>
            <div id="analysis-summary"></div>
            <div id="analysis-insights"></div>
            <div id="analysis-climbs"></div>
            <div id="analysis-segments"></div>
            <div id="analysis-exports"></div>
        </div>
    `;

    document.getElementById('activity-details').insertAdjacentHTML('afterend', resultsHtml);

    // Attach event listeners
    document.getElementById('btn-advanced-analysis').addEventListener('click', runAnalysis);
    document.getElementById('btn-analysis-mode').addEventListener('click', toggleMode);
}

/**
 * USAGE EXAMPLE 2: Run analysis
 */
export async function runAnalysis() {
    const activityId = new URLSearchParams(window.location.search).get('id');
    const resultsContainer = document.getElementById('analysis-results');
    const button = document.getElementById('btn-advanced-analysis');

    try {
        // Show loading
        button.disabled = true;
        button.textContent = '⏳ Analyzing...';

        // Initialize analyzer
        const analyzer = await initializeActivityAnalyzer(parseInt(activityId, 10));

        // Fetch data
        console.log('📥 Fetching activity data...');
        await analyzer.fetchActivityData();

        // Run analysis
        console.log('🚀 Running analysis...');
        const results = await analyzer.analyze('normal');

        // Display results
        console.log('✅ Analysis complete! Results:', results);

        AnalysisResultsUI.renderSummary(analyzer, document.getElementById('analysis-summary'));
        AnalysisResultsUI.renderInsights(analyzer, document.getElementById('analysis-insights'));
        AnalysisResultsUI.renderClimbs(analyzer, document.getElementById('analysis-climbs'));
        AnalysisResultsUI.renderSegments(analyzer, document.getElementById('analysis-segments'));
        AnalysisResultsUI.renderExports(analyzer, document.getElementById('analysis-exports'));

        // Show results
        resultsContainer.style.display = 'block';

        // Update button
        button.disabled = false;
        button.textContent = '✅ Analysis Complete!';
        document.getElementById('btn-analysis-mode').style.display = 'inline-block';

        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        console.error('❌ Analysis failed:', error);
        alert(`Analysis failed: ${error.message}`);
        button.disabled = false;
        button.textContent = '⚡ Advanced Analysis';
    }
}

/**
 * USAGE EXAMPLE 3: Toggle analysis mode
 */
let currentMode = 'normal';
export async function toggleMode() {
    const modes = ['normal', 'quick', 'deep'];
    const index = modes.indexOf(currentMode);
    currentMode = modes[(index + 1) % modes.length];

    document.getElementById('mode-text').textContent = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);

    // Re-run analysis with new mode
    if (currentActivityAnalyzer) {
        console.log(`🔄 Re-running analysis in ${currentMode} mode...`);
        const modeText = document.getElementById('btn-analysis-mode');
        modeText.style.opacity = '0.5';

        try {
            const results = await currentActivityAnalyzer.analyze(currentMode);
            const analyzer = currentActivityAnalyzer;

            // Update UI
            AnalysisResultsUI.renderSummary(analyzer, document.getElementById('analysis-summary'));
            AnalysisResultsUI.renderInsights(analyzer, document.getElementById('analysis-insights'));

            modeText.style.opacity = '1';

        } catch (error) {
            console.error('Analysis mode change failed:', error);
            modeText.style.opacity = '1';
        }
    }
}

/**
 * USAGE EXAMPLE 4: Inline HTML integration
 */
export function getAnalysisButtonHTML() {
    return `
        <button class="btn btn-primary" onclick="window.runAdvancedAnalysis()">
            ⚡ Advanced Analysis
        </button>
    `;
}

/**
 * USAGE EXAMPLE 5: Programmatic usage (no UI)
 */
export async function getAnalysisData(activityId) {
    const { AdvancedActivityAnalyzer } = await import('./advanced-analysis.js');

    const analyzer = new AdvancedActivityAnalyzer(activityId);
    await analyzer.fetchActivityData();
    const results = await analyzer.analyze('normal');

    return {
        summary: analyzer.getSummary(),
        climbs: analyzer.getClimbDetails(),
        segments: analyzer.getSegmentBreakdown(),
        insights: results.insights,
        raw: results
    };
}

/**
 * USAGE EXAMPLE 6: Export data
 */
export function exportAnalysis(format = 'json') {
    if (!currentActivityAnalyzer) {
        alert('No analysis to export. Run analysis first.');
        return;
    }

    currentActivityAnalyzer.downloadExport(format);
}

/**
 * MINIMAL HTML INTEGRATION (add this to activity.html)
 */
export const MINIMAL_INTEGRATION = `
<!-- Add this section to activity.html -->
<section id="advanced-analysis-section" style="margin-top: 40px;">
    <style>
        ${ANALYSIS_STYLES}
        
        .analysis-button-group {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: #007bff;
            color: white;
        }
        
        .btn-primary:hover {
            background: #0056b3;
        }
        
        .btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #545b62;
        }
    </style>

    <div class="analysis-button-group">
        <button id="btn-advanced-analysis" class="btn btn-primary">⚡ Advanced Analysis</button>
        <button id="btn-export-gpx" class="btn btn-secondary" style="display:none;">📍 GPX</button>
        <button id="btn-export-csv" class="btn btn-secondary" style="display:none;">📊 CSV</button>
        <button id="btn-export-json" class="btn btn-secondary" style="display:none;">📋 JSON</button>
    </div>

    <div id="analysis-results" style="display:none;">
        <div id="analysis-summary"></div>
        <div id="analysis-insights"></div>
        <div id="analysis-climbs"></div>
        <div id="analysis-segments"></div>
    </div>
</section>

<script type="module">
    import { setupAnalysisButton, runAnalysis, exportAnalysis } from './activity/quick-start-example.js';

    // Setup buttons
    await setupAnalysisButton();

    // Export buttons
    document.getElementById('btn-export-gpx').addEventListener('click', () => exportAnalysis('gpx'));
    document.getElementById('btn-export-csv').addEventListener('click', () => exportAnalysis('csv'));
    document.getElementById('btn-export-json').addEventListener('click', () => exportAnalysis('json'));

    // Make export buttons visible after analysis
    window.addEventListener('analysis-complete', () => {
        document.getElementById('btn-export-gpx').style.display = 'inline-block';
        document.getElementById('btn-export-csv').style.display = 'inline-block';
        document.getElementById('btn-export-json').style.display = 'inline-block';
    });
</script>
`;

/**
 * USAGE EXAMPLE 7: REST API adapter (if needed)
 */
export function createAnalysisAPI() {
    return {
        async POST(req) {
            const { activityId, mode = 'normal' } = req.body;

            const { AdvancedActivityAnalyzer } = await import('./advanced-analysis.js');

            const analyzer = new AdvancedActivityAnalyzer(activityId);
            await analyzer.fetchActivityData();
            const results = await analyzer.analyze(mode);

            return {
                success: true,
                data: results,
                timestamp: new Date().toISOString()
            };
        }
    };
}

// Export for use in other modules
export default {
    setupAnalysisButton,
    runAnalysis,
    toggleMode,
    getAnalysisButtonHTML,
    getAnalysisData,
    exportAnalysis,
    createAnalysisAPI,
    MINIMAL_INTEGRATION
};
