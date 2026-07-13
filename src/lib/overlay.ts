export type OverlayPosition = 'top' | 'center' | 'bottom'
export type OverlayAnimation = 'none' | 'fade' | 'pop' | 'slide'
export type OverlayBackdrop = 'none' | 'box' | 'screen'

export type OverlayStyle = {
  text: string
  position: OverlayPosition
  color: string
  /** relative font size, 1–14 (% of video height) */
  sizePct: number
  backdrop: OverlayBackdrop
  animation: OverlayAnimation
}

export type OverlayFrames = {
  /** transparent PNGs the same size as the source video */
  frames: Blob[]
  fps: number
}

const ANIM_FPS = 15
const MAX_ANIM_SECONDS = 1.5

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

function easeOutBack(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

/**
 * Render the caption animation to a sequence of transparent PNGs. Only the
 * intro animation is rendered; ffmpeg's `overlay=...:eof_action=repeat` holds
 * the final (fully revealed) frame for the rest of the clip, so this stays cheap
 * even for long videos. `animation: 'none'` returns a single static frame.
 */
export async function renderOverlayFrames(
  style: OverlayStyle,
  width: number,
  height: number,
  clipDuration: number,
): Promise<OverlayFrames> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  if (style.animation === 'none') {
    drawFrame(ctx, style, width, height, { alpha: 1, scale: 1, dy: 0 })
    return { frames: [await toBlob(canvas)], fps: ANIM_FPS }
  }

  const animSeconds = Math.max(0.4, Math.min(MAX_ANIM_SECONDS, clipDuration * 0.6))
  const count = Math.max(2, Math.round(animSeconds * ANIM_FPS))
  const frames: Blob[] = []

  for (let i = 0; i < count; i++) {
    const p = easeOutCubic(i / (count - 1))
    const params = animParams(style.animation, p, height)
    drawFrame(ctx, style, width, height, params)
    frames.push(await toBlob(canvas))
  }
  return { frames, fps: ANIM_FPS }
}

type DrawParams = { alpha: number; scale: number; dy: number }

function animParams(anim: OverlayAnimation, p: number, height: number): DrawParams {
  switch (anim) {
    case 'fade':
      return { alpha: p, scale: 1, dy: 0 }
    case 'pop':
      return { alpha: Math.min(1, p * 1.5), scale: easeOutBack(p), dy: 0 }
    case 'slide':
      return { alpha: p, scale: 1, dy: (1 - p) * 0.09 * height }
    default:
      return { alpha: 1, scale: 1, dy: 0 }
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  style: OverlayStyle,
  width: number,
  height: number,
  { alpha, scale, dy }: DrawParams,
) {
  ctx.clearRect(0, 0, width, height)

  // Full-screen dark scrim (fades in with the text).
  if (style.backdrop === 'screen') {
    ctx.fillStyle = `rgba(0,0,0,${(0.5 * alpha).toFixed(3)})`
    ctx.fillRect(0, 0, width, height)
  }

  const fontSize = Math.round((style.sizePct / 100) * height)
  ctx.font = `800 ${fontSize}px "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lines = wrapText(ctx, style.text, width * 0.86)
  const lineHeight = fontSize * 1.25
  const totalHeight = lineHeight * lines.length

  const margin = Math.round(height * 0.08)
  let anchorY: number
  if (style.position === 'top') anchorY = margin + totalHeight / 2
  else if (style.position === 'bottom') anchorY = height - margin - totalHeight / 2
  else anchorY = height / 2

  const x = width / 2

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  // Scale/slide around the text block centre.
  ctx.translate(x, anchorY + dy)
  ctx.scale(scale, scale)
  ctx.translate(-x, -anchorY)

  let lineY = anchorY - totalHeight / 2 + lineHeight / 2
  for (const line of lines) {
    if (style.backdrop === 'box') {
      const metrics = ctx.measureText(line)
      const padX = fontSize * 0.35
      const boxW = metrics.width + padX * 2
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      roundRect(ctx, x - boxW / 2, lineY - lineHeight / 2, boxW, lineHeight, fontSize * 0.15)
      ctx.fill()
    } else if (style.backdrop === 'none') {
      ctx.lineWidth = Math.max(2, fontSize * 0.09)
      ctx.strokeStyle = 'rgba(0,0,0,0.72)'
      ctx.lineJoin = 'round'
      ctx.strokeText(line, x, lineY)
    }
    ctx.fillStyle = style.color
    ctx.fillText(line, x, lineY)
    lineY += lineHeight
  }
  ctx.restore()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i]
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(current)
      current = words[i]
    } else {
      current = test
    }
  }
  lines.push(current)
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat overlay teks'))),
      'image/png',
    )
  })
}
