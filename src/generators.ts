export function randomNumber(takeBytes: (n: number) => Uint8Array, min: number, max: number): number {
  const range = max - min + 1;
  // Rejection sampling to avoid modulo bias
  const limit = Math.floor(0x100000000 / range) * range;
  
  while (true) {
    const b = takeBytes(4);
    const view = new DataView(b.buffer);
    const val = view.getUint32(0, true); // little-endian
    
    if (val < limit) {
      return (val % range) + min;
    }
  }
}

export function generatePassword(takeBytes: (n: number) => Uint8Array, length: number = 20): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*-_+=?";
  const range = charset.length;
  const limit = Math.floor(256 / range) * range;
  
  let pw = "";
  while (pw.length < length) {
    const b = takeBytes(1);
    if (b[0] < limit) {
      pw += charset[b[0] % range];
    }
  }
  return pw;
}

export function rollDice(takeBytes: (n: number) => Uint8Array, sides: number = 6): number {
  const limit = Math.floor(256 / sides) * sides;
  
  while (true) {
    const b = takeBytes(1);
    if (b[0] < limit) {
      return (b[0] % sides) + 1;
    }
  }
}
