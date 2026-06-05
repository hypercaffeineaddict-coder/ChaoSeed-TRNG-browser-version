import { xchacha20poly1305 } from '@noble/ciphers/chacha';

/**
 * Encrypt plaintext using XChaCha20-Poly1305 with a key and nonce derived from the TRNG pool.
 */
export function encrypt(plaintext: string, takeBytes: (n: number) => Uint8Array): { ciphertext: string; key: string; nonce: string } {
    const key = takeBytes(32);
    const nonce = takeBytes(24);
    
    const encoder = new TextEncoder();
    const messageUint8 = encoder.encode(plaintext);
    
    const cipher = xchacha20poly1305(key, nonce);
    const ciphertextBytes = cipher.encrypt(messageUint8);
    
    // Convert to base64
    const ciphertextBase64 = btoa(String.fromCharCode.apply(null, Array.from(ciphertextBytes)));
    
    // Convert key and nonce to hex strings for display
    const keyHex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    const nonceHex = Array.from(nonce).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return {
        ciphertext: ciphertextBase64,
        key: keyHex,
        nonce: nonceHex
    };
}

/**
 * Decrypt XChaCha20-Poly1305 ciphertext using provided hex key and nonce.
 */
export function decrypt(ciphertextBase64: string, keyHex: string, nonceHex: string): string {
    try {
        const key = new Uint8Array(keyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        const nonce = new Uint8Array(nonceHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        
        if (key.length !== 32) throw new Error("Invalid key length. Must be 32 bytes (64 hex characters).");
        if (nonce.length !== 24) throw new Error("Invalid nonce length. Must be 24 bytes (48 hex characters).");
        
        const ciphertextBytes = new Uint8Array(atob(ciphertextBase64).split('').map(c => c.charCodeAt(0)));
        
        const cipher = xchacha20poly1305(key, nonce);
        const plaintextBytes = cipher.decrypt(ciphertextBytes);
        
        const decoder = new TextDecoder();
        return decoder.decode(plaintextBytes);
    } catch (e: any) {
        throw new Error("Decryption failed: " + e.message);
    }
}

/**
 * Check if the entropy pool has enough bytes for encryption (32 bytes key + 24 bytes nonce).
 */
export function canEncrypt(poolSize: number): boolean {
    return poolSize >= 56;
}
