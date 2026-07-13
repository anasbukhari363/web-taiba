// Copies the ffmpeg.wasm ESM core into public/ so it is served same-origin.
// Runs automatically before `dev` and `build` (see package.json scripts).
import { copyFile, mkdir, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = resolve(root, 'node_modules/@ffmpeg/core/dist/esm')
const outDir = resolve(root, 'public/ffmpeg')

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm']

try {
  await mkdir(outDir, { recursive: true })
  for (const f of files) {
    const src = resolve(srcDir, f)
    await access(src)
    await copyFile(src, resolve(outDir, f))
  }
  console.log('[setup-core] ffmpeg core copied to public/ffmpeg/')
} catch (err) {
  console.error(
    '[setup-core] Could not copy ffmpeg core. Did you run `npm install`?\n',
    err.message,
  )
  process.exit(1)
}
