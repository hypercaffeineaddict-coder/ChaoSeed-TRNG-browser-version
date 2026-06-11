/**
 * Cosmic Entropy Provider
 * 
 * This module integrates data from NASA APIs as contextual salt for entropy mixing.
 * IMPORTANT: NASA data is deterministic and NOT a source of true randomness.
 * It is used only as additional mixer input to enhance the entropy pool.
 * 
 * Supported sources:
 * - NASA APOD (Astronomy Picture of the Day) metadata
 * - NASA NEO (Near-Earth Object) data
 * - Space Weather data
 * - ISS Telemetry
 */

import { sha3_512 } from "@noble/hashes/sha3";

export interface CosmicEntropySource {
    name: string;
    enabled: boolean;
    lastFetch: number | null;
    fetchInterval: number; // milliseconds
    data: string; // stringified data for hashing
}

export interface CosmicEntropyState {
    apod: CosmicEntropySource;
    neo: CosmicEntropySource;
    spaceWeather: CosmicEntropySource;
    issPosition: CosmicEntropySource;
}

const cosmicState: CosmicEntropyState = {
    apod: {
        name: "NASA APOD",
        enabled: false,
        lastFetch: null,
        fetchInterval: 86400000, // 24 hours
        data: ""
    },
    neo: {
        name: "NASA NEO",
        enabled: false,
        lastFetch: null,
        fetchInterval: 3600000, // 1 hour
        data: ""
    },
    spaceWeather: {
        name: "Space Weather",
        enabled: false,
        lastFetch: null,
        fetchInterval: 1800000, // 30 minutes
        data: ""
    },
    issPosition: {
        name: "ISS Telemetry",
        enabled: false,
        lastFetch: null,
        fetchInterval: 300000, // 5 minutes
        data: ""
    }
};

/**
 * Fetch APOD (Astronomy Picture of the Day) metadata from NASA.
 * Uses public NASA API (no key required for basic usage).
 */
async function fetchAPOD(): Promise<string> {
    try {
        const response = await fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // Extract metadata: date, title, explanation hash
        return JSON.stringify({
            date: data.date,
            title: data.title,
            url: data.url,
            copyright: data.copyright || "N/A"
        });
    } catch (e) {
        console.warn("Failed to fetch APOD:", e);
        return "";
    }
}

/**
 * Fetch NEO (Near-Earth Object) data from NASA.
 * Gets today's close approaches.
 */
async function fetchNEO(): Promise<string> {
    try {
        const today = new Date().toISOString().split("T")[0];
        const response = await fetch(
            `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&api_key=DEMO_KEY`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // Extract: count of near-earth objects, their velocities, distances
        const neoCount = data.element_count || 0;
        const neoData = data.near_earth_objects?.[today] || [];
        const summary = {
            count: neoCount,
            objectCount: neoData.length,
            velocities: neoData.slice(0, 5).map((obj: any) => ({
                name: obj.name,
                velocity: obj.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second || 0,
                distance: obj.close_approach_data?.[0]?.miss_distance?.kilometers || 0
            }))
        };
        return JSON.stringify(summary);
    } catch (e) {
        console.warn("Failed to fetch NEO:", e);
        return "";
    }
}

/**
 * Fetch space weather data from NOAA (via proxy or direct API).
 * This is a placeholder; actual implementation depends on available APIs.
 */
async function fetchSpaceWeather(): Promise<string> {
    try {
        // Placeholder: In a real scenario, this would call NOAA or similar API
        // For now, we use a timestamp-based approach as a proof-of-concept
        const timestamp = Date.now();
        const response = await fetch("https://api.weather.gov/alerts/active?point=38.8951,-77.0369");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return JSON.stringify({
            timestamp,
            alertCount: data.features?.length || 0
        });
    } catch (e) {
        console.warn("Failed to fetch space weather:", e);
        return "";
    }
}

/**
 * Fetch ISS position data.
 * Uses the Open Notify API (no key required).
 */
async function fetchISSPosition(): Promise<string> {
    try {
        const response = await fetch("http://api.open-notify.org/iss-now.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return JSON.stringify({
            timestamp: data.timestamp,
            latitude: data.iss_position?.latitude,
            longitude: data.iss_position?.longitude
        });
    } catch (e) {
        console.warn("Failed to fetch ISS position:", e);
        return "";
    }
}

/**
 * Enable a specific cosmic entropy source.
 */
export function enableCosmicSource(sourceName: keyof CosmicEntropyState): void {
    const source = cosmicState[sourceName];
    if (source) {
        source.enabled = true;
        console.log(`Enabled cosmic entropy source: ${source.name}`);
    }
}

/**
 * Disable a specific cosmic entropy source.
 */
export function disableCosmicSource(sourceName: keyof CosmicEntropyState): void {
    const source = cosmicState[sourceName];
    if (source) {
        source.enabled = false;
        console.log(`Disabled cosmic entropy source: ${source.name}`);
    }
}

/**
 * Update cosmic entropy data if the fetch interval has elapsed.
 * This is called periodically from the main loop.
 */
export async function updateCosmicEntropy(): Promise<void> {
    const now = Date.now();

    if (cosmicState.apod.enabled && (!cosmicState.apod.lastFetch || now - cosmicState.apod.lastFetch > cosmicState.apod.fetchInterval)) {
        cosmicState.apod.data = await fetchAPOD();
        cosmicState.apod.lastFetch = now;
    }

    if (cosmicState.neo.enabled && (!cosmicState.neo.lastFetch || now - cosmicState.neo.lastFetch > cosmicState.neo.fetchInterval)) {
        cosmicState.neo.data = await fetchNEO();
        cosmicState.neo.lastFetch = now;
    }

    if (cosmicState.spaceWeather.enabled && (!cosmicState.spaceWeather.lastFetch || now - cosmicState.spaceWeather.lastFetch > cosmicState.spaceWeather.fetchInterval)) {
        cosmicState.spaceWeather.data = await fetchSpaceWeather();
        cosmicState.spaceWeather.lastFetch = now;
    }

    if (cosmicState.issPosition.enabled && (!cosmicState.issPosition.lastFetch || now - cosmicState.issPosition.lastFetch > cosmicState.issPosition.fetchInterval)) {
        cosmicState.issPosition.data = await fetchISSPosition();
        cosmicState.issPosition.lastFetch = now;
    }
}

/**
 * Get the current cosmic entropy data as a concatenated string.
 * This is used as contextual salt for mixing into the entropy pool.
 */
export function getCosmicEntropyData(): string {
    const enabledSources = Object.values(cosmicState)
        .filter(s => s.enabled && s.data)
        .map(s => s.data)
        .join("|");
    return enabledSources;
}

/**
 * Mix cosmic entropy data into the entropy pool.
 * This function takes the current entropy pool bytes and cosmic data,
 * hashes them together, and returns the mixed result.
 * 
 * IMPORTANT: This is NOT a replacement for true entropy; it's a contextual salt.
 */
export function mixCosmicEntropy(poolBytes: Uint8Array): Uint8Array {
    const cosmicData = getCosmicEntropyData();
    if (!cosmicData) {
        // No cosmic data available; return the pool bytes unchanged
        return poolBytes;
    }

    // Encode cosmic data as UTF-8
    const encoder = new TextEncoder();
    const cosmicBytes = encoder.encode(cosmicData);

    // Concatenate pool bytes and cosmic bytes
    const combined = new Uint8Array(poolBytes.length + cosmicBytes.length);
    combined.set(poolBytes, 0);
    combined.set(cosmicBytes, poolBytes.length);

    // Hash the combined data using SHA-3-512 and truncate to pool size
    const hash = sha3_512(combined);
    const mixed = new Uint8Array(poolBytes.length);
    mixed.set(hash.slice(0, poolBytes.length));

    return mixed;
}

/**
 * Get the current state of all cosmic entropy sources.
 * Useful for UI display and status monitoring.
 */
export function getCosmicEntropyState(): CosmicEntropyState {
    return cosmicState;
}

/**
 * Get the contribution percentage of cosmic entropy to the total entropy pool.
 * This is a simplified estimate; in practice, it depends on how often cosmic data is mixed.
 */
export function getCosmicEntropyContribution(): number {
    // Count enabled sources
    const enabledCount = Object.values(cosmicState).filter(s => s.enabled).length;
    // Return a percentage based on enabled sources (0-10% contribution)
    // This is a conservative estimate; actual contribution depends on mixing frequency
    return enabledCount > 0 ? Math.min(10, enabledCount * 2.5) : 0;
}
