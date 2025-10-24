// js/shoeReplacement.js

// === 1. Data Models (Interfaces for clarity, not strictly enforced in JS runtime) ===

/**
 * @typedef {object} Shoe
 * @property {string} id
 * @property {string} name
 * @property {string} brand
 * @property {string} model
 * @property {number} totalDistance // km (actual distance from Strava)
 * @property {number} totalUses
 * @property {number} costPerKm
 * @property {Date | null} lastUseDate
 * @property {Date | null} firstUseDate
 * @property {Date | null} purchaseDate
 * @property {number} purchasePrice // Custom price from localStorage
 * @property {boolean} retired // From Strava gear
 * @property {boolean} primary // From Strava gear
 * @property {number} customLifespanKm // Custom lifespan from localStorage (effective km)
 * @property {'flat' | 'moderate' | 'hilly' | 'mountain'} elevationProfile
 * @property {'recovery' | 'easy' | 'tempo' | 'race'} paceProfile
 * @property {'track' | 'road' | 'trail' | 'mixed'} surfaceProfile
 * @property {number} effectiveKilometers // Calculated effective km
 * @property {number} wearMultiplier // Overall wear multiplier for this shoe
 * @property {'healthy' | 'warning' | 'critical' | 'retired'} status // Calculated status
 * @property {Date | null} forecastedReplacement
 * @property {'low' | 'medium' | 'high' | 'critical'} replacementUrgency
 */

/**
 * @typedef {object} RunSession
 * @property {string} id
 * @property {string} shoeId
 * @property {Date} date
 * @property {number} distance // km
 * @property {number} duration // minutes
 * @property {number} averagePace // min/km
 * @property {number} elevationGain // meters
 * @property {'track' | 'road' | 'trail'} surfaceType
 * @property {'recovery' | 'easy' | 'tempo' | 'race'} intensity
 * @property {number} effectiveDistance // Calculated effective distance for this run
 * @property {number} [wearScore] // Optional, if needed for future enhancements
 * @property {number} [temperature]
 * @property {number} [humidity]
 */


// === 2. Wear Multiplier System ===

export const ESF_MULTIPLIERS = {
    'flat': 1.0,      // <50m per 10km
    'moderate': 1.3,  // 50-150m per 10km
    'hilly': 1.6,     // 150-300m per 10km
    'mountain': 2.0   // >300m per 10km
};

export const PIF_MULTIPLIERS = {
    'recovery': 0.9,  // >6:00 min/km
    'easy': 1.0,      // 5:30-6:00 min/km
    'tempo': 1.5,     // 4:30-5:30 min/km
    'race': 2.0       // <4:30 min/km
};

export const SIF_MULTIPLIERS = {
    'track': 0.8,
    'road': 1.2,
    'trail': 1.6,
    'mixed': 1.3 // Assuming mixed is an average of road/trail for simplicity if not explicitly logged
};

// === 3. Core Algorithms ===

/**
 * Calculates the effective distance of a run session based on wear factors.
 * @param {RunSession} runSession
 * @returns {number}
 */
export function calculateEffectiveDistance(runSession) {
    // Ensure all necessary data is present, otherwise return actual distance (in KM)
    if (!runSession || typeof runSession.distance !== 'number' || runSession.distance < 0 ||
        typeof runSession.elevationGain !== 'number' || typeof runSession.averagePace !== 'number' ||
        !runSession.surfaceType) {
        console.warn("Invalid runSession for effective distance calculation, returning actual distance.", runSession);
        return runSession.distance || 0;
    }

    const esf = ESF_MULTIPLIERS[getElevationProfile(runSession.elevationGain, runSession.distance)] || 1.0;
    const pif = PIF_MULTIPLIERS[getPaceProfile(runSession.averagePace)] || 1.0;
    const sif = SIF_MULTIPLIERS[runSession.surfaceType] || 1.0; // Default to 1.0 if type not found

    return runSession.distance * esf * pif * sif;
}

/**
 * Determines the elevation profile for a given run.
 * @param {number} elevationGain - Total elevation gain in meters.
 * @param {number} distance - Total distance in kilometers.
 * @returns {'flat' | 'moderate' | 'hilly' | 'mountain'}
 */
export function getElevationProfile(elevationGain, distance) {
    if (distance <= 0) return 'flat'; // Avoid division by zero or negative distance
    const elevationPer10k = (elevationGain / distance) * 10;
    if (elevationPer10k < 50) return 'flat';
    if (elevationPer10k < 150) return 'moderate';
    if (elevationPer10k < 300) return 'hilly';
    return 'mountain';
}

/**
 * Determines the pace profile for a given run.
 * @param {number} averagePace - Average pace in min/km.
 * @returns {'recovery' | 'easy' | 'tempo' | 'race'}
 */
export function getPaceProfile(averagePace) {
    if (averagePace <= 0) return 'easy'; // Default for pace 0 or negative
    if (averagePace > 6.0) return 'recovery';
    if (averagePace >= 5.5) return 'easy'; // 5:30-6:00
    if (averagePace >= 4.5) return 'tempo'; // 4:30-5:30
    return 'race'; // <4:30
}

/**
 * Analyzes usage patterns for a specific shoe based on its processed run sessions.
 * @param {Shoe} shoe
 * @param {RunSession[]} processedShoeRuns - Run sessions already processed with effectiveDistance for THIS shoe.
 * @returns {{totalUses: number, totalDistance: number, totalEffectiveDistance: number, averageDistancePerUse: number, usesPerWeek: number, lastUseDate: Date | null}}
 */
export function analyzeUsagePattern(shoe, processedShoeRuns) {
    const recentSessions = processedShoeRuns
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Last 30 days analysis for forecasting trend
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRuns = recentSessions.filter(run => new Date(run.date).getTime() >= thirtyDaysAgo.getTime());

    const totalDistance = recentRuns.reduce((sum, run) => sum + (run.distance || 0), 0);
    const totalEffectiveDistance = recentRuns.reduce((sum, run) => sum + (run.effectiveDistance || 0), 0);

    return {
        totalUses: recentRuns.length,
        totalDistance: totalDistance,
        totalEffectiveDistance: totalEffectiveDistance,
        averageDistancePerUse: recentRuns.length > 0 ? totalDistance / recentRuns.length : 0,
        usesPerWeek: (recentRuns.length / 30) * 7, // Average uses per week over last 30 days
        lastUseDate: recentRuns[0]?.date || (shoe.lastUseDate || null)
    };
}

/**
 * Forecasts the replacement date for a shoe.
 * @param {Shoe} shoe
 * @param {{totalUses: number, totalDistance: number, totalEffectiveDistance: number, averageDistancePerUse: number, usesPerWeek: number, lastUseDate: Date | null}} usagePattern
 * @param {RunSession[]} processedShoeRuns - All processed run sessions for THIS shoe.
 * @returns {{forecastDate: Date, weeksRemaining: number, weeklyRate: number, confidence: number} | null}
 */
export function forecastReplacement(shoe, usagePattern, processedShoeRuns) {
    const BASE_LIFESPAN = shoe.customLifespanKm || 1050; // Use custom lifespan if available, otherwise default

    const currentEffectiveKm = shoe.effectiveKilometers || 0;
    const remainingEffectiveLife = Math.max(0, BASE_LIFESPAN - currentEffectiveKm);

    if (remainingEffectiveLife <= 0) {
        return {
            forecastDate: new Date(), // Already due for replacement
            weeksRemaining: 0,
            weeklyRate: 0,
            confidence: 100
        };
    }

    let weeklyEffectiveRate;

    // Prioritize recent usage for forecasting
    if (usagePattern.totalEffectiveDistance > 0 && usagePattern.totalUses > 0) {
        // Calculate average weekly effective distance from the last 30 days
        weeklyEffectiveRate = (usagePattern.totalEffectiveDistance / 30) * 7;
    } else {
        // Fallback to historical average if no recent usage in the last 30 days
        if (processedShoeRuns.length === 0 || !shoe.firstUseDate) {
             return null; // Cannot forecast if no runs or first use date
        }
        const shoeAgeMs = new Date().getTime() - new Date(shoe.firstUseDate).getTime();
        const shoeAgeWeeks = shoeAgeMs / (7 * 24 * 60 * 60 * 1000);

        if (shoeAgeWeeks <= 0) return null; // Avoid division by zero or negative age

        weeklyEffectiveRate = (shoe.effectiveKilometers || 0) / shoeAgeWeeks;
    }

    return forecastWithWeeklyRate(remainingEffectiveLife, weeklyEffectiveRate);
}

/**
 * Helper for forecastReplacement to calculate date based on remaining KM and weekly rate.
 * @param {number} remainingKm
 * @param {number} weeklyRate
 * @returns {{forecastDate: Date, weeksRemaining: number, weeklyRate: number, confidence: number} | null}
 */
function forecastWithWeeklyRate(remainingKm, weeklyRate) {
    if (weeklyRate <= 0) return null; // Cannot forecast if no usage

    const weeksRemaining = remainingKm / weeklyRate;
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + (weeksRemaining * 7));

    // Simple confidence calculation: higher weekly rate, more confidence in projection
    const confidence = Math.min(100, (Math.abs(weeklyRate) / 50) * 100); // e.g., 50km/week effective is 100% confidence
    return {
        forecastDate,
        weeksRemaining,
        weeklyRate,
        confidence
    };
}

/**
 * Classifies the replacement urgency of a shoe.
 * @param {Shoe} shoe
 * @param {{forecastDate: Date | null} | null} forecast
 * @returns {'low' | 'medium' | 'high' | 'critical'}
 */
export function calculateUrgency(shoe, forecast) {
    const BASE_LIFESPAN = shoe.customLifespanKm || 1050;
    const lifespanPercentage = (shoe.effectiveKilometers / BASE_LIFESPAN) * 100;

    if (shoe.retired) return 'low'; // Retired shoes have low urgency for replacement

    if (lifespanPercentage >= 100) return 'critical'; // Exceeded lifespan
    if (lifespanPercentage >= 90) return 'high';     // Nearing lifespan end
    if (lifespanPercentage >= 70) return 'medium';    // Approaching 70% of lifespan

    // Time-based urgency for "healthy" shoes that are still far from lifespan limit
    if (forecast && forecast.forecastDate) {
        const daysUntilReplacement = (forecast.forecastDate.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000);
        if (daysUntilReplacement < 0) return 'critical'; // Forecast date is in the past
        if (daysUntilReplacement < 30) return 'high';   // Less than 1 month to replacement
        if (daysUntilReplacement < 90) return 'medium';  // Less than 3 months to replacement
    }

    return 'low'; // Default to low urgency
}

/**
 * Calculates the total effective distance for a list of runs.
 * @param {RunSession[]} runs - List of already processed run sessions (with effectiveDistance).
 * @returns {number}
 */
export function calculateTotalEffectiveDistance(runs) {
    return runs.reduce((sum, run) => sum + (run.effectiveDistance || 0), 0);
}

/**
 * Determines the overall wear profile for a shoe based on its runs.
 * @param {RunSession[]} runs - List of already processed run sessions for the specific shoe.
 * @returns {{elevation: 'flat' | 'moderate' | 'hilly' | 'mountain', pace: 'recovery' | 'easy' | 'tempo' | 'race', surface: 'track' | 'road' | 'trail' | 'mixed'}}
 */
export function calculateAverageWearProfile(runs) {
    if (runs.length === 0) {
        return { elevation: 'flat', pace: 'easy', surface: 'road' }; // Default profiles
    }

    let totalElevationGain = 0; // Sum of elevation gain
    let totalDistanceForProfile = 0; // Sum of distance for average elevation profile
    let totalPaceValue = 0; // Sum of pace values
    let paceCount = 0; // Count of runs with valid pace
    const surfaceCounts = { 'track': 0, 'road': 0, 'trail': 0, 'mixed': 0 };

    runs.forEach(run => {
        if (run.distance > 0) {
            totalElevationGain += run.elevationGain;
            totalDistanceForProfile += run.distance;

            if (run.averagePace > 0) {
                totalPaceValue += run.averagePace;
                paceCount++;
            }
        }
        if (run.surfaceType) {
            if (surfaceCounts[run.surfaceType] !== undefined) {
                surfaceCounts[run.surfaceType]++;
            } else {
                surfaceCounts['mixed']++; // Categorize unknown as mixed
            }
        }
    });

    const avgElevationPer10k = totalDistanceForProfile > 0 ? (totalElevationGain / totalDistanceForProfile) * 10 : 0;
    const avgPace = paceCount > 0 ? totalPaceValue / paceCount : 0;

    let dominantSurface = 'road'; // Default
    let maxSurfaceCount = 0;
    for (const type in surfaceCounts) {
        if (surfaceCounts[type] > maxSurfaceCount) {
            maxSurfaceCount = surfaceCounts[type];
            dominantSurface = type;
        }
    }

    return {
        elevation: getElevationProfile(avgElevationPer10k, 10), // Pass 10km for relative calculation
        pace: getPaceProfile(avgPace),
        surface: dominantSurface
    };
}


/**
 * Initializes a shoe profile from Strava gear data, calculates effective distances for its runs,
 * and determines its overall wear profile.
 * @param {object} stravaGear - The raw gear object from Strava API.
 * @param {object[]} rawStravaRunsForShoe - Raw Strava activity objects associated with this shoe.
 * @returns {{shoe: Shoe, runsWithEffectiveDistance: RunSession[]}} The initialized shoe object and its processed runs.
 */
export function initializeShoeProfile(stravaGear, rawStravaRunsForShoe = []) {
    // Load custom data from localStorage
    const customData = JSON.parse(localStorage.getItem(`gear-custom-${stravaGear.id}`) || '{}');
    const customPrice = customData.price ?? 0; // Default price to 0 if not set
    const customLifespan = customData.durationKm ?? 700; // Default lifespan to 700km if not set

    // Convert raw Strava runs to our RunSession format and calculate effective distance
    const processedRuns = rawStravaRunsForShoe.map(run => {
        // Estimate surfaceType and intensity from Strava data (Strava doesn't provide this directly)
        let surfaceType = 'road'; // Default to road
        // You might infer 'trail' from activity name, description, or segment info if available
        if (run.name.toLowerCase().includes('trail')) surfaceType = 'trail';

        const averagePace = run.moving_time > 0 && run.distance > 0 ? (run.moving_time / 60) / (run.distance / 1000) : 0; // min/km

        const runSession = {
            id: run.id.toString(),
            shoeId: stravaGear.id,
            date: new Date(run.start_date_local),
            distance: run.distance / 1000, // Convert meters to kilometers
            duration: run.moving_time / 60, // Convert seconds to minutes
            averagePace: averagePace,
            elevationGain: run.total_elevation_gain,
            surfaceType: surfaceType, // Estimated
            intensity: getPaceProfile(averagePace), // Estimated from pace
            effectiveDistance: 0, // Calculated below
        };
        runSession.effectiveDistance = calculateEffectiveDistance(runSession);
        return runSession;
    }).sort((a,b) => a.date.getTime() - b.date.getTime()); // Ensure runs are sorted chronologically

    // Calculate total effective kilometers for the shoe
    const totalEffectiveKm = calculateTotalEffectiveDistance(processedRuns);
    const totalActualKm = processedRuns.reduce((sum, run) => sum + run.distance, 0);

    // Determine the overall wear profile for the shoe
    const wearProfile = calculateAverageWearProfile(processedRuns);

    // Initialize the Shoe object
    const shoe = {
        id: stravaGear.id,
        name: stravaGear.name || `${stravaGear.brand_name} ${stravaGear.model_name}`,
        brand: stravaGear.brand_name || 'N/A',
        model: stravaGear.model_name || 'N/A',
        totalDistance: totalActualKm,
        totalUses: processedRuns.length,
        costPerKm: customPrice > 0 && totalActualKm > 0 ? (customPrice / totalActualKm) : 0,
        lastUseDate: processedRuns.length > 0 ? processedRuns[processedRuns.length - 1].date : null,
        firstUseDate: processedRuns.length > 0 ? processedRuns[0].date : null,
        purchaseDate: stravaGear.bought_at ? new Date(stravaGear.bought_at) : null,
        purchasePrice: customPrice,
        retired: stravaGear.retired,
        primary: stravaGear.primary,
        customLifespanKm: customLifespan,
        elevationProfile: wearProfile.elevation,
        paceProfile: wearProfile.pace,
        surfaceProfile: wearProfile.surface,
        effectiveKilometers: totalEffectiveKm,
        wearMultiplier: 1.0, // This could be calculated as average of (effectiveKm / actualKm)
        status: 'healthy', // Placeholder, calculated later by `getShoeStatus`
        forecastedReplacement: null, // Placeholder, calculated later
        replacementUrgency: 'low', // Placeholder, calculated later
    };

    return { shoe, runsWithEffectiveDistance: processedRuns };
}

/**
 * Gets shoe status based on effective kilometers and replacement urgency.
 * @param {Shoe} shoe
 * @returns {'healthy' | 'warning' | 'critical' | 'retired'}
 */
export function getShoeStatus(shoe) {
    if (shoe.retired) return 'retired';
    if (shoe.replacementUrgency === 'critical') return 'critical';
    if (shoe.replacementUrgency === 'high') return 'warning';

    // If we have an effective lifespan, we can check percentage
    const BASE_LIFESPAN = shoe.customLifespanKm || 1050;
    if (shoe.effectiveKilometers >= BASE_LIFESPAN * 0.95) return 'critical'; // More aggressive critical threshold
    if (shoe.effectiveKilometers >= BASE_LIFESPAN * 0.8) return 'warning'; // Warning threshold
    if (shoe.effectiveKilometers >= BASE_LIFESPAN) return 'critical'; // Definitely critical if exceeded
    return 'healthy';
}