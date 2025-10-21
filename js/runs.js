// js/runs.js

// Nota: Las funciones de formato específicas de este segmento se definen
// dentro de las funciones de renderizado correspondientes para mantener la lógica de tu ejemplo.
// Las de utils.js se mantendrían para otros usos si fuera necesario.

export function renderRunsTab(allActivities) {
    console.log("Initializing Runs Tab...");

    // Filtra solo las actividades de tipo 'Run'
    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

    const personalBestsContainer = document.getElementById('personal-bests');
    const raceListTableContainer = document.getElementById('race-list'); // Renombrado para evitar conflicto con la función
    const allRunsTableContainer = document.getElementById('all-runs-table');

    if (!personalBestsContainer || !raceListTableContainer || !allRunsTableContainer) {
        console.error("One or more Runs & Races containers not found.");
        return;
    }

    if (runs.length === 0) {
        personalBestsContainer.innerHTML = '<p>No running data available.</p>';
        raceListTableContainer.innerHTML = '<thead><tr><th>No Races</th></tr></thead><tbody><tr><td>No running data to display races.</td></tr></tbody>';
        allRunsTableContainer.innerHTML = '<thead><tr><th>No Runs</th></tr></thead><tbody><tr><td>No running data to display runs.</td></tr></tbody>';
        return;
    }

    // --- Lógica principal del Runs Tab ---

    // --- Personal Bests ---
    const pbs = calculatePersonalBests(runs);
    renderPersonalBests(personalBestsContainer, pbs);

    // --- Races ---
    renderRaceList(runs); // Usando tu función específica

    // --- All Runs ---
    renderAllRunsTable(runs); // Usando tu función específica

    // --- Funciones auxiliares (dentro de renderRunsTab o como funciones privadas) ---

    // Calcula los mejores tiempos personales para distancias estándar
    function calculatePersonalBests(runs) {
        // --- Helpers de formato para esta sección (si fueran necesarios y diferentes a los globales) ---
        function formatTime(sec) {
            if (!isFinite(sec) || sec <= 0) return 'N/A';
            sec = Math.round(sec);
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return (h > 0 ? h + ':' : '') + m.toString().padStart(h > 0 ? 2 : 1, '0') + ':' + s.toString().padStart(2, '0');
        }

        function formatDistance(meters) {
            if (!isFinite(meters) || meters < 0) return 'N/A';
            if (meters < 1000) {
                return `${meters.toFixed(0)} m`;
            }
            return `${(meters / 1000).toFixed(2)} km`;
        }

        function formatPace(seconds, km) {
            if (!isFinite(seconds) || !isFinite(km) || km <= 0) return '-';
            const pace = seconds / km; // pace in seconds per km
            const min = Math.floor(pace / 60);
            const secRest = Math.round(pace % 60);
            return `${min}:${secRest.toString().padStart(2, '0')} /km`;
        }
        // --- Fin de Helpers de formato específicos de esta sección ---


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
        // --- Helpers de formato para esta sección (si fueran necesarios y diferentes a los globales) ---
        function formatTime(sec) {
            if (!isFinite(sec) || sec <= 0) return 'N/A';
            sec = Math.round(sec);
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return (h > 0 ? h + ':' : '') + m.toString().padStart(h > 0 ? 2 : 1, '0') + ':' + s.toString().padStart(2, '0');
        }

        function formatPace(seconds, km) {
            if (!isFinite(seconds) || !isFinite(km) || km <= 0) return '-';
            const pace = seconds / km; // pace in seconds per km
            const min = Math.floor(pace / 60);
            const secRest = Math.round(pace % 60);
            return `${min}:${secRest.toString().padStart(2, '0')} /km`;
        }
        // --- Fin de Helpers de formato específicos de esta sección ---

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

    // Tu función original para renderizar la lista de carreras
    function renderRaceList(allRuns) {
        const container = document.getElementById('race-list');
        if (!container) return;

        // Aquí filtramos las actividades donde workout_type es 1 para identificar carreras
        const races = allRuns.filter(act => act.workout_type === 1);
        if (races.length === 0) {
            container.innerHTML = "<tbody><tr><td colspan='6'>No races found in this period.</td></tr></tbody>";
            return;
        }

        const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
        const tableBody = races.map(act => {
            const distKm = (act.distance / 1000).toFixed(2);
            // Tu lógica de formato de tiempo para raceList
            const timeStr = new Date(act.moving_time * 1000).toISOString().substr(11, 8);
            const paceMin = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
            // Tu lógica de formato de ritmo para raceList
            const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';
            return `<tr>
                <td>${act.start_date_local.substring(0, 10)}</td>
                <td>${act.name}</td>
                <td>${distKm} km</td>
                <td>${timeStr}</td>
                <td>${paceStr} /km</td>
                <td><a href="activity.html?id=${act.id}" target="_blank"><button>View</button></a></td>
            </tr>`;
        }).join('');
        container.innerHTML = tableHeader + `<tbody>${tableBody}</tbody>`;
    }

    // Tu función original para renderizar la tabla de todas las carreras
    function renderAllRunsTable(allRuns) {
        const container = document.getElementById('all-runs-table');
        if (!container) return;

        if (allRuns.length === 0) {
            container.innerHTML = "<tbody><tr><td colspan='6'>No runs found in this period.</td></tr></tbody>";
            return;
        }

        // Ordenamos las carreras de más reciente a más antigua para la tabla
        const sortedRuns = [...allRuns].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
        let showAll = container.getAttribute('data-show-all') === 'true';
        const runsToShow = showAll ? sortedRuns : sortedRuns.slice(0, 10);

        const tableHeader = `<thead><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Details</th></tr></thead>`;
        const tableBody = runsToShow.map(act => {
            const distKm = (act.distance / 1000).toFixed(2);
            // Tu lógica de formato de tiempo para allRunsTable
            const timeStr = new Date(act.moving_time * 1000).toISOString().substr(11, 8);
            const paceMin = act.distance > 0 ? (act.moving_time / 60) / (act.distance / 1000) : 0;
            // Tu lógica de formato de ritmo para allRunsTable
            const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}:${Math.round((paceMin % 1) * 60).toString().padStart(2, '0')}` : '-';
            return `<tr>
                <td>${act.start_date_local.substring(0, 10)}</td>
                <td>${act.name}</td>
                <td>${distKm} km</td>
                <td>${timeStr}</td>
                <td>${paceStr} /km</td>
                <td><a href="activity.html?id=${act.id}" target="_blank"><button>View</button></a></td>
            </tr>`;
        }).join('');

        let toggleBtn = '';
        if (sortedRuns.length > 10) {
            toggleBtn = `
                <div style="margin: 0.5em 0;">
                    <button id="toggle-all-runs-btn" class="df-button">
                        ${showAll ? 'Show Only Last 10' : 'Show All Runs'}
                    </button>
                </div>
            `;
        }

        container.innerHTML = toggleBtn + tableHeader + `<tbody>${tableBody}</tbody>`;

        if (sortedRuns.length > 10) {
            document.getElementById('toggle-all-runs-btn').onclick = () => {
                container.setAttribute('data-show-all', showAll ? 'false' : 'true');
                renderAllRunsTable(allRuns); // Llama recursivamente con el nuevo estado
            };
        }
    }
}