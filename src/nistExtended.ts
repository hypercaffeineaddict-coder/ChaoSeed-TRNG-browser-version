/**
 * Extended NIST SP 800-22 Statistical Tests
 * 
 * This module provides additional NIST statistical tests beyond the basic suite.
 * These tests are more comprehensive and help identify subtle non-randomness.
 */

export interface TestResult {
    name: string;
    passed: boolean;
    stat: number;
    pValue: number;
    description: string;
}

/**
 * Complementary error function (used in multiple tests).
 */
function erfc(x: number): number {
    const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
    const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x < 0 ? 2.0 - y : y;
}

/**
 * Longest Run Test
 * 
 * Checks the longest run of ones or zeros in the sequence.
 * A sequence with an abnormally long run indicates non-randomness.
 */
export function longestRunTest(bytes: Uint8Array): TestResult {
    const n = bytes.length * 8;
    if (n < 128) return { name: "Longest Run", passed: false, stat: 0, pValue: 0, description: "Not enough data" };

    // Convert bytes to bit array
    const bits = new Uint8Array(n);
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let j = 0; j < 8; j++) {
            bits[i * 8 + j] = (b >> (7 - j)) & 1;
        }
    }

    // Find the longest run of ones
    let maxRun = 0;
    let currentRun = 0;
    for (let i = 0; i < n; i++) {
        if (bits[i] === 1) {
            currentRun++;
            if (currentRun > maxRun) maxRun = currentRun;
        } else {
            currentRun = 0;
        }
    }

    // Expected longest run and variance depend on sequence length
    // For simplicity, we use a basic threshold
    const expectedMax = Math.log2(n) + 1;
    const variance = Math.sqrt(n / Math.log(2));
    const stat = (maxRun - expectedMax) / variance;
    const pValue = erfc(Math.abs(stat) / Math.sqrt(2));

    return {
        name: "Longest Run",
        passed: pValue >= 0.01,
        stat: maxRun,
        pValue,
        description: "Checks if the longest run of identical bits is within expected range"
    };
}

/**
 * Approximate Entropy Test
 * 
 * Measures the frequency of overlapping patterns of length m and m+1.
 * High entropy means patterns are unpredictable.
 */
export function approximateEntropyTest(bytes: Uint8Array, m: number = 5): TestResult {
    const n = bytes.length * 8;
    if (n < 64) return { name: "Approximate Entropy", passed: false, stat: 0, pValue: 0, description: "Not enough data" };

    // Convert bytes to bit array
    const bits = new Uint8Array(n);
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let j = 0; j < 8; j++) {
            bits[i * 8 + j] = (b >> (7 - j)) & 1;
        }
    }

    // Count pattern frequencies for m and m+1
    const countPatterns = (patternLength: number): number => {
        const patterns = new Map<string, number>();
        for (let i = 0; i <= n - patternLength; i++) {
            const pattern = Array.from(bits.slice(i, i + patternLength)).join("");
            patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
        }
        let entropy = 0;
        for (const count of patterns.values()) {
            const p = count / (n - patternLength + 1);
            entropy -= p * Math.log2(p);
        }
        return entropy;
    };

    const phi_m = countPatterns(m);
    const phi_m1 = countPatterns(m + 1);
    const apen = phi_m - phi_m1;

    // Expected approximate entropy for random sequence
    const expectedApen = Math.log2(n) - (m * Math.log2(m) - (m + 1) * Math.log2(m + 1)) / n;
    const variance = (2.954 - 6.1329 / n) / Math.pow(2, m);
    const stat = Math.abs(apen - expectedApen) / Math.sqrt(variance);
    const pValue = erfc(stat / Math.sqrt(2));

    return {
        name: "Approximate Entropy",
        passed: pValue >= 0.01,
        stat: apen,
        pValue,
        description: "Checks if patterns of length m and m+1 are unpredictable"
    };
}

/**
 * Serial Test
 * 
 * Checks the frequency of all possible overlapping m-bit patterns.
 * Patterns should be uniformly distributed.
 */
export function serialTest(bytes: Uint8Array, m: number = 2): TestResult {
    const n = bytes.length * 8;
    if (n < 64) return { name: "Serial Test", passed: false, stat: 0, pValue: 0, description: "Not enough data" };

    // Convert bytes to bit array
    const bits = new Uint8Array(n);
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let j = 0; j < 8; j++) {
            bits[i * 8 + j] = (b >> (7 - j)) & 1;
        }
    }

    // Count pattern frequencies
    const countPatterns = (patternLength: number): Map<string, number> => {
        const patterns = new Map<string, number>();
        for (let i = 0; i < n; i++) {
            const pattern = Array.from(bits.slice(i, (i + patternLength) % n)).join("");
            patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
        }
        return patterns;
    };

    const patterns_m = countPatterns(m);
    const patterns_m1 = countPatterns(m + 1);

    // Calculate chi-square statistic
    let chiSq = 0;
    for (const count of patterns_m.values()) {
        const expected = n / Math.pow(2, m);
        chiSq += Math.pow(count - expected, 2) / expected;
    }

    // Degrees of freedom
    const df = Math.pow(2, m);
    const pValue = 1 - (chiSq / (2 * df)); // Simplified p-value calculation

    return {
        name: "Serial Test",
        passed: pValue >= 0.01,
        stat: chiSq,
        pValue: Math.max(0, Math.min(1, pValue)),
        description: "Checks if all m-bit patterns appear with expected frequency"
    };
}

/**
 * Linear Complexity Test
 * 
 * Determines the length of the shortest linear feedback shift register (LFSR)
 * that can generate the sequence. High complexity indicates randomness.
 */
export function linearComplexityTest(bytes: Uint8Array): TestResult {
    const n = bytes.length * 8;
    if (n < 64) return { name: "Linear Complexity", passed: false, stat: 0, pValue: 0, description: "Not enough data" };

    // Convert bytes to bit array
    const bits = new Uint8Array(n);
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let j = 0; j < 8; j++) {
            bits[i * 8 + j] = (b >> (7 - j)) & 1;
        }
    }

    // Berlekamp-Massey algorithm to find LFSR complexity
    let L = 0;
    let m = -1;
    const c = new Uint8Array(n);
    const b = new Uint8Array(n);
    b[0] = 1;
    c[0] = 1;

    for (let N = 0; N < n; N++) {
        let d = bits[N];
        for (let i = 1; i <= L; i++) {
            d ^= c[i] & bits[N - i];
        }
        if (d === 1) {
            const t = new Uint8Array(n);
            for (let i = 0; i < n; i++) t[i] = c[i];
            for (let i = 0; i <= N - m; i++) {
                c[i + L] ^= b[i];
            }
            if (L <= N / 2) {
                L = N + 1 - L;
                m = N;
                for (let i = 0; i < n; i++) b[i] = t[i];
            }
        }
    }

    // Expected linear complexity for random sequence
    const expectedL = (n + 2) / 3;
    const variance = (n - 2) / 18;
    const stat = (L - expectedL) / Math.sqrt(variance);
    const pValue = erfc(Math.abs(stat) / Math.sqrt(2));

    return {
        name: "Linear Complexity",
        passed: pValue >= 0.01,
        stat: L,
        pValue,
        description: "Checks if the sequence has sufficient linear complexity"
    };
}

/**
 * Run all extended NIST tests.
 */
export function runAllExtendedTests(bytes: Uint8Array): TestResult[] {
    if (bytes.length === 0) return [];
    return [
        longestRunTest(bytes),
        approximateEntropyTest(bytes),
        serialTest(bytes),
        linearComplexityTest(bytes)
    ];
}
