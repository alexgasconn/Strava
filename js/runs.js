// js/runs.js

export function renderPlannerTab(allActivities) {
    console.log("Initializing Planner Tab...");

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

}