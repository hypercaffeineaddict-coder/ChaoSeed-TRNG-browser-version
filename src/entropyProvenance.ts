/**
 * Entropy Provenance Tracking
 * 
 * This module tracks the contribution of each entropy source to the overall entropy pool.
 * It provides visualization data showing where randomness comes from.
 */

export interface EntropySourceMetrics {
    name: string;
    bitsContributed: number;
    bytesContributed: number;
    percentage: number;
    active: boolean;
    lastUpdate: number;
}

export interface EntropyProvenanceState {
    camera: EntropySourceMetrics;
    microphone: EntropySourceMetrics;
    webcrypto: EntropySourceMetrics;
    cosmic: EntropySourceMetrics;
    mouse: EntropySourceMetrics;
    keyboard: EntropySourceMetrics;
    timing: EntropySourceMetrics;
    network: EntropySourceMetrics;
}

const provenanceState: EntropyProvenanceState = {
    camera: {
        name: "Camera",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    },
    microphone: {
        name: "Microphone",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    },
    webcrypto: {
        name: "WebCrypto",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: true, // Always active as fallback
        lastUpdate: 0
    },
    cosmic: {
        name: "Cosmic Data",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    },
    mouse: {
        name: "Mouse Movement",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    },
    keyboard: {
        name: "Keyboard Timing",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    },
    timing: {
        name: "Frame Timing",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    },
    network: {
        name: "Network Jitter",
        bitsContributed: 0,
        bytesContributed: 0,
        percentage: 0,
        active: false,
        lastUpdate: 0
    }
};

/**
 * Record entropy contribution from a specific source.
 */
export function recordEntropyContribution(source: keyof EntropyProvenanceState, bits: number): void {
    const metric = provenanceState[source];
    const bytes = Math.ceil(bits / 8);
    metric.bitsContributed += bits;
    metric.bytesContributed += bytes;
    metric.lastUpdate = Date.now();
    updatePercentages();
}

/**
 * Mark a source as active or inactive.
 */
export function setSourceActive(source: keyof EntropyProvenanceState, active: boolean): void {
    provenanceState[source].active = active;
    updatePercentages();
}

/**
 * Update percentage contributions based on total bits.
 */
function updatePercentages(): void {
    const totalBits = Object.values(provenanceState).reduce((sum, m) => sum + m.bitsContributed, 0);
    if (totalBits === 0) {
        Object.values(provenanceState).forEach(m => m.percentage = 0);
        return;
    }
    Object.values(provenanceState).forEach(m => {
        m.percentage = (m.bitsContributed / totalBits) * 100;
    });
}

/**
 * Get the current entropy provenance state.
 */
export function getProvenanceState(): EntropyProvenanceState {
    return provenanceState;
}

/**
 * Get provenance data formatted for visualization (sorted by contribution).
 */
export function getProvenanceForVisualization(): Array<{ name: string; percentage: number; color: string }> {
    const colors = [
        "#FF6B6B", // Camera - Red
        "#4ECDC4", // Microphone - Teal
        "#45B7D1", // WebCrypto - Blue
        "#FFA07A", // Cosmic - Light Salmon
        "#98D8C8", // Mouse - Mint
        "#F7DC6F", // Keyboard - Yellow
        "#BB8FCE", // Timing - Purple
        "#85C1E2"  // Network - Light Blue
    ];

    const sources = Object.entries(provenanceState)
        .filter(([_, m]) => m.percentage > 0 || m.active)
        .map(([key, m], idx) => ({
            name: m.name,
            percentage: Math.round(m.percentage * 10) / 10, // Round to 1 decimal
            color: colors[idx % colors.length]
        }))
        .sort((a, b) => b.percentage - a.percentage);

    return sources;
}

/**
 * Get a summary of active sources.
 */
export function getActiveSources(): string[] {
    return Object.entries(provenanceState)
        .filter(([_, m]) => m.active)
        .map(([_, m]) => m.name);
}

/**
 * Get the number of active entropy sources.
 */
export function getActiveSourceCount(): number {
    return Object.values(provenanceState).filter(m => m.active).length;
}

/**
 * Reset all provenance metrics (useful for testing or restarting).
 */
export function resetProvenance(): void {
    Object.values(provenanceState).forEach(m => {
        m.bitsContributed = 0;
        m.bytesContributed = 0;
        m.percentage = 0;
        m.lastUpdate = 0;
    });
}

/**
 * Get detailed statistics about entropy provenance.
 */
export function getProvenanceStats(): {
    totalBits: number;
    totalBytes: number;
    activeSources: number;
    dominantSource: string | null;
    lastUpdate: number;
} {
    const totalBits = Object.values(provenanceState).reduce((sum, m) => sum + m.bitsContributed, 0);
    const totalBytes = Object.values(provenanceState).reduce((sum, m) => sum + m.bytesContributed, 0);
    const activeSources = Object.values(provenanceState).filter(m => m.active).length;
    
    let dominantSource: string | null = null;
    let maxBits = 0;
    for (const m of Object.values(provenanceState)) {
        if (m.bitsContributed > maxBits) {
            maxBits = m.bitsContributed;
            dominantSource = m.name;
        }
    }

    const lastUpdate = Math.max(...Object.values(provenanceState).map(m => m.lastUpdate));

    return {
        totalBits,
        totalBytes,
        activeSources,
        dominantSource,
        lastUpdate
    };
}

/**
 * Format provenance data as a human-readable string.
 */
export function formatProvenanceReport(): string {
    const stats = getProvenanceStats();
    const visualization = getProvenanceForVisualization();

    let report = `Entropy Provenance Report\n`;
    report += `========================\n`;
    report += `Total Bits: ${stats.totalBits}\n`;
    report += `Total Bytes: ${stats.totalBytes}\n`;
    report += `Active Sources: ${stats.activeSources}\n`;
    report += `Dominant Source: ${stats.dominantSource || "None"}\n\n`;
    report += `Source Breakdown:\n`;
    report += `----------------\n`;

    for (const source of visualization) {
        report += `${source.name}: ${source.percentage.toFixed(1)}%\n`;
    }

    return report;
}
