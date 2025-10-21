// js/runs.js

import { formatTime, formatDistance, formatPace } from './utils.js';

export function renderRunsTab(allActivities) {
    console.log("Initializing Runs Tab...");

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    const personalBestsContainer = document.getElementById('personal-bests');
    const raceListTable = document.getElementById('race-list');
    const allRunsTableContainer = document.getElementById('all-runs-table');

    if (!personalBestsContainer || !raceListTable || !allRunsTableContainer) {
        console.error("One or more Runs & Races containers not found.");
        return;
    }

    if (runs.length === 0) {
        personalBestsContainer.innerHTML = '<p>No running data available.</p>';
        raceListTable.innerHTML = '<thead><tr><th>No Races</th></tr></thead><tbody><tr><td>No running data to display races.</td></tr></tbody>';
        allRunsTableContainer.innerHTML = '<thead><tr><th>No Runs</th></tr></thead><tbody><tr><td>No running data to display runs.</td></tr></tbody>';
        return;
    }

    // --- Lógica principal del Runs Tab ---

    // --- Personal Bests ---
    const pbs = calculatePersonalBests(runs);
    renderPersonalBests(personalBestsContainer, pbs);

    // --- Races ---
    const races = filterRaces(runs); // Asume que las actividades tienen una propiedad 'is_race' o 'name' que indica una carrera
    renderRacesTable(raceListTable, races);

    // --- All Runs ---
    renderAllRunsTable(allRunsTableContainer, runs);

    // --- Funciones auxiliares (dentro de renderRunsTab o como funciones privadas) ---

    // Calcula los mejores tiempos personales para distancias estándar
    function calculatePersonalBests(runs) {
        const targetDistances = [
            { name: '1 Mile', km: 1.609 },
            { name: '5K', km: 5 },
            { name: '10K', km: 10 },
            { name: 'Half Marathon', km: 21.097 },
            { name: 'Marathon', km: 42.195 }
        ];

        const personalBests = {};

        targetDistances.forEach(target => {
            let bestTime = Infinity;
            let bestRun = null;

            const margin = 0.05; // 5% de margen para considerar una actividad como la distancia objetivo
            const minKm = target.km * (1 - margin);
            const maxKm = target.km * (1 + margin);

            runs.forEach(run => {
                const runKm = run.distance / 1000; // Asumiendo distance en metros
                if (runKm >= minKm && runKm <= maxKm && run.moving_time > 0) {
                    // Ajuste simple: normalizar el tiempo al ritmo de la distancia objetivo
                    const timeAtTargetPace = run.moving_time * (target.km / runKm);

                    if (timeAtTargetPace < bestTime) {
                        bestTime = timeAtTargetPace;
                        bestRun = { ...run, time_at_target: timeAtTargetPace, actual_run_km: runKm };
                    }
                }
            });

            if (bestRun) {
                personalBests[target.name] = bestRun;
            }
        });
        return personalBests;
    }

    function renderPersonalBests(container, pbs) {
        if (Object.keys(pbs).length === 0) {
            container.innerHTML = '<p>No personal bests recorded yet.</p>';
            return;
        }

        // Usaremos un layout de rejilla simple para los PBs
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                ${Object.entries(pbs).map(([distanceName, run]) => `
                    <div class="pb-card" style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; text-align: center;">
                        <h4>${distanceName}</h4>
                        <p style="font-size: 1.4em; font-weight: bold;">${formatTime(run.time_at_target)}</p>
                        <p style="font-size: 0.9em; color: #555;">Pace: ${formatPace(run.time_at_target, run.actual_run_km || (run.distance / 1000))}</p>
                        <p style="font-size: 0.8em; color: #777;">(${new Date(run.start_date).toLocaleDateString()})</p>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Filtra las actividades que son carreras
    function filterRaces(runs) {
        // Esto es una simplificación. En un caso real, las actividades podrían tener un campo 'type: "race"'
        // o el nombre de la actividad podría contener palabras clave como "Marathon", "Race", "5k", etc.
        const raceKeywords = ['marathon', 'half marathon', '10k', '5k', 'race', 'trail run'];
        return runs.filter(run => 
            run.name && raceKeywords.some(keyword => run.name.toLowerCase().includes(keyword))
        ).sort((a,b) => new Date(b.start_date) - new Date(a.start_date)); // Ordenar por fecha, las más recientes primero
    }

    function renderRacesTable(tableElement, races) {
        if (races.length === 0) {
            tableElement.innerHTML = '<thead><tr><th>No Races Recorded</th></tr></thead><tbody><tr><td></td></tr></tbody>';
            return;
        }

        tableElement.innerHTML = `
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Distance</th>
                    <th>Time</th>
                    <th>Avg Pace</th>
                </tr>
            </thead>
            <tbody>
                ${races.map(run => `
                    <tr>
                        <td>${new Date(run.start_date).toLocaleDateString()}</td>
                        <td>${run.name || 'N/A'}</td>
                        <td>${formatDistance(run.distance)}</td>
                        <td>${formatTime(run.moving_time)}</td>
                        <td>${formatPace(run.moving_time, run.distance / 1000)}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
    }

    function renderAllRunsTable(tableElement, runs) {
        if (runs.length === 0) {
            tableElement.innerHTML = '<thead><tr><th>No Runs Recorded</th></tr></thead><tbody><tr><td></td></tr></tbody>';
            return;
        }

        // Ordenar las carreras de la más reciente a la más antigua
        const sortedRuns = [...runs].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

        tableElement.innerHTML = `
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Distance</th>
                    <th>Elevation</th>
                    <th>Time</th>
                    <th>Avg Pace</th>
                    <th>Calories</th>
                </tr>
            </thead>
            <tbody>
                ${sortedRuns.map(run => `
                    <tr>
                        <td>${new Date(run.start_date).toLocaleDateString()}</td>
                        <td>${run.name || 'Run'}</td>
                        <td>${formatDistance(run.distance)}</td>
                        <td>${run.total_elevation_gain ? run.total_elevation_gain.toFixed(0) + 'm' : '-'}</td>
                        <td>${formatTime(run.moving_time)}</td>
                        <td>${formatPace(run.moving_time, run.distance / 1000)}</td>
                        <td>${run.calories ? run.calories.toFixed(0) : '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
    }
}