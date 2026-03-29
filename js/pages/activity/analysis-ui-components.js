/**
 * ACTIVITY_UI_INTEGRATION.JS — UI components for displaying analysis results
 */

export class AnalysisResultsUI {
    static renderSummary(analysis, container) {
        const summary = analysis.getSummary();
        
        let html = `
            <div class="analysis-summary">
                <h2>⚡ Advanced Analysis Results</h2>
                
                <div class="summary-grid">
                    <div class="stat-card">
                        <span class="label">Distance</span>
                        <span class="value">${summary.distance} km</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Duration</span>
                        <span class="value">${summary.duration}</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Moving Time</span>
                        <span class="value">${summary.moving_time}</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Elevation Gain</span>
                        <span class="value">${summary.elevation_gain} m</span>
                    </div>
                </div>
                
                <div class="summary-grid">
                    <div class="stat-card">
                        <span class="label">Avg ${summary.sport.includes('Run') ? 'Pace' : 'Speed'}</span>
                        <span class="value">${summary.avg_pace ? summary.avg_pace.minutes + ':' + summary.avg_pace.seconds.toString().padStart(2, '0') + '/km' : summary.avg_speed + ' km/h'}</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Max Speed</span>
                        <span class="value">${summary.max_speed} km/h</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Avg HR</span>
                        <span class="value">${summary.avg_hr} bpm</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Max HR</span>
                        <span class="value">${summary.max_hr} bpm</span>
                    </div>
                </div>
        `;

        if (summary.avg_power) {
            html += `
                <div class="summary-grid">
                    <div class="stat-card">
                        <span class="label">Avg Power</span>
                        <span class="value">${summary.avg_power} W</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">Normalized Power</span>
                        <span class="value">${summary.normalized_power || 'N/A'} W</span>
                    </div>
                    <div class="stat-card">
                        <span class="label">TSS</span>
                        <span class="value">${summary.tss || 'N/A'}</span>
                    </div>
                </div>
            `;
        }

        if (summary.fatigue_detected) {
            html += `
                <div class="alert alert-warning">
                    ⚠️ <strong>Fatigue Detected</strong> at ${summary.fatigue_onset_distance?.toFixed(1) || 'N/A'} km
                </div>
            `;
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    static renderInsights(analysis, container) {
        const summary = analysis.getSummary();
        
        if (!summary.insights || summary.insights.length === 0) {
            container.innerHTML = '<p>No insights available</p>';
            return;
        }

        let html = '<div class="insights-section"><h3>💡 Insights</h3><ul>';
        
        summary.insights.forEach(insight => {
            html += `<li>${insight}</li>`;
        });
        
        html += '</ul></div>';
        container.innerHTML = html;
    }

    static renderClimbs(analysis, container) {
        const climbs = analysis.getClimbDetails();
        
        if (!climbs || climbs.length === 0) {
            container.innerHTML = '<p>No climbs detected</p>';
            return;
        }

        let html = '<div class="climbs-section"><h3>⛰️  Climbs</h3><div class="climbs-list">';
        
        climbs.forEach(climb => {
            html += `
                <div class="climb-card">
                    <div class="climb-header">
                        <span class="climb-category">${climb.category}</span>
                        <span class="climb-name">${climb.name}</span>
                    </div>
                    <div class="climb-stats">
                        <span>📏 ${climb.distance} km</span>
                        <span>⬆️  ${climb.elevation_gain} m</span>
                        <span>📈 Avg ${climb.avg_grade}%</span>
                        <span>⏱️  ${climb.duration}</span>
                        ${climb.vam ? `<span>🚗 VAM: ${climb.vam} m/h</span>` : ''}
                    </div>
                </div>
            `;
        });
        
        html += '</div></div>';
        container.innerHTML = html;
    }

    static renderSegments(analysis, container) {
        const breakdown = analysis.getSegmentBreakdown();
        
        let html = '<div class="segments-section"><h3>📊 Segments</h3>';
        
        // Distance segments
        if (breakdown.distance.length > 0) {
            html += '<h4>1km Splits</h4><div class="segments-table">';
            html += '<table><thead><tr><th>Split</th><th>Distance</th><th>Speed</th><th>HR</th><th>Elevation</th></tr></thead><tbody>';
            
            breakdown.distance.slice(0, 10).forEach(seg => {
                html += `
                    <tr>
                        <td>${seg.name}</td>
                        <td>${seg.distance} km</td>
                        <td>${seg.avg_speed} km/h</td>
                        <td>${seg.avg_hr || 'N/A'} bpm</td>
                        <td>${seg.elevation_gain} m</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
        }
        
        // Terrain segments
        if (breakdown.terrain.length > 0) {
            html += '<h4>Terrain Segments</h4><div class="segments-table">';
            html += '<table><thead><tr><th>Type</th><th>Distance</th><th>Elevation</th><th>Grade</th></tr></thead><tbody>';
            
            breakdown.terrain.forEach(seg => {
                html += `
                    <tr>
                        <td>${seg.terrain}</td>
                        <td>${seg.distance} km</td>
                        <td>${seg.elevation_gain} m</td>
                        <td>${seg.avg_grade}%</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    static renderExports(analysis, container) {
        let html = `
            <div class="exports-section">
                <h3>📥 Export Data</h3>
                <div class="export-buttons">
                    <button class="export-btn" onclick="currentActivityAnalyzer.downloadExport('gpx')">📍 Download GPX</button>
                    <button class="export-btn" onclick="currentActivityAnalyzer.downloadExport('csv')">📊 Download CSV</button>
                    <button class="export-btn" onclick="currentActivityAnalyzer.downloadExport('json')">📋 Download JSON</button>
                </div>
            </div>
        `;
        container.innerHTML = html;
    }
}

// CSS Styles for analysis UI
export const ANALYSIS_STYLES = `
    .analysis-summary {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
    }

    .stat-card {
        background: white;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 15px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .stat-card .label {
        font-size: 12px;
        color: #666;
        text-transform: uppercase;
        margin-bottom: 5px;
    }

    .stat-card .value {
        font-size: 18px;
        font-weight: bold;
        color: #333;
    }

    .insights-section,
    .climbs-section,
    .segments-section,
    .exports-section {
        background: white;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
        border: 1px solid #eee;
    }

    .insights-section ul {
        list-style: none;
        padding: 0;
    }

    .insights-section li {
        padding: 8px 0;
        border-bottom: 1px solid #eee;
    }

    .insights-section li:last-child {
        border-bottom: none;
    }

    .climbs-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 15px;
    }

    .climb-card {
        background: #f9f9f9;
        border-left: 4px solid #ff9500;
        padding: 12px;
        border-radius: 4px;
    }

    .climb-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .climb-category {
        background: #ff9500;
        color: white;
        padding: 3px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
    }

    .climb-name {
        font-weight: bold;
        color: #333;
    }

    .climb-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        font-size: 12px;
        color: #666;
    }

    .climb-stats span {
        padding: 4px;
    }

    .segments-table {
        overflow-x: auto;
        margin: 10px 0;
    }

    .segments-table table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .segments-table th {
        background: #f0f0f0;
        padding: 8px;
        text-align: left;
        font-weight: bold;
        border-bottom: 2px solid #ddd;
    }

    .segments-table td {
        padding: 8px;
        border-bottom: 1px solid #eee;
    }

    .export-buttons {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .export-btn {
        background: #007bff;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
    }

    .export-btn:hover {
        background: #0056b3;
    }

    .alert {
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 15px;
    }

    .alert-warning {
        background: #fff3cd;
        border: 1px solid #ffc107;
        color: #856404;
    }

    @media (max-width: 768px) {
        .summary-grid {
            grid-template-columns: repeat(2, 1fr);
        }

        .climbs-list {
            grid-template-columns: 1fr;
        }

        .export-buttons {
            flex-direction: column;
        }

        .export-btn {
            width: 100%;
        }
    }
`;
