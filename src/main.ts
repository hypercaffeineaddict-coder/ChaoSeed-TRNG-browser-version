// ChaoSeed - browser TRNG. Harvests entropy from webcam chaos, conditions it with
// SHA-3, mixes with the OS CSPRNG, and lets you use the randomness.
//
// This is a RUNNABLE FOUNDATION. The rigorous parts (marked TODO(you)) are where the
// real engineering - and your Hackatime hours - go. Keep building!

import { sha3_256 } from "@noble/hashes/sha3";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const video = $("video") as HTMLVideoElement;
const canvas = $("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

// Entropy != megapixels: capture at LOW resolution. The randomness comes from
// inter-frame change + sensor noise, not from pixel count.
const W = 160, H = 120;
canvas.width = W;
canvas.height = H;

const pool: number[] = [];        // conditioned random bytes, ready to use
let prevFrame: Uint8ClampedArray | null = null;
let rawBuf: number[] = [];        // raw low-bit noise awaiting conditioning
let totalBytes = 0;
let ones = 0, bitCount = 0;       // for a simple bit-balance (monobit) stat
let running = false;

function setStatus(s: string) { $("status").textContent = s; }

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: W, height: H } });
    video.srcObject = stream;
    await video.play();
    running = true;
    setStatus("Harvesting entropy from your camera...");
    requestAnimationFrame(loop);
  } catch (e) {
    setStatus("Camera unavailable: " + (e as Error).message);
  }
}

function loop() {
  if (!running) return;
  ctx.drawImage(video, 0, 0, W, H);
  const frame = ctx.getImageData(0, 0, W, H).data;

  // --- extract: low bits of the per-pixel delta (motion + sensor shot noise) ---
  if (prevFrame) {
    for (let i = 0; i < frame.length; i += 4) {
      const d =
        ((frame[i] ^ prevFrame[i]) & 1) |
        (((frame[i + 1] ^ prevFrame[i + 1]) & 1) << 1) |
        (((frame[i + 2] ^ prevFrame[i + 2]) & 1) << 2);
      if (d !== 0) rawBuf.push(d & 0xff);
      // TODO(you): add von Neumann debiasing to remove bias before conditioning.
    }
  }
  prevFrame = frame.slice();

  // --- condition: hash the raw noise into uniform bytes, then mix with OS RNG ---
  if (rawBuf.length >= 1024) {
    const raw = Uint8Array.from(rawBuf.splice(0, rawBuf.length));
    const block = sha3_256(raw);                       // SHA-3 extractor
    const os = crypto.getRandomValues(new Uint8Array(block.length)); // never weaker than OS
    for (let i = 0; i < block.length; i++) {
      const b = block[i] ^ os[i];
      pool.push(b);
      totalBytes++;
      for (let k = 0; k < 8; k++) { ones += (b >> k) & 1; bitCount++; }
    }
    render();
  }
  // TODO(you): NIST SP 800-22 tests (monobit, runs, ...) + a real min-entropy estimate.
  requestAnimationFrame(loop);
}

function render() {
  const last = pool.slice(-32).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  $("stream").textContent = last;
  $("byteCount").textContent = String(totalBytes);
  const balance = bitCount ? ((ones / bitCount) * 100).toFixed(2) + "%" : "--";
  $("bitBalance").textContent = balance;
}

// Draw n bytes from the pool (falls back to the OS RNG if the pool is low).
function takeBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = pool.length ? pool.shift()! : crypto.getRandomValues(new Uint8Array(1))[0];
  }
  return out;
}

function showGen(text: string) { $("genOut").textContent = text; }

// --- generators (consume the entropy pool) ---
function randomNumber() {
  const b = takeBytes(4);
  const v = new DataView(b.buffer).getUint32(0) % 100 + 1;
  showGen("Random number (1-100): " + v);
}

function password() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const b = takeBytes(20);
  let pw = "";
  for (const x of b) pw += charset[x % charset.length];
  showGen("Password: " + pw);
}

function dice() {
  const b = takeBytes(1);
  showGen("Dice roll: " + (b[0] % 6 + 1));
}

function download() {
  const blob = new Blob([takeBytes(1024)], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "chaoseed-random.bin";
  a.click();
  showGen("Downloaded 1 KB of random bytes.");
}

$("startBtn").addEventListener("click", startCamera);
$("genNumber").addEventListener("click", randomNumber);
$("genPassword").addEventListener("click", password);
$("genDice").addEventListener("click", dice);
$("download").addEventListener("click", download);

// TODO(you) - milestones to build next (each = real hours + a devlog):
//  M3: implement NIST SP 800-22 monobit + runs tests; show pass/fail live.
//  M3: estimate min-entropy and bound the output rate by it (don't overclaim).
//  M4: von Neumann debiasing; add a "lava" visualisation of the entropy.
//  M4: extra sources (microphone, a double-pendulum simulation as a no-camera fallback).
//  Stretch: encrypt a message/file with the entropy (XChaCha20-Poly1305).
