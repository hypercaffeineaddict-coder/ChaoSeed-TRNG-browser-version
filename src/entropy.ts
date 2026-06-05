import { sha3_256 } from "@noble/hashes/sha3";

const MAX_POOL = 65536; // 64 KB pool limit
const MAX_RAW = 131072; // Limit for raw unconditioned buffer

const _pool = new Uint8Array(MAX_POOL);
let _poolStart = 0;
let _poolEnd = 0;
let _poolSize = 0;

let _totalBytes = 0;
let _ones = 0;
let _bitCount = 0;

let _rawBuf: number[] = [];

export const pool = {
    push: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) {
            if (_poolSize < MAX_POOL) {
                _pool[_poolEnd] = bytes[i];
                _poolEnd = (_poolEnd + 1) % MAX_POOL;
                _poolSize++;
            } else {
                // Overwrite oldest if pool is full (ring buffer behavior)
                _pool[_poolEnd] = bytes[i];
                _poolStart = (_poolStart + 1) % MAX_POOL;
                _poolEnd = (_poolEnd + 1) % MAX_POOL;
            }
        }
    },
    take: (n: number): Uint8Array => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (_poolSize > 0) {
                out[i] = _pool[_poolStart];
                _poolStart = (_poolStart + 1) % MAX_POOL;
                _poolSize--;
            } else {
                // Fallback to OS CSPRNG if pool is empty
                out[i] = crypto.getRandomValues(new Uint8Array(1))[0];
            }
        }
        return out;
    },
    size: (): number => _poolSize,
    lastN: (n: number): Uint8Array => {
        const takeN = Math.min(n, _poolSize);
        const out = new Uint8Array(takeN);
        for (let i = 0; i < takeN; i++) {
            // Read backwards from end
            let idx = _poolEnd - 1 - i;
            if (idx < 0) idx += MAX_POOL;
            out[takeN - 1 - i] = _pool[idx];
        }
        return out;
    }
};

export function getStats() {
    return { totalBytes: _totalBytes, ones: _ones, bitCount: _bitCount };
}

/**
 * Von Neumann debiasing.
 * Reads bits in pairs:
 * (0,1) -> 0
 * (1,0) -> 1
 * (0,0), (1,1) -> discard
 */
export function vonNeumannDebias(bits: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < bits.length - 1; i += 2) {
        const b1 = bits[i];
        const b2 = bits[i + 1];
        if (b1 === 0 && b2 === 1) {
            out.push(0);
        } else if (b1 === 1 && b2 === 0) {
            out.push(1);
        }
    }
    return out;
}

/**
 * Extracts raw bits from a video frame delta.
 * Returns debiased bits.
 */
export function extractFromFrame(frame: Uint8ClampedArray, prevFrame: Uint8ClampedArray): number[] {
    const rawBits: number[] = [];
    for (let i = 0; i < frame.length; i += 4) {
        // We take the LSB of the XOR difference of R, G, B channels
        const dR = (frame[i] ^ prevFrame[i]) & 1;
        const dG = (frame[i + 1] ^ prevFrame[i + 1]) & 1;
        const dB = (frame[i + 2] ^ prevFrame[i + 2]) & 1;
        
        rawBits.push(dR, dG, dB);
    }
    return vonNeumannDebias(rawBits);
}

/**
 * Extracts raw bits from audio samples (microphone).
 */
export function extractFromAudio(samples: Float32Array): number[] {
    const rawBits: number[] = [];
    for (let i = 0; i < samples.length; i++) {
        // Convert float [-1.0, 1.0] to an integer-like representation by looking at the mantissa bits
        // A simple way is to view the Float32 as a Uint32 and take the LSB
        const view = new DataView(samples.buffer);
        const intVal = view.getUint32(i * 4, true);
        rawBits.push(intVal & 1);
    }
    return vonNeumannDebias(rawBits);
}

/**
 * Conditions raw bits into bytes, hashing them and mixing with OS CSPRNG.
 */
export function condition(rawBits: number[]): void {
    if (_rawBuf.length < MAX_RAW) {
        _rawBuf.push(...rawBits);
        if (_rawBuf.length > MAX_RAW) {
            _rawBuf.length = MAX_RAW; // cap it
        }
    }

    // Condition when we have at least 2048 bits (256 bytes)
    while (_rawBuf.length >= 2048) {
        const bitsToCondition = _rawBuf.splice(0, 2048);
        
        // Pack bits into bytes
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 2048; i++) {
            if (bitsToCondition[i]) {
                bytes[Math.floor(i / 8)] |= (1 << (i % 8));
            }
        }
        
        // SHA-3 extraction
        const block = sha3_256(bytes);
        
        // Mix with OS RNG
        const os = crypto.getRandomValues(new Uint8Array(block.length));
        const finalBlock = new Uint8Array(block.length);
        
        for (let i = 0; i < block.length; i++) {
            const b = block[i] ^ os[i];
            finalBlock[i] = b;
            
            _totalBytes++;
            // Count bits for stats
            for (let k = 0; k < 8; k++) {
                _ones += (b >> k) & 1;
                _bitCount++;
            }
        }
        
        pool.push(finalBlock);
    }
}

/**
 * Computes a visual delta map.
 */
export function computeDeltaMap(frame: Uint8ClampedArray, prevFrame: Uint8ClampedArray, width: number, height: number): Uint8Array {
    const deltaMap = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < frame.length; i += 4, j++) {
        const dR = Math.abs(frame[i] - prevFrame[i]);
        const dG = Math.abs(frame[i + 1] - prevFrame[i + 1]);
        const dB = Math.abs(frame[i + 2] - prevFrame[i + 2]);
        const sum = dR + dG + dB;
        deltaMap[j] = sum > 255 ? 255 : sum;
    }
    return deltaMap;
}
