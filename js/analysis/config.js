/**
 * CONFIGURATION.JS — Default configuration for the analysis engine
 * Customize these values for your specific use case
 */

/**
 * Default athlete profile (can be overridden per user)
 */
export const DEFAULT_ATHLETE_PROFILE = {
    // Heart rate zones
    max_hr: 195,
    lthr: 170,              // Lactate Threshold HR
    hr_rest: 60,

    // Power metrics (cycling)
    ftp: 250,               // Functional Threshold Power (watts)
    threshold_pace: 5.5,    // min/km (running)

    // Physical attributes
    weight: 75,             // kg (for power/kg calculations)
    height: 180,            // cm
    cda: 0.3,               // Drag coefficient * frontal area (cycling)
    crr: 0.004              // Rolling resistance coefficient
};

/**
 * Preprocessing configuration
 */
export const PREPROCESSING_CONFIG = {
    // GPS cleaning
    gps_spike_threshold: 0.1,    // km - max acceptable point jump
    gps_spike_window: 5,          // points considered for interpolation

    // Altitude fixing (Hampel filter)
    altitude_hampel_window: 5,    // window size for outlier detection
    altitude_hampel_sigma: 2.5,   // sigma multiplier for outliers

    // Speed anomalies
    speed_hampel_window: 5,
    speed_hampel_sigma: 2.5,

    // Smoothing windows (for Savitzky-Golay)
    grade_smooth_window: 7,       // for gradient smoothing
    altitude_smooth_window: 5,    // for elevation smoothing
    speed_smooth_window: 7        // for velocity smoothing
};

/**
 * Climb detection configuration
 */
export const CLIMB_DETECTION_CONFIG = {
    min_distance: 0.3,            // km
    min_elevation: 20,            // m
    min_grade: 3,                 // %
    merge_distance: 0.05          // km - merge nearby climbs
};

/**
 * Stop detection configuration
 */
export const STOP_DETECTION_CONFIG = {
    speed_threshold: 0.5,         // km/h
    min_duration: 5               // seconds
};

/**
 * Segmentation configuration
 */
export const SEGMENTATION_CONFIG = {
    distance_segment_km: 1,       // 1km splits
    time_segment_min: 5,          // 5-minute splits
    terrain_segment_distance: 0.1 // km threshold for terrain change
};

/**
 * Fatigue engine configuration
 */
export const FATIGUE_CONFIG = {
    pace_drop_threshold: 0.1,     // 10% drop indicates fatigue
    hr_rise_threshold: 0.05,      // 5% rise indicates fatigue
    cadence_drop_threshold: 0.08, // 8% drop indicates fatigue
    power_drop_threshold: 0.08,   // 8% drop indicates fatigue
    window_size: 60               // seconds for analysis windows
};

/**
 * Aerodynamic engine configuration
 */
export const AERO_CONFIG = {
    default_cda: 0.3,             // Coefficient of drag
    default_mass: 75,             // kg
    air_density: 1.225,           // kg/m³ (sea level)
    crr: 0.004,                   // rolling resistance
    wind_speed: 0,                // km/h (default: no wind)
    wind_direction: 0             // degrees
};

/**
 * Physiology engine configuration
 */
export const PHYSIOLOGY_CONFIG = {
    max_hr: 195,
    lthr: 170,
    hr_rest: 60,
    ftp: 250,
    threshold_pace: 5.5
};

/**
 * Analysis engine features (enable/disable)
 */
export const ANALYSIS_FEATURES = {
    enable_preprocessing: true,
    enable_climb_detection: true,
    enable_stop_detection: true,
    enable_segmentation: true,
    enable_fatigue_analysis: true,
    enable_aero_analysis: false,        // Default off (needs weather data)
    enable_physiology_analysis: true,
    enable_insights: true
};

/**
 * Complete analysis config (combine all)
 */
export const COMPLETE_ANALYSIS_CONFIG = {
    ...ANALYSIS_FEATURES,
    ...PREPROCESSING_CONFIG,
    ...CLIMB_DETECTION_CONFIG,
    ...STOP_DETECTION_CONFIG,
    ...SEGMENTATION_CONFIG,
    ...FATIGUE_CONFIG,
    ...AERO_CONFIG,
    ...PHYSIOLOGY_CONFIG
};

/**
 * Quick analysis config (fast, minimal features)
 */
export const QUICK_ANALYSIS_CONFIG = {
    ...ANALYSIS_FEATURES,
    enable_preprocessing: true,
    enable_segmentation: false,
    enable_fatigue_analysis: false,
    enable_aero_analysis: false
};

/**
 * Deep analysis config (all features)
 */
export const DEEP_ANALYSIS_CONFIG = {
    ...ANALYSIS_FEATURES,
    enable_preprocessing: true,
    enable_climb_detection: true,
    enable_stop_detection: true,
    enable_segmentation: true,
    enable_fatigue_analysis: true,
    enable_aero_analysis: true,
    enable_physiology_analysis: true,
    enable_insights: true
};

/**
 * Per-sport default configurations
 */
export const SPORT_CONFIGS = {
    'Road Running': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...DEEP_ANALYSIS_CONFIG,
        threshold_pace: 5.5
    },

    'Trail Running': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...DEEP_ANALYSIS_CONFIG,
        enable_aero_analysis: false,
        min_grade: 7  // Higher threshold for trail climbs
    },

    'Cycling': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...DEEP_ANALYSIS_CONFIG,
        ftp: 250,
        enable_aero_analysis: true,
        max_hr: 190
    },

    'Mountain Biking': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...DEEP_ANALYSIS_CONFIG,
        ftp: 200,
        enable_aero_analysis: false
    },

    'Hiking': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...DEEP_ANALYSIS_CONFIG,
        max_hr: 180,
        lthr: 150,
        enable_aero_analysis: false,
        min_grade: 5
    },

    'Walking': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...QUICK_ANALYSIS_CONFIG,
        enable_fatigue_analysis: false
    },

    'Swimming': {
        ...DEFAULT_ATHLETE_PROFILE,
        ...QUICK_ANALYSIS_CONFIG,
        enable_climb_detection: false,
        enable_aero_analysis: false
    }
};

/**
 * Feature detection by sport
 */
export const SPORT_FEATURES = {
    'Road Running': {
        pace: true,
        cadence: true,
        power: false,
        hr: true,
        climbs: true,
        fatigue: true,
        technical_terrain: false
    },

    'Trail Running': {
        pace: true,
        cadence: true,
        power: false,
        hr: true,
        climbs: true,
        fatigue: true,
        technical_terrain: true,
        gap: true  // Grade Adjusted Pace
    },

    'Cycling': {
        pace: false,
        cadence: true,
        power: true,
        hr: true,
        climbs: true,
        fatigue: true,
        technical_terrain: false,
        vam: true,
        tss: true
    },

    'Mountain Biking': {
        pace: false,
        cadence: true,
        power: true,
        hr: true,
        climbs: true,
        fatigue: true,
        technical_terrain: true,
        roughness: true,
        suspension: true
    },

    'Hiking': {
        pace: false,
        cadence: false,
        power: false,
        hr: true,
        climbs: true,
        fatigue: false,
        technical_terrain: false,
        vertical_metrics: true
    },

    'Walking': {
        pace: false,
        cadence: false,
        power: false,
        hr: true,
        climbs: false,
        fatigue: false,
        technical_terrain: false
    }
};

/**
 * Stream requirements by sport
 */
export const SPORT_STREAMS = {
    'Road Running': ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'grade_smooth', 'heartrate', 'cadence', 'moving'],
    'Trail Running': ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'grade_smooth', 'heartrate', 'cadence', 'moving'],
    'Cycling': ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'grade_smooth', 'heartrate', 'cadence', 'watts', 'moving'],
    'Mountain Biking': ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'grade_smooth', 'heartrate', 'cadence', 'watts', 'moving'],
    'Hiking': ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'grade_smooth', 'heartrate', 'moving'],
    'Walking': ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'moving'],
    'Swimming': ['time', 'latlng', 'distance']
};

/**
 * Export presets
 */
export const EXPORT_PRESETS = {
    'all': ['gpx', 'csv', 'json'],
    'data': ['csv', 'json'],
    'map': ['gpx'],
    'minimal': ['json']
};

/**
 * Get config for sport type
 */
export function getConfigForSport(sport_type) {
    const sport = Object.keys(SPORT_CONFIGS).find(s =>
        s.toLowerCase().includes(sport_type.toLowerCase())
    );
    return sport ? SPORT_CONFIGS[sport] : COMPLETE_ANALYSIS_CONFIG;
}

/**
 * Get required streams for sport
 */
export function getStreamsForSport(sport_type) {
    const sport = Object.keys(SPORT_STREAMS).find(s =>
        s.toLowerCase().includes(sport_type.toLowerCase())
    );
    return sport ? SPORT_STREAMS[sport] : ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth', 'moving'];
}

// Export all configurations
export default {
    DEFAULT_ATHLETE_PROFILE,
    PREPROCESSING_CONFIG,
    CLIMB_DETECTION_CONFIG,
    STOP_DETECTION_CONFIG,
    SEGMENTATION_CONFIG,
    FATIGUE_CONFIG,
    AERO_CONFIG,
    PHYSIOLOGY_CONFIG,
    ANALYSIS_FEATURES,
    COMPLETE_ANALYSIS_CONFIG,
    QUICK_ANALYSIS_CONFIG,
    DEEP_ANALYSIS_CONFIG,
    SPORT_CONFIGS,
    SPORT_FEATURES,
    SPORT_STREAMS,
    EXPORT_PRESETS,
    getConfigForSport,
    getStreamsForSport
};
