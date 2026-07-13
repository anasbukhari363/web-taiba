// Produces a real screenshot: runs the quote-video export, then grabs a frame
// from the *exported* MP4 so we can visually confirm the baked-in caption.
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const CHROME = process.env.CHROME_PATH || chromium.executablePath()
const PORT = 4318
const URL = `http://localhost:${PORT}/`
const OUT = process.argv[2] || 'quote-frame.png'

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        if ((await fetch(url)).ok) return resolve()
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error('server timeout'))
      setTimeout(tick, 300)
    }
    tick()
  })
}

const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
})
let browser
try {
  await waitForServer(URL)
  browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await (await browser.newContext()).newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })

  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 1280
    const ctx = canvas.getContext('2d')
    const rec = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' })
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise((r) => (rec.onstop = r))
    rec.start()
    let f = 0
    const t = setInterval(() => {
      const g = ctx.createLinearGradient(0, 0, 720, 1280)
      g.addColorStop(0, `hsl(${(f * 4) % 360},60%,45%)`)
      g.addColorStop(1, `hsl(${(f * 4 + 120) % 360},60%,30%)`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 720, 1280)
      f++
    }, 60)
    await new Promise((r) => setTimeout(r, 1500))
    clearInterval(t)
    rec.stop()
    await done
    const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())
    let s = ''
    for (const b of buf) s += String.fromCharCode(b)
    return btoa(s)
  })

  await page.setInputFiles('input[type=file]', {
    name: 'bg.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(b64, 'base64'),
  })
  await page.waitForSelector('.editor')
  await page.waitForFunction(() => /\d+×\d+px/.test(document.querySelector('.meta-row')?.textContent || ''))

  await page.getByRole('button', { name: 'Pakai preset Quote' }).click()
  await page.fill('textarea', 'Mulai dari yang kecil,\nmulai dari sekarang.')
  await page.getByRole('button', { name: '9:16 (Reels/TikTok)' }).click()
  await page.getByRole('button', { name: 'Export video' }).click()
  await page.waitForSelector('.result video', { timeout: 180000 })
  console.log('→ export done, grabbing a frame from the exported MP4…')

  const frame = await page.evaluate(async () => {
    const v = document.querySelector('.result video')
    await new Promise((res) => {
      v.addEventListener('seeked', res, { once: true })
      v.currentTime = Math.min(1.0, (v.duration || 2) * 0.6)
    })
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    return c.toDataURL('image/png').split(',')[1]
  })
  await writeFile(OUT, Buffer.from(frame, 'base64'))
  console.log('→ saved', OUT)

  await browser.close()
  server.kill('SIGTERM')
  process.exit(0)
} catch (e) {
  console.error('shot failed:', e.message)
  if (browser) await browser.close()
  server.kill('SIGTERM')
  process.exit(1)
}
