export type OverlayPosition = 'top' | 'center' | 'bottom'

export type OverlayStyle = {
  text: string
  position: OverlayPosition
  color: string
  /** relative font size, 1–12 (% of video height) */
  sizePct: number
  background: boolean
}

/**
 * Render the caption to a transparent PNG the same size as the source video.
 * We composite this with ffmpeg's `overlay` filter, which avoids depending on
 * freetype/drawtext being compiled into the wasm core.
 */
export async function renderOverlayPng(
  style: OverlayStyle,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const fontSize = Math.round((style.sizePct / 100) * height)
  ctx.font = `700 ${fontSize}px "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const margin = Math.round(height * 0.06)
  const x = width / 2
  let y: number
  if (style.position === 'top') y = margin + fontSize / 2
  else if (style.position === 'bottom') y = height - margin - fontSize / 2
  else y = height / 2

  const lines = wrapText(ctx, style.text, width * 0.9)
  const lineHeight = fontSize * 1.25
  const totalHeight = lineHeight * lines.length
  let startY = y - totalHeight / 2 + lineHeight / 2

  for (const line of lines) {
    if (style.background) {
      const metrics = ctx.measureText(line)
      const padX = fontSize * 0.35
      const boxW = metrics.width + padX * 2
      const boxH = lineHeight
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      roundRect(ctx, x - boxW / 2, startY - boxH / 2, boxW, boxH, fontSize * 0.15)
      ctx.fill()
    } else {
      // Legible over any footage without a background box.
      ctx.lineWidth = Math.max(2, fontSize * 0.08)
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.strokeText(line, x, startY)
    }
    ctx.fillStyle = style.color
    ctx.fillText(line, x, startY)
    startY += lineHeight
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat overlay teks'))),
      'image/png',
    )
  })
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
