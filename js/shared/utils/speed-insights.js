import { injectSpeedInsights } from 'https://esm.sh/@vercel/speed-insights@2.0.0';

let speedInsightsInitialized = false;

export function setupSpeedInsights() {
    if (speedInsightsInitialized || typeof window === 'undefined') {
        return;
    }

    speedInsightsInitialized = true;
    injectSpeedInsights();
}

setupSpeedInsights();