import { pool, extractFromFrame, extractFromAudio, condition, computeDeltaMap, getStats } from './entropy.ts';
import { runAllTests, estimateMinEntropy } from './nist.ts';
import { randomNumber, generatePassword, rollDice } from './generators.ts';
import { encrypt, decrypt, canEncrypt } from './crypto.ts';
import { renderLavaHeatmap, createHeatmapLUT } from './visualization.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const video = $("video") as HTMLVideoElement;
const canvas = $("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
const lavaCanvas = $("lavaCanvas") as HTMLCanvasElement;

const W = 160, H = 120;
canvas.width = W;
canvas.height = H;

let prevFrame: Uint8ClampedArray | null = null;
let running = false;
let micRunning = false;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let videoStream: MediaStream | null = null;

let lastEntropyEstimationRawBits: number[] = [];
let nistTimer: number = 0;

function setStatus(s: string) { $("status").textContent = s; }

async function startCamera() {
    if (running) {
        // Stop
        running = false;
        videoStream?.getTracks().forEach(t => t.stop());
        videoStream = null;
        $("startBtn").innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg> Start Camera`;
        $("videoLabel").textContent = "Camera Off";
        $("startBtn").classList.remove("active");
        lavaCanvas.classList.remove("active");
        setStatus("Camera stopped.");
        return;
    }

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: W, height: H } });
        video.srcObject = videoStream;
        await video.play();
        running = true;
        
        $("startBtn").innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop Camera`;
        $("videoLabel").textContent = "";
        $("startBtn").classList.add("active");
        lavaCanvas.classList.add("active");
        
        setStatus("Harvesting entropy from your camera...");
        requestAnimationFrame(loop);
    } catch (e) {
        setStatus("Camera unavailable: " + (e as Error).message);
    }
}

async function toggleMic() {
    if (micRunning) {
        micRunning = false;
        micStream?.getTracks().forEach(t => t.stop());
        audioContext?.close();
        audioContext = null;
        analyser = null;
        $("micBtn").classList.remove("active");
        setStatus(running ? "Camera entropy active." : "All sources stopped.");
        return;
    }

    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(micStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        
        micRunning = true;
        $("micBtn").classList.add("active");
        setStatus("Harvesting entropy from microphone...");
        
        if (!running) {
            requestAnimationFrame(loop);
        }
    } catch (e) {
        setStatus("Microphone unavailable: " + (e as Error).message);
    }
}

function loop() {
    if (!running && !micRunning) return;

    let rawBits: number[] = [];

    if (running && video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, W, H);
        const frame = ctx.getImageData(0, 0, W, H).data;

        if (prevFrame) {
            const camBits = extractFromFrame(frame, prevFrame);
            rawBits.push(...camBits);
            
            // Visualization
            const deltaMap = computeDeltaMap(frame, prevFrame, W, H);
            renderLavaHeatmap(lavaCanvas, deltaMap, W, H);
        }
        prevFrame = frame.slice();
    }

    if (micRunning && analyser) {
        const floatData = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatTimeDomainData(floatData);
        const micBits = extractFromAudio(floatData);
        rawBits.push(...micBits);
    }

    if (rawBits.length > 0) {
        lastEntropyEstimationRawBits.push(...rawBits);
        if (lastEntropyEstimationRawBits.length > 4096) {
            // Keep last N bits for min-entropy estimation
            lastEntropyEstimationRawBits = lastEntropyEstimationRawBits.slice(-4096);
        }
        condition(rawBits);
        renderStats();
    }

    requestAnimationFrame(loop);
}

function renderStats() {
    const stats = getStats();
    $("byteCount").textContent = String(stats.totalBytes);
    const balance = stats.bitCount ? ((stats.ones / stats.bitCount) * 100).toFixed(2) + "%" : "--";
    $("bitBalance").textContent = balance;
    $("poolSize").textContent = String(pool.size());

    // Update hex stream
    const last = pool.lastN(32);
    if (last.length > 0) {
        $("stream").textContent = Array.from(last).map(b => b.toString(16).padStart(2, "0")).join(" ");
    }
}

function updateNistTests() {
    if (pool.size() < 256) return;

    const testBytes = pool.lastN(2048); // max 2KB for tests
    const results = runAllTests(testBytes);
    
    const resultsContainer = $("nistResults");
    resultsContainer.innerHTML = "";
    
    for (const res of results) {
        const passClass = res.passed ? 'pass' : 'fail';
        const pValDisplay = res.pValue.toFixed(6);
        resultsContainer.innerHTML += `
            <div class="nist-test-card ${passClass}">
                <div class="nist-badge ${passClass}">${res.passed ? 'PASS' : 'FAIL'}</div>
                <div class="nist-test-name">${res.name} <span class="nist-test-pval">(p = ${pValDisplay})</span></div>
            </div>
        `;
    }

    if (lastEntropyEstimationRawBits.length >= 1024) {
        const ent = estimateMinEntropy(lastEntropyEstimationRawBits);
        $("minEntropy").textContent = ent.bitsPerSample.toFixed(2);
        
        const warningEl = $("entropyWarning");
        const warningText = $("entropyWarningText");
        
        if (ent.warning) {
            warningEl.hidden = false;
            warningText.textContent = ent.warning;
        } else {
            warningEl.hidden = true;
        }
    }
}

function showGen(text: string) { $("genOut").textContent = text; }

// --- UI Binding ---
$("startBtn").addEventListener("click", startCamera);
$("micBtn").addEventListener("click", toggleMic);

$("genNumber").addEventListener("click", () => {
    showGen("Random number (1-100): " + randomNumber(pool.take, 1, 100));
    renderStats();
});

$("genPassword").addEventListener("click", () => {
    showGen("Password: " + generatePassword(pool.take, 20));
    renderStats();
});

$("genDice").addEventListener("click", () => {
    showGen("Dice roll: " + rollDice(pool.take, 6));
    renderStats();
});

$("download").addEventListener("click", () => {
    const data = pool.take(1024);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chaoseed-random.bin";
    a.click();
    URL.revokeObjectURL(url);
    showGen("Downloaded 1 KB of random bytes.");
    renderStats();
});

$("encryptBtn").addEventListener("click", () => {
    const plain = ($("plaintext") as HTMLTextAreaElement).value;
    if (!plain) {
        $("encryptStatus").textContent = "Enter plaintext to encrypt.";
        $("encryptStatus").className = "encrypt-status error";
        return;
    }
    if (!canEncrypt(pool.size())) {
        $("encryptStatus").textContent = "Not enough entropy in the pool (need 56 bytes). Wait or add motion.";
        $("encryptStatus").className = "encrypt-status error";
        return;
    }
    
    try {
        const enc = encrypt(plain, pool.take);
        ($("cipherOut") as HTMLTextAreaElement).value = enc.ciphertext;
        $("keyHex").textContent = enc.key;
        $("nonceHex").textContent = enc.nonce;
        $("keyDisplay").hidden = false;
        $("encryptStatus").textContent = "Encrypted successfully with true random key/nonce.";
        $("encryptStatus").className = "encrypt-status success";
        renderStats();
    } catch (e: any) {
        $("encryptStatus").textContent = "Error: " + e.message;
        $("encryptStatus").className = "encrypt-status error";
    }
});

$("decryptBtn").addEventListener("click", () => {
    const cipher = ($("cipherOut") as HTMLTextAreaElement).value;
    const key = $("keyHex").textContent || "";
    const nonce = $("nonceHex").textContent || "";
    
    if (!cipher || !key || !nonce) {
        $("encryptStatus").textContent = "Missing ciphertext, key, or nonce.";
        $("encryptStatus").className = "encrypt-status error";
        return;
    }
    
    try {
        const plain = decrypt(cipher, key, nonce);
        ($("plaintext") as HTMLTextAreaElement).value = plain;
        $("encryptStatus").textContent = "Decrypted successfully.";
        $("encryptStatus").className = "encrypt-status success";
    } catch (e: any) {
        $("encryptStatus").textContent = "Decryption failed: " + e.message;
        $("encryptStatus").className = "encrypt-status error";
    }
});

setInterval(updateNistTests, 2000);
