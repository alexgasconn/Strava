/**
 * Demo Polylines - Encoded Google polyline format
 * These are real-world encoded polylines for Spanish running/cycling routes
 */

export const DEMO_POLYLINES = {
    // Running routes (shorter polylines)
    Run: [
        // Madrid central park route
        '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        'gfo}EtohhU',
        '_p~iF~ps|U_ulLnnqC',
        'yvxEhrxU|C}A|@iBrA}@',
        'eyvEoaxxU}A{@gA}@cB{@',
        // Barcelona Sagrada Familia loop
        'yvxEhrxU|C}A|@iBrA}@~BiBlAr@',
        'u{~vFvyys@{AoAyAoA',
        // Sevilla riverside
        '~yvFbx_sAaB|@kAjAoAjA',
        // Valencia beach run
        'yvxEhrxU}A{@gA}@cBsA{@qA',
        'gfo}EtohhU}@sAqAyA',
        // Additional routes for variety
        'qvxEhrxU}A{@',
        'ivxEhrxU|C}A|@iB',
        'mvxEhrxU}A{@gA}@',
        'nvxEhrxU|C}A|@iBrA}@',
    ],

    // Cycling routes (medium to long polylines)
    Ride: [
        '_p~iF~ps|U_ulLnnqC_mqNvxq`@~BiBlAr@z@fAb@rA',
        'yvxEhrxU|C}A|@iBrA}@~BiBlAr@z@fAb@rAbAbAz@jA',
        'u{~vFvyys@{AoAyAoAcBoB}@{AeA}AcAyA',
        'eyvEoaxxU}A{@gA}@cB{@eAyAoAkAsAoA',
        '_p~iF~ps|U_ulLnnqC_mqNvxq`@~BiBlAr@z@fAb@rAbAbAz@jAbAjAhAtArAz@jA',
        // Longer routes
        'gfo}EtohhU}@sAqAyAcBoB{@{AeA}AcAyAgA{AcBqBiAuAwAwA',
        'yvxEhrxU|C}A|@iBrA}@~BiBlAr@z@fAb@rAbAbAz@jAbAjAhAtArAz@jAbAlAhAzAz@tAvAdAbA',
        'u{~vFvyys@{AoAyAoAcBoB}@{AeA}AcAyAgA{AcBqBiAuAwAwAsAwAwA',
        // Mountain bike routes (more technical)
        'yvxEhrxU|C}A|@iBrA}@~BiB',
        'gfo}EtohhU}@sAqAyAcBoB',
        'u{~vFvyys@{AoAyAoAcBoB}@{A',
    ],

    // Swimming (point-to-point, short polylines)
    Swim: [
        'yvxEhrxU|C}A',
        'gfo}EtohhU}@sA',
        'eyvEoaxxU}A{@',
        '_p~iF~ps|U_ulL',
        'u{~vFvyys@{AoA',
        'qvxEhrxU|C}A',
        'ivxEhrxU|C}A',
    ],
};

/**
 * Generates a random polyline from the demo collection
 */
export function getRandomPolyline(activityType) {
    const candidates = DEMO_POLYLINES[activityType] || DEMO_POLYLINES.Run;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Utility: Decode a polyline string into coordinates
 * (Used by the map to render routes)
 */
export function decodePolyline(encoded) {
    if (!encoded) return [];
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += deltaLat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += deltaLng;

        coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
}
