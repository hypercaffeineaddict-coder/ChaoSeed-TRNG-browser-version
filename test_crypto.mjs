import { xchacha20poly1305 } from '@noble/ciphers/chacha';

const key = new Uint8Array(32);
const nonce = new Uint8Array(24);
const plaintext = "Hello World";

const encoder = new TextEncoder();
const messageUint8 = encoder.encode(plaintext);

try {
    const cipher = xchacha20poly1305(key, nonce);
    const ciphertextBytes = cipher.encrypt(messageUint8);
    console.log("Encrypted:", ciphertextBytes);
    
    const plaintextBytes = cipher.decrypt(ciphertextBytes);
    const decoder = new TextDecoder();
    console.log("Decrypted:", decoder.decode(plaintextBytes));
} catch (e) {
    console.error("Error:", e);
}
