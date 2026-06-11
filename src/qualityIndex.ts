/**
 * ChaosSeed Quality Index (CQI)
 * 
 * A composite metric that aggregates various indicators of TRNG quality
 * into a single, easily understandable score and grade.
 * 
 * CQI Components:
 * - Entropy Quality (35%): Min-entropy, Shannon entropy, bias detection
 * - NIST Results (30%): Pass/fail rates of NIST statistical tests
 * - Bias Resistance (15%): Frequency distribution uniformity
 * - Correlation (10%): Autocorrelation and cross-correlation metrics
 * - Source Diversity (10%): Number and variety of active entropy sources
 */

export interface CQIMetrics {
    entropyQuality: number; // 0-100
    nistResults: number; // 0-100
    biasResistance: number; // 0-100
    correlation: number; // 0-100
    sourceDiversity: number; // 0-100
}

export interface CQIScore {
    score: number; // 0-100
    grade: string; // A+, A, B+, B, C+, C, D, F
    metrics: CQIMetrics;
    timestamp: number;
    description: string;
}

/**
 * Calculate entropy quality score based on min-entropy and Shannon entropy.
 * Higher entropy = higher score.
 */
export function calculateEntropyQualityScore(minEntropy: number, shannonEntropy: number = 0): number {
    // Min-entropy should ideally be close to 1.0 (1 bit per sample)
    // Normalize to 0-100 scale
    const minEntropyScore = Math.min(100, minEntropy * 100);
    
    // If Shannon entropy is provided, average it with min-entropy score
    if (shannonEntropy > 0) {
        const shannonScore = Math.min(100, shannonEntropy * 100);
        return (minEntropyScore + shannonScore) / 2;
    }
    
    return minEntropyScore;
}

/**
 * Calculate NIST test score based on pass/fail rates.
 * All tests passing = 100, each failure reduces the score.
 */
export function calculateNISTScore(passCount: number, totalCount: number): number {
    if (totalCount === 0) return 0;
    const passRate = passCount / totalCount;
    // Convert pass rate to 0-100 scale
    return passRate * 100;
}

/**
 * Calculate bias resistance score based on bit balance.
 * Ideal balance is 50% ones and 50% zeros.
 * Score decreases as balance deviates from 50%.
 */
export function calculateBiasResistanceScore(bitBalance: number): number {
    // bitBalance is a percentage (0-100)
    // Ideal is 50%
    const deviation = Math.abs(bitBalance - 50);
    // Maximum acceptable deviation: 10% (40-60% range)
    // Score = 100 - (deviation * 10)
    const score = Math.max(0, 100 - (deviation * 10));
    return score;
}

/**
 * Calculate correlation score based on autocorrelation metrics.
 * Lower autocorrelation = higher score (more random).
 * This is a placeholder; actual implementation would use detailed autocorrelation data.
 */
export function calculateCorrelationScore(autocorrelation: number): number {
    // autocorrelation is expected to be in range [0, 1]
    // 0 = no correlation (ideal), 1 = perfect correlation (worst)
    // Score = (1 - autocorrelation) * 100
    return Math.max(0, (1 - autocorrelation) * 100);
}

/**
 * Calculate source diversity score based on the number of active entropy sources.
 * More sources = higher score (up to a maximum).
 */
export function calculateSourceDiversityScore(activeSources: number, maxSources: number = 6): number {
    // Normalize to 0-100 scale
    // At least 2 sources should be active for a good score
    if (activeSources < 2) return 20; // Minimum score if fewer than 2 sources
    const score = (activeSources / maxSources) * 100;
    return Math.min(100, score);
}

/**
 * Calculate the overall ChaosSeed Quality Index (CQI).
 */
export function calculateCQI(metrics: CQIMetrics): CQIScore {
    // Weighted average of all metrics
    const weightedScore =
        (metrics.entropyQuality * 0.35) +
        (metrics.nistResults * 0.30) +
        (metrics.biasResistance * 0.15) +
        (metrics.correlation * 0.10) +
        (metrics.sourceDiversity * 0.10);

    // Determine grade based on score
    let grade: string;
    if (weightedScore >= 95) grade = "A+";
    else if (weightedScore >= 90) grade = "A";
    else if (weightedScore >= 85) grade = "B+";
    else if (weightedScore >= 80) grade = "B";
    else if (weightedScore >= 75) grade = "C+";
    else if (weightedScore >= 70) grade = "C";
    else if (weightedScore >= 60) grade = "D";
    else grade = "F";

    // Generate description based on score
    let description: string;
    if (weightedScore >= 95) description = "Excellent randomness quality. Suitable for cryptographic applications.";
    else if (weightedScore >= 85) description = "Good randomness quality. Suitable for most applications.";
    else if (weightedScore >= 75) description = "Fair randomness quality. Recommended for non-critical applications.";
    else if (weightedScore >= 60) description = "Poor randomness quality. Not recommended for cryptographic use.";
    else description = "Very poor randomness quality. Investigate entropy sources.";

    return {
        score: Math.round(weightedScore * 10) / 10, // Round to 1 decimal place
        grade,
        metrics,
        timestamp: Date.now(),
        description
    };
}

/**
 * Format CQI score for display.
 */
export function formatCQIScore(cqi: CQIScore): string {
    return `CQI: ${cqi.score}/100 (Grade: ${cqi.grade}) - ${cqi.description}`;
}

/**
 * Get a detailed breakdown of CQI metrics for UI display.
 */
export function getCQIBreakdown(cqi: CQIScore): Array<{ label: string; value: number; percentage: string }> {
    return [
        { label: "Entropy Quality", value: cqi.metrics.entropyQuality, percentage: "35%" },
        { label: "NIST Results", value: cqi.metrics.nistResults, percentage: "30%" },
        { label: "Bias Resistance", value: cqi.metrics.biasResistance, percentage: "15%" },
        { label: "Correlation", value: cqi.metrics.correlation, percentage: "10%" },
        { label: "Source Diversity", value: cqi.metrics.sourceDiversity, percentage: "10%" }
    ];
}
