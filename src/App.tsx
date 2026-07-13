import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ASPECT_RATIOS,
  processVideo,
  type OutputFormat,
  type ProcessResult,
} from './lib/ffmpeg'
import { renderOverlayPng, type OverlayPosition } from './lib/overlay'

type Dims = { w: number; h: number }

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const RESOLUTIONS: { label: string; value: number | null }[] = [
  { label: 'Asli', value: null },
  { label: '1080p', value: 1080 },
  { label: '720p', value: 720 },
  { label: '480p', value: 480 },
  { label: '360p', value: 360 },
]
const FORMATS: { label: string; value: OutputFormat; hint: string }[] = [
  { label: 'MP4', value: 'mp4', hint: 'H.264 · paling kompatibel' },
  { label: 'WebM', value: 'webm', hint: 'VP9 · ukuran kecil' },
  { label: 'GIF', value: 'gif', hint: 'animasi tanpa suara' },
  { label: 'MP3', value: 'mp3', hint: 'ambil audio saja' },
]

function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [srcUrl, setSrcUrl] = useState<string>('')
  const [duration, setDuration] = useState(0)
  const [dims, setDims] = useState<Dims>({ w: 0, h: 0 })

  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [aspectIdx, setAspectIdx] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [mute, setMute] = useState(false)
  const [resolution, setResolution] = useState<number | null>(null)
  const [quality, setQuality] = useState(70)
  const [format, setFormat] = useState<OutputFormat>('mp4')

  const [textEnabled, setTextEnabled] = useState(false)
  const [text, setText] = useState('')
  const [textPos, setTextPos] = useState<OverlayPosition>('bottom')
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(6)
  const [textBg, setTextBg] = useState(true)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [logLine, setLogLine] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ProcessResult | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const loadFile = useCallback((f: File) => {
    setError('')
    setResult(null)
    setFile(f)
    const url = URL.createObjectURL(f)
    setSrcUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
  }, [])

  const onMeta = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    setTrimStart(0)
    setTrimEnd(v.duration)
    setDims({ w: v.videoWidth, h: v.videoHeight })
  }

  const reset = () => {
    setFile(null)
    setResult(null)
    setError('')
    setSrcUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return ''
    })
  }

  useEffect(() => {
    return () => {
      if (srcUrl) URL.revokeObjectURL(srcUrl)
    }
  }, [srcUrl])

  const aspect = ASPECT_RATIOS[aspectIdx]
  const outDuration = Math.max(0, (trimEnd - trimStart) / speed)

  const runExport = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    setProgress(0)
    setStatusMsg('Memuat mesin ffmpeg (sekali saja, ±30MB)…')

    try {
      let overlay = null
      if (textEnabled && text.trim() && format !== 'mp3') {
        setStatusMsg('Menyiapkan teks…')
        const png = await renderOverlayPng(
          { text, position: textPos, color: textColor, sizePct: textSize, background: textBg },
          dims.w,
          dims.h,
        )
        overlay = { text, pngBlob: png }
      }

      setStatusMsg('Memproses video di browser…')
      const res = await processVideo(
        {
          file,
          trimStart,
          trimEnd,
          aspect: aspect.ratio,
          speed,
          mute,
          targetHeight: resolution,
          quality,
          format,
          overlay,
        },
        {
          onProgress: (r) => setProgress(r),
          onLog: (m) => setLogLine(m),
        },
      )
      setResult(res)
      setStatusMsg('Selesai!')
      setProgress(1)
    } catch (e) {
      console.error(e)
      setError(
        (e instanceof Error ? e.message : String(e)) +
          ' — coba format MP4 atau turunkan resolusi bila kombinasi ini tidak didukung.',
      )
    } finally {
      setBusy(false)
    }
  }

  const previewStyle = useMemo(() => {
    if (!aspect.ratio) return {}
    return { aspectRatio: `${aspect.ratio[0]} / ${aspect.ratio[1]}` } as React.CSSProperties
  }, [aspect])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▶</span>
          <div>
            <h1>Taiba Video Editor</h1>
            <p>Edit video langsung di browser — tanpa upload, tanpa watermark, 100% privat.</p>
          </div>
        </div>
        {file && (
          <button className="ghost" onClick={reset}>
            Ganti video
          </button>
        )}
      </header>

      {!file ? (
        <Dropzone onFile={loadFile} />
      ) : (
        <main className="editor">
          <section className="stage">
            <div className="preview-wrap" style={previewStyle}>
              <video
                ref={videoRef}
                src={srcUrl}
                controls
                onLoadedMetadata={onMeta}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                className={aspect.ratio ? 'cropped' : ''}
              />
              {textEnabled && text.trim() && (
                <div className={`overlay-preview pos-${textPos}`}>
                  <span
                    style={{
                      color: textColor,
                      fontSize: `${textSize}cqh`,
                      background: textBg ? 'rgba(0,0,0,0.55)' : 'transparent',
                      textShadow: textBg ? 'none' : '0 1px 3px rgba(0,0,0,0.8)',
                    }}
                  >
                    {text}
                  </span>
                </div>
              )}
            </div>
            <div className="meta-row">
              <span>{dims.w}×{dims.h}px</span>
              <span>·</span>
              <span>Durasi {fmtTime(duration)}</span>
              <span>·</span>
              <span>{fmtBytes(file.size)}</span>
            </div>

            <TrimControl
              duration={duration}
              trimStart={trimStart}
              trimEnd={trimEnd}
              currentTime={currentTime}
              onChange={(s, e) => {
                setTrimStart(s)
                setTrimEnd(e)
              }}
              onSetStartHere={() => setTrimStart(Math.min(currentTime, trimEnd - 0.1))}
              onSetEndHere={() => setTrimEnd(Math.max(currentTime, trimStart + 0.1))}
            />
          </section>

          <aside className="panel">
            <Group title="Rasio / Crop">
              <div className="chips">
                {ASPECT_RATIOS.map((a, i) => (
                  <button
                    key={a.label}
                    className={i === aspectIdx ? 'chip active' : 'chip'}
                    onClick={() => setAspectIdx(i)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </Group>

            <Group title="Kecepatan">
              <div className="chips">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    className={s === speed ? 'chip active' : 'chip'}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </Group>

            <Group title="Teks / Caption">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={textEnabled}
                  onChange={(e) => setTextEnabled(e.target.checked)}
                />
                <span>Tambahkan teks di video</span>
              </label>
              {textEnabled && (
                <div className="stack">
                  <input
                    type="text"
                    placeholder="Tulis teks di sini…"
                    value={text}
                    maxLength={120}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className="chips">
                    {(['top', 'center', 'bottom'] as OverlayPosition[]).map((p) => (
                      <button
                        key={p}
                        className={p === textPos ? 'chip active' : 'chip'}
                        onClick={() => setTextPos(p)}
                      >
                        {p === 'top' ? 'Atas' : p === 'center' ? 'Tengah' : 'Bawah'}
                      </button>
                    ))}
                  </div>
                  <div className="inline">
                    <label>
                      Warna
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                      />
                    </label>
                    <label className="grow">
                      Ukuran {textSize}%
                      <input
                        type="range"
                        min={3}
                        max={12}
                        value={textSize}
                        onChange={(e) => setTextSize(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <label className="switch small">
                    <input
                      type="checkbox"
                      checked={textBg}
                      onChange={(e) => setTextBg(e.target.checked)}
                    />
                    <span>Latar gelap di belakang teks</span>
                  </label>
                </div>
              )}
            </Group>

            <Group title="Audio">
              <label className="switch">
                <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} />
                <span>Bisukan audio</span>
              </label>
            </Group>

            <Group title="Kualitas & Ukuran">
              <div className="chips">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.label}
                    className={r.value === resolution ? 'chip active' : 'chip'}
                    onClick={() => setResolution(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <label className="grow full">
                Kualitas {quality}%
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
              </label>
            </Group>

            <Group title="Format output">
              <div className="format-grid">
                {FORMATS.map((f) => (
                  <button
                    key={f.value}
                    className={f.value === format ? 'format active' : 'format'}
                    onClick={() => setFormat(f.value)}
                  >
                    <strong>{f.label}</strong>
                    <small>{f.hint}</small>
                  </button>
                ))}
              </div>
            </Group>
          </aside>

          <div className="exportbar">
            <div className="export-info">
              {busy ? (
                <>
                  <div className="progress">
                    <div className="bar" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <span className="status">
                    {statusMsg} {progress > 0 && `${Math.round(progress * 100)}%`}
                  </span>
                  {logLine && <span className="log">{logLine}</span>}
                </>
              ) : (
                <span className="status">
                  Hasil: {aspect.label} · {speed}× · {format.toUpperCase()} ·{' '}
                  {fmtTime(outDuration)} {mute && '· tanpa suara'}
                </span>
              )}
            </div>
            <button className="primary" disabled={busy} onClick={runExport}>
              {busy ? 'Memproses…' : 'Export video'}
            </button>
          </div>

          {error && <div className="error">⚠️ {error}</div>}

          {result && (
            <div className="result">
              <h3>✅ Video siap</h3>
              {format === 'mp3' ? (
                <audio src={result.url} controls />
              ) : format === 'gif' ? (
                <img src={result.url} alt="hasil" />
              ) : (
                <video src={result.url} controls />
              )}
              <div className="result-actions">
                <a className="primary" href={result.url} download={result.filename}>
                  ⬇ Download ({fmtBytes(result.blob.size)})
                </a>
                <span className="fname">{result.filename}</span>
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="foot">
        Dibuat dengan <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" target="_blank" rel="noreferrer">ffmpeg.wasm</a> — semua pemrosesan terjadi di perangkatmu.
      </footer>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="group">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function Dropzone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      className={drag ? 'dropzone drag' : 'dropzone'}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const f = e.dataTransfer.files?.[0]
        if (f && f.type.startsWith('video/')) onFile(f)
      }}
      onClick={() => inputRef.current?.click()}
    >
      <div className="drop-icon">🎬</div>
      <h2>Tarik video ke sini atau klik untuk pilih file</h2>
      <p>MP4, MOV, WebM, MKV — file tidak diunggah ke mana pun, semuanya diproses di browser.</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </div>
  )
}

function TrimControl({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  onChange,
  onSetStartHere,
  onSetEndHere,
}: {
  duration: number
  trimStart: number
  trimEnd: number
  currentTime: number
  onChange: (start: number, end: number) => void
  onSetStartHere: () => void
  onSetEndHere: () => void
}) {
  const pct = (t: number) => (duration ? (t / duration) * 100 : 0)
  return (
    <div className="trim">
      <div className="trim-head">
        <span>✂️ Potong: {fmtTime(trimStart)} → {fmtTime(trimEnd)}</span>
        <span className="dur">({fmtTime(trimEnd - trimStart)})</span>
      </div>
      <div className="trim-track">
        <div
          className="trim-fill"
          style={{ left: `${pct(trimStart)}%`, right: `${100 - pct(trimEnd)}%` }}
        />
        <div className="playhead" style={{ left: `${pct(currentTime)}%` }} />
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={trimStart}
          onChange={(e) => onChange(Math.min(Number(e.target.value), trimEnd - 0.1), trimEnd)}
        />
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={trimEnd}
          onChange={(e) => onChange(trimStart, Math.max(Number(e.target.value), trimStart + 0.1))}
        />
      </div>
      <div className="trim-actions">
        <button className="ghost small" onClick={onSetStartHere}>
          ⇤ Set awal di posisi ini
        </button>
        <button className="ghost small" onClick={onSetEndHere}>
          Set akhir di posisi ini ⇥
        </button>
      </div>
    </div>
  )
}
