// js/gear.js

export function renderGearTab(allActivities) {
    console.log("Initializing Gear Tab...");

    const runs = allActivities.filter(a => a.type && a.type.includes('Run'));

}