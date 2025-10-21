// js/runs.js

export function renderRunsTab(allActivities) {
    console.log("Initializing Runs Tab...");

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

}