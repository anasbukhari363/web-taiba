import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

// The ESM core is copied into public/ffmpeg/ by scripts/setup-core.mjs and served
// same-origin. Loading it from our own origin avoids CDN/CORS issues and keeps
// the app self-contained (no external requests at runtime).
const base = import.meta.env.BASE_URL || '/'
const coreURL = `${base}ffmpeg/ffmpeg-core.js`
const wasmURL = `${base}ffmpeg/ffmpeg-core.wasm`

export type OutputFormat = 'mp4' | 'webm' | 'gif' | 'mp3'

export type AspectRatio = {
  label: string
  /** null = keep original framing (no crop) */
  ratio: [number, number] | null
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { label: 'Original', ratio: null },
  { label: '16:9 (Landscape)', ratio: [16, 9] },
  { label: '9:16 (Reels/TikTok)', ratio: [9, 16] },
  { label: '1:1 (Square)', ratio: [1, 1] },
  { label: '4:5 (Portrait)', ratio: [4, 5] },
  { label: '4:3 (Classic)', ratio: [4, 3] },
]

export type TextOverlay = {
  /** animation frames (transparent PNGs at source dimensions) + their framerate */
  frames: Blob[]
  fps: number
}

export type ProcessOptions = {
  file: File
  /** seconds */
  trimStart: number
  /** seconds */
  trimEnd: number
  aspect: [number, number] | null
  /** 0.5 – 2.0 */
  speed: number
  mute: boolean
  /** target height in px; null = keep original */
  targetHeight: number | null
  /** 0 (small file) – 100 (best quality) */
  quality: number
  format: OutputFormat
  overlay: TextOverlay | null
}

export type ProcessResult = {
  blob: Blob
  url: string
  filename: string
  mimeType: string
}

type Listeners = {
  onLog?: (msg: string) => void
  onProgress?: (ratio: number) => void
}

let loadPromise: Promise<FFmpeg> | null = null

// A single set of engine event handlers is registered once at load time; these
// mutable slots let each call swap in its own callbacks without stacking
// duplicate listeners on the engine.
let onLogCb: ((msg: string) => void) | undefined
let onProgressCb: ((ratio: number) => void) | undefined
let logTap: ((msg: string) => void) | undefined

/** Lazily create and load the ffmpeg.wasm engine (loaded once, reused). */
export async function getFFmpeg(listeners: Listeners = {}): Promise<FFmpeg> {
  onLogCb = listeners.onLog
  onProgressCb = listeners.onProgress

  if (loadPromise) return loadPromise

  const engine = new FFmpeg()
  engine.on('log', ({ message }) => {
    logTap?.(message)
    onLogCb?.(message)
  })
  engine.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) onProgressCb?.(Math.max(0, Math.min(1, progress)))
  })

  loadPromise = engine.load({ coreURL, wasmURL }).then(() => engine)
  return loadPromise
}

function extOf(format: OutputFormat): string {
  return format
}

function mimeOf(format: OutputFormat): string {
  switch (format) {
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'gif':
      return 'image/gif'
    case 'mp3':
      return 'audio/mpeg'
  }
}

/** Map the 0–100 quality slider to a codec-appropriate CRF value. */
function qualityToCrf(quality: number, format: OutputFormat): number {
  // Lower CRF = better quality / bigger file.
  const q = Math.max(0, Math.min(100, quality))
  if (format === 'webm') {
    // VP9 sweet spot ~15 (best) .. 45 (small)
    return Math.round(45 - (q / 100) * 30)
  }
  // x264: ~18 (best) .. 34 (small)
  return Math.round(34 - (q / 100) * 16)
}

function cropExpr(ratio: [number, number]): string {
  const r = ratio[0] / ratio[1]
  // crop centers automatically when x/y are omitted.
  return `crop='min(iw,ih*${r})':'min(ih,iw/${r})'`
}

/** Video filters applied after any overlay: crop -> speed -> scale. */
function buildVideoFilters(opts: ProcessOptions): string[] {
  const filters: string[] = []
  if (opts.aspect) filters.push(cropExpr(opts.aspect))
  if (opts.speed !== 1) filters.push(`setpts=${(1 / opts.speed).toFixed(5)}*PTS`)
  if (opts.targetHeight) filters.push(`scale=-2:${opts.targetHeight}:flags=lanczos`)
  return filters
}

/**
 * Probe the input for an audio stream by running `ffmpeg -i input` (which
 * "fails" with no output file but prints stream info to the log). Referencing a
 * non-existent audio stream in a filtergraph is a hard error, so we must know
 * this before building the command.
 */
async function probeHasAudio(engine: FFmpeg, inputName: string): Promise<boolean> {
  let sawAudio = false
  logTap = (msg) => {
    if (/Stream #\d+:\d+.*: Audio:/.test(msg) || /^\s*Stream.*Audio:/.test(msg)) sawAudio = true
  }
  try {
    await engine.exec(['-i', inputName])
  } catch {
    /* expected: "At least one output file must be specified" */
  } finally {
    logTap = undefined
  }
  return sawAudio
}

/**
 * Run the whole edit pipeline in a single ffmpeg invocation and return the
 * resulting file as a blob + object URL.
 */
export async function processVideo(
  opts: ProcessOptions,
  listeners: Listeners = {},
): Promise<ProcessResult> {
  const engine = await getFFmpeg(listeners)

  const inputName = 'input' + guessExt(opts.file)
  const outputName = 'output.' + extOf(opts.format)
  const overlayPattern = 'ov%04d.png'
  const overlayNames: string[] = []

  await engine.writeFile(inputName, await fetchFile(opts.file))
  if (opts.overlay) {
    for (let i = 0; i < opts.overlay.frames.length; i++) {
      const name = `ov${String(i).padStart(4, '0')}.png`
      await engine.writeFile(name, await fetchFile(opts.overlay.frames[i]))
      overlayNames.push(name)
    }
  }

  const hasAudio = await probeHasAudio(engine, inputName)

  if (opts.format === 'mp3' && !hasAudio) {
    await safeDelete(engine, inputName)
    throw new Error('Video ini tidak punya trek audio, jadi tidak bisa diekspor ke MP3')
  }

  // Audio survives only for video/mp3 outputs, when present and not muted.
  const keepAudio = hasAudio && !opts.mute && opts.format !== 'gif'
  const audioSpeed = keepAudio && opts.speed !== 1 ? `atempo=${opts.speed.toFixed(4)}` : null

  const duration = Math.max(0.05, opts.trimEnd - opts.trimStart)
  const vFilters = buildVideoFilters(opts)

  const args: string[] = []
  args.push('-ss', opts.trimStart.toFixed(3)) // seek before input (fast)
  args.push('-i', inputName)
  if (opts.overlay) {
    args.push('-framerate', String(opts.overlay.fps), '-start_number', '0', '-i', overlayPattern)
  }
  args.push('-t', duration.toFixed(3))

  if (opts.format === 'mp3') {
    args.push('-vn')
    if (audioSpeed) args.push('-af', audioSpeed)
    args.push('-c:a', 'libmp3lame', '-b:a', '192k')
  } else if (opts.format === 'gif') {
    const gifChain = [...vFilters, 'fps=15']
    const complex = opts.overlay
      ? `[0:v][1:v]overlay=0:0:eof_action=repeat[ov];[ov]${gifChain.join(',')},split[a][b];[a]palettegen[p];[b][p]paletteuse`
      : `${gifChain.join(',')},split[a][b];[a]palettegen[p];[b][p]paletteuse`
    args.push('-filter_complex', complex)
  } else {
    // Video: mp4 / webm.
    if (opts.overlay) {
      const vchain = vFilters.length ? ',' + vFilters.join(',') : ''
      let complex = `[0:v][1:v]overlay=0:0:eof_action=repeat${vchain}[outv]`
      if (audioSpeed) complex += `;[0:a]${audioSpeed}[outa]`
      args.push('-filter_complex', complex)
      args.push('-map', '[outv]')
      if (audioSpeed) args.push('-map', '[outa]')
      else if (keepAudio) args.push('-map', '0:a')
      else args.push('-an')
    } else {
      if (vFilters.length) args.push('-vf', vFilters.join(','))
      if (audioSpeed) args.push('-af', audioSpeed)
      if (!keepAudio) args.push('-an')
    }

    const crf = qualityToCrf(opts.quality, opts.format)
    if (opts.format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p')
      if (keepAudio) args.push('-c:a', 'aac', '-b:a', '128k')
      args.push('-movflags', '+faststart')
    } else {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1')
      if (keepAudio) args.push('-c:a', 'libopus', '-b:a', '128k')
    }
  }

  args.push('-y', outputName)

  await engine.exec(args)

  const data = (await engine.readFile(outputName)) as Uint8Array
  const bytes = new Uint8Array(data)
  const blob = new Blob([bytes], { type: mimeOf(opts.format) })

  await safeDelete(engine, inputName)
  await safeDelete(engine, outputName)
  for (const name of overlayNames) await safeDelete(engine, name)

  const baseName = opts.file.name.replace(/\.[^.]+$/, '') || 'video'
  return {
    blob,
    url: URL.createObjectURL(blob),
    filename: `${baseName}-taiba.${extOf(opts.format)}`,
    mimeType: mimeOf(opts.format),
  }
}

async function safeDelete(engine: FFmpeg, name: string) {
  try {
    await engine.deleteFile(name)
  } catch {
    /* ignore */
  }
}

function guessExt(file: File): string {
  const m = file.name.match(/(\.[a-z0-9]+)$/i)
  if (m) return m[1].toLowerCase()
  if (file.type.includes('mp4')) return '.mp4'
  if (file.type.includes('webm')) return '.webm'
  if (file.type.includes('quicktime')) return '.mov'
  return '.mp4'
}
