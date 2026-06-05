# ChaoSeed

> Randomness from chaos - watch it, prove it, use it.

A browser **true random number generator** that harvests entropy from physical chaos. Point
your webcam at anything chaotic (your hand, water, smoke, a lamp, or just sensor noise) and
ChaoSeed turns the unpredictable motion into random bytes, proves they're random with live
statistics, and lets you actually use them. Inspired by Cloudflare's wall of lava lamps.

## What it does
1. **Capture** - webcam at low resolution (entropy comes from change + sensor noise, not megapixels).
2. **Generate** - per-pixel frame deltas -> **SHA-3** conditioning -> random bytes, mixed with the OS RNG.
3. **Prove** - live entropy/bit-balance meter + (planned) NIST SP 800-22 tests.
4. **Use** - generate passwords, numbers, dice, or download raw random bytes.

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5173, click **Start camera**, and allow webcam access.

## Deploy (free live demo URL)
```bash
npm run build
```
Deploy the `dist/` folder to **Netlify**, **Vercel**, or **GitHub Pages**.

## Roadmap (each item = real hours + a devlog)
- [x] **M1** - scaffold + UI
- [x] **M2** - capture -> extract -> SHA-3 conditioning -> pool + generators
- [ ] **M3** - NIST SP 800-22 tests (monobit, runs) + a real min-entropy estimate
- [ ] **M4** - von Neumann debiasing + a "lava" entropy visualisation + extra sources (mic, double-pendulum sim)
- [ ] **Stretch** - encrypt a message/file with the entropy (XChaCha20-Poly1305)

## Honest note
ChaoSeed is **educational / demonstrative**. Entropy is mixed with the operating system's
CSPRNG, so the output is **never weaker than the system RNG**. Conditioning does **not**
create entropy - the usable random output is bounded by the real physical min-entropy.

## License
MIT - see [LICENSE](LICENSE).
