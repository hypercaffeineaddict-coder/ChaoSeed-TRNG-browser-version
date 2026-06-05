import { encrypt, decrypt } from './src/crypto.ts';

// Mock takeBytes
function takeBytes(n: number): Uint8Array {
    return new Uint8Array(n).fill(1); // dummy key/nonce
}

try {
    const enc = encrypt("Hello World", takeBytes);
    console.log("Encrypted:", enc);
    
    const dec = decrypt(enc.ciphertext, enc.key, enc.nonce);
    console.log("Decrypted:", dec);
} catch (e) {
    console.error("Error:", e);
}
