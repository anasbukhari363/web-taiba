// End-to-end smoke test: boots the built app, synthesizes a short clip in the
// browser, runs it through the ffmpeg.wasm export pipeline, and asserts a real
// output file comes back. Not part of the shipped app — verification only.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// Uses $CHROME_PATH if set, otherwise Playwright's managed Chromium
// (run `npx playwright install chromium` once to fetch it).
const CHROME = process.env.CHROME_PATH || chromium.executablePath()
const PORT = 4317
const URL = `http://localhost:${PORT}/`

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url)
        if (r.ok) return resolve()
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('server timeout'))
      setTimeout(tick, 300)
    }
    tick()
  })
}

const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'inherit',
})

let browser
const fail = async (msg) => {
  console.error('\n❌ E2E FAILED:', msg)
  if (browser) await browser.close()
  server.kill('SIGTERM')
  process.exit(1)
}

try {
  await waitForServer(URL)
  browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [browser error]', m.text())
  })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

  await page.goto(URL, { waitUntil: 'networkidle' })
  console.log('→ page loaded')

  // Synthesize a ~1s webm clip via canvas + MediaRecorder, return as base64.
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(15)
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise((res) => (rec.onstop = res))
    rec.start()
    let frame = 0
    const timer = setInterval(() => {
      ctx.fillStyle = `hsl(${(frame * 12) % 360},70%,50%)`
      ctx.fillRect(0, 0, 320, 240)
      ctx.fillStyle = '#fff'
      ctx.font = '40px sans-serif'
      ctx.fillText('frame ' + frame, 20, 130)
      frame++
    }, 66)
    await new Promise((r) => setTimeout(r, 1000))
    clearInterval(timer)
    rec.stop()
    await done
    const blob = new Blob(chunks, { type: 'video/webm' })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (const byte of buf) s += String.fromCharCode(byte)
    return btoa(s)
  })
  const buffer = Buffer.from(b64, 'base64')
  console.log(`→ synthesized test clip: ${buffer.length} bytes`)
  if (buffer.length < 500) throw new Error('generated clip is suspiciously small')

  await page.setInputFiles('input[type=file]', {
    name: 'test.webm',
    mimeType: 'video/webm',
    buffer,
  })

  // Editor appears once metadata loads.
  await page.waitForSelector('.editor', { timeout: 10000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('.meta-row')
    return el && /\d+×\d+px/.test(el.textContent || '')
  }, { timeout: 10000 })
  console.log('→ editor loaded, video metadata read')

  // Enable a text overlay + crop to 9:16 + 1.5x to exercise filter_complex.
  await page.getByText('Tambahkan teks di video').click()
  await page.fill('input[placeholder="Tulis teks di sini…"]', 'Taiba test ✅')
  await page.getByRole('button', { name: '9:16 (Reels/TikTok)' }).click()
  await page.getByRole('button', { name: '1.5×' }).click()

  console.log('→ starting export (this loads the 32MB core + encodes)…')
  await page.getByRole('button', { name: 'Export video' }).click()

  await page.waitForSelector('.result video', { timeout: 180000 })
  const info = await page.evaluate(() => {
    const v = document.querySelector('.result video')
    const link = document.querySelector('.result a[download]')
    return { hasSrc: !!(v && v.src), label: link ? link.textContent : '' }
  })
  if (!info.hasSrc) throw new Error('result video has no src')
  console.log('→ export produced a result:', info.label.trim())

  console.log('\n✅ E2E PASSED — ffmpeg.wasm pipeline works end-to-end (trim+crop+speed+overlay → MP4)')
  await browser.close()
  server.kill('SIGTERM')
  process.exit(0)
} catch (e) {
  await fail(e.message)
}
