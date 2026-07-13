# 🎬 Taiba Video Editor

A **100% browser-based video editor**. Import a video, trim it, change the aspect
ratio, adjust speed, add captions, and export to MP4 / WebM / GIF / MP3 — all
without uploading anything to a server. Your files never leave your device.

Powered by [**ffmpeg.wasm**](https://github.com/ffmpegwasm/ffmpeg.wasm) — the same
FFmpeg engine that desktop editors use, compiled to WebAssembly and running
entirely inside the browser.

## ✨ Features

- **Import** — drag & drop or pick a file (MP4, MOV, WebM, MKV…)
- **Trim / cut** — dual-handle timeline with a live playhead
- **Aspect ratio / crop** — Original, 16:9, 9:16 (Reels/TikTok), 1:1, 4:5, 4:3 (centered crop)
- **Speed** — 0.5× … 2× (video + audio kept in sync via `atempo`)
- **Captions** — add text with position, colour, size and an optional dark backdrop
  (rendered on a canvas and composited with FFmpeg's `overlay`, so it works without
  any bundled font)
- **Mute** audio
- **Resolution & quality** — downscale to 1080/720/480/360p and a quality slider
  (mapped to CRF) to control file size
- **Export** — MP4 (H.264), WebM (VP9), GIF (with a proper palette), or MP3 (audio only)

Everything runs client-side. There is **no backend, no upload, and no watermark**.

## 🚀 Getting started

```bash
npm install     # also copies the ffmpeg.wasm core into public/ffmpeg/
npm run dev      # start the dev server
```

Then open the printed URL (default http://localhost:5173).

### Build for production

```bash
npm run build    # type-checks, copies the core, and bundles into dist/
npm run preview  # preview the production build locally
```

## 🧠 How it works

1. `scripts/setup-core.mjs` copies the ffmpeg.wasm **ESM core** (`ffmpeg-core.js` +
   `ffmpeg-core.wasm`, ~32 MB) out of `node_modules` into `public/ffmpeg/` so it is
   served **same-origin** — no CDN, no CORS, no external requests at runtime.
2. The app loads the engine once (lazily, on first export) inside a Web Worker.
3. Each edit is compiled into **a single FFmpeg command** and run on the video:
   - `-ss`/`-t` for trimming
   - `overlay` for the caption PNG
   - `crop` → `setpts` → `scale` for framing/speed/resolution
   - `atempo` for audio speed
   - `libx264` / `libvpx-vp9` / `palettegen+paletteuse` / `libmp3lame` for output
4. The app first probes the source for an audio track (`ffmpeg -i`) so it never
   references a non-existent audio stream.

### Cross-origin isolation

`vite.config.ts` sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the dev and preview servers. These
enable `SharedArrayBuffer` (used by the multi-threaded core). The single-threaded
core shipped here works without them, but if you deploy this app **make sure your
host sends those two headers** for best performance.

## 🗂️ Project structure

```
src/
  App.tsx          UI: import, preview, trim, controls, export, result
  lib/ffmpeg.ts    ffmpeg.wasm engine: loading, audio probe, command builder
  lib/overlay.ts   renders captions to a transparent PNG via <canvas>
  styles.css       dark, CapCut-style UI
scripts/
  setup-core.mjs   copies the ffmpeg core into public/ (runs before dev/build)
  e2e.mjs          headless-browser smoke test of the full export pipeline
```

## 🧪 Tech

React 19 · TypeScript · Vite 6 · ffmpeg.wasm (`@ffmpeg/ffmpeg` + `@ffmpeg/core`)

## 📄 License

FFmpeg / ffmpeg.wasm are licensed under their respective licenses (LGPL/GPL). This
project bundles the ffmpeg.wasm core at runtime from `node_modules`.
