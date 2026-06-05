export interface TestResult {
    name: string;
    passed: boolean;
    stat: number;
    pValue: number;
    description: string;
}

function erfc(x: number): number {
    const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
    const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x < 0 ? 2.0 - y : y;
}

function logGamma(x: number): number {
    const p = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278224757,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];
    let y = x;
    let tmp = x + 7.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = p[0];
    for (let i = 1; i < p.length; i++) {
        y++;
        ser += p[i] / y;
    }
    return Math.log(2.5066282746310005 * ser / x) - tmp;
}

function igamSeries(a: number, x: number): number {
    let sum = 1.0 / a;
    let term = 1.0 / a;
    let n = 1;
    while (term > 1e-15) {
        term *= x / (a + n);
        sum += term;
        n++;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function igamCfrac(a: number, x: number): number {
    let b = x + 1 - a;
    let c = 1 / 1.0e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 100; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = b + an / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function igamc(a: number, x: number): number {
    if (x < 0 || a <= 0) return 0;
    if (x < a + 1) {
        return 1 - igamSeries(a, x);
    } else {
        return igamCfrac(a, x);
    }
}

export function monobitTest(bytes: Uint8Array): TestResult {
    const n = bytes.length * 8;
    if (n === 0) return { name: "Monobit", passed: false, stat: 0, pValue: 0, description: "No data" };
    
    let ones = 0;
    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        for (let j = 0; j < 8; j++) {
            ones += (b >> j) & 1;
        }
    }
    const zeros = n - ones;
    const s_obs = Math.abs(ones - zeros) / Math.sqrt(n);
    const pValue = erfc(s_obs / Math.sqrt(2));
    
    return {
        name: "Monobit",
        passed: pValue >= 0.01,
        stat: s_obs,
        pValue: pValue,
        description: "Checks if proportion of 1s and 0s is close to 0.5"
    };
}

export function runsTest(bytes: Uint8Array): TestResult {
    const n = bytes.length * 8;
    if (n === 0) return { name: "Runs", passed: false, stat: 0, pValue: 0, description: "No data" };

    let ones = 0;
    const bitArr = new Uint8Array(n);
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let j = 0; j < 8; j++) {
            const bit = (b >> (7 - j)) & 1;
            bitArr[i * 8 + j] = bit;
            ones += bit;
        }
    }

    const pi = ones / n;
    const threshold = 2 / Math.sqrt(n);
    if (Math.abs(pi - 0.5) >= threshold) {
        return { name: "Runs", passed: false, stat: 0, pValue: 0.0, description: "Monobit prerequisite failed" };
    }

    let v_obs = 1;
    for (let i = 1; i < n; i++) {
        if (bitArr[i] !== bitArr[i - 1]) v_obs++;
    }

    const pValue = erfc(Math.abs(v_obs - 2 * n * pi * (1 - pi)) / (2 * Math.sqrt(2 * n) * pi * (1 - pi)));

    return {
        name: "Runs",
        passed: pValue >= 0.01,
        stat: v_obs,
        pValue: pValue,
        description: "Checks if uninterrupted sequences of identical bits are within expectations"
    };
}

export function frequencyWithinBlockTest(bytes: Uint8Array, blockSizeBits: number = 128): TestResult {
    const n = bytes.length * 8;
    const numBlocks = Math.floor(n / blockSizeBits);
    if (numBlocks === 0) return { name: "Frequency Within Block", passed: false, stat: 0, pValue: 0, description: "Not enough data" };

    let chiSq = 0;
    for (let i = 0; i < numBlocks; i++) {
        let ones = 0;
        for (let j = 0; j < blockSizeBits; j++) {
            const bitIdx = i * blockSizeBits + j;
            const byteIdx = Math.floor(bitIdx / 8);
            const bitOffset = 7 - (bitIdx % 8);
            ones += (bytes[byteIdx] >> bitOffset) & 1;
        }
        const pi = ones / blockSizeBits;
        chiSq += 4 * blockSizeBits * Math.pow(pi - 0.5, 2);
    }

    const pValue = igamc(numBlocks / 2, chiSq / 2);

    return {
        name: "Frequency Within Block",
        passed: pValue >= 0.01,
        stat: chiSq,
        pValue: pValue,
        description: "Checks if proportion of 1s in M-bit blocks is approx M/2"
    };
}

export function runAllTests(bytes: Uint8Array): TestResult[] {
    if (bytes.length === 0) return [];
    return [
        monobitTest(bytes),
        runsTest(bytes),
        frequencyWithinBlockTest(bytes)
    ];
}

export function estimateMinEntropy(samples: number[]): { bitsPerSample: number; totalSamples: number; warning: string | null } {
    if (samples.length === 0) return { bitsPerSample: 0, totalSamples: 0, warning: "No samples" };
    
    const counts = new Map<number, number>();
    for (let i = 0; i < samples.length; i++) {
        const val = samples[i];
        counts.set(val, (counts.get(val) || 0) + 1);
    }
    
    let maxCount = 0;
    for (const count of counts.values()) {
        if (count > maxCount) maxCount = count;
    }
    
    const pMax = maxCount / samples.length;
    const minEntropy = -Math.log2(pMax);
    
    let warning = null;
    if (minEntropy < 0.5) {
        warning = 'Very low entropy - source may be static';
    } else if (minEntropy < 1.0) {
        warning = 'Low entropy detected - ensure camera captures motion';
    }
    
    return { bitsPerSample: minEntropy, totalSamples: samples.length, warning };
}
