// js/ui.js
import { fetchGearById } from './api.js';
import * as charts from './charts.js';
import * as utils from './utils.js';

// --- DOM REFERENCES  ---
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const athleteName = document.getElementById('athlete-name');
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');



// --- UI HELPERS ---
export function showLoading(message) {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.style.display = 'flex';
        loadingOverlay.classList.remove('hidden');
    }
}

export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
        loadingOverlay.classList.add('hidden');
    }
}

export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Check console for details.`);
}

export function setupDashboard(activities) {
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    athleteName.textContent = `Running Dashboard`;

    const dates = activities.map(a => a.start_date_local.substring(0, 10)).sort();
    if (dates.length > 0) {
        document.getElementById('date-from').min = dates[0];
        document.getElementById('date-from').max = dates[dates.length - 1];
        document.getElementById('date-to').min = dates[0];
        document.getElementById('date-to').max = dates[dates.length - 1];
    }
    setupExportButtons(activities);
}


// --- SECCIÓN DEL SELECTOR DE AÑO ---

export function setupYearlySelector(activities, onYearSelect) {
    const yearlyBtn = document.getElementById('yearly-btn');
    const yearList = document.getElementById('year-list');
    if (!yearlyBtn || !yearList) return;
    const years = Array.from(new Set(activities.map(a => new Date(a.start_date_local).getFullYear()))).sort((a, b) => b - a);
    yearList.innerHTML = years.map(year => `<button class="year-btn" data-year="${year}">${year}</button>`).join('');
    yearlyBtn.onclick = () => {
        yearList.style.display = yearList.style.display === 'none' ? 'flex' : 'none';
    };
    yearList.querySelectorAll('.year-btn').forEach(btn => {
        btn.onclick = () => {
            const year = btn.getAttribute('data-year');
            const from = `${year}-01-01`;
            const to = `${year}-12-31`;
            yearList.style.display = 'none';
            if (onYearSelect) {
                onYearSelect(from, to);
            }
        };
    });
}

// --- BOTONES DE EXPORTACIÓN ---
export function setupExportButtons(activities) {
    // CSV
    document.getElementById('download-csv-btn').onclick = () => {
        if (!activities || activities.length === 0) return alert('No data to export.');
        const headers = Object.keys(activities[0]);
        const csvRows = [
            headers.join(','),
            ...activities.map(act => headers.map(h => `"${(act[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'strava_activities.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // PDF
    document.getElementById('download-pdf-btn').onclick = () => {
        window.print();
    };
}
