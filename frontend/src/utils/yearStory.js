import { coverUrl } from './covers.js'
import { tagColorName } from './tagColors.js'

/**
 * Imagem "Meu ano em livros" para stories (1080×1920, 9:16), desenhada no
 * navegador com <canvas> — nada vai para o servidor. As capas vêm da mesma
 * origem (/api/uploads), então o canvas não fica "sujo" e dá para exportar.
 *   https://developer.mozilla.org/docs/Web/API/HTMLCanvasElement/toBlob
 */
export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920

const SERIF = '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif'
const SANS = '"Inter Variable", Inter, system-ui, sans-serif'
const PAD = 96

// Cores das capas desenhadas (as do tema escuro, iguais às do app)
const COVER_RGB = {
  red: [255, 75, 120],
  green: [169, 255, 84],
  blue: [58, 134, 255],
  purple: [141, 120, 250],
  yellow: [253, 212, 87],
  orange: [255, 138, 80]
}

const mix = (rgb, amount) => `rgb(${rgb.map(c => Math.round(c * amount)).join(', ')})`

/** Cor de destaque escolhida pela pessoa (--main-solid-rgb), como [r, g, b]. */
function accentRgb() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--main-solid-rgb')
  const parts = raw.split(',').map(part => Number(part.trim()))
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : [37, 99, 235]
}

async function loadFonts() {
  if (!document.fonts?.load) return
  await Promise.all([
    document.fonts.load(`700 120px ${SERIF}`),
    document.fonts.load(`600 60px ${SERIF}`),
    document.fonts.load(`400 32px ${SANS}`),
    document.fonts.load(`700 32px ${SANS}`)
  ]).catch(() => {})
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** Capa enviada (AVIF, depois JPG) ou null para desenhar uma. */
async function loadCover(bookId) {
  const avif = coverUrl(bookId)
  return (await loadImage(avif)) || loadImage(avif.replace(/\.avif(\?.*)?$/, '.jpg'))
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Quebra o texto em linhas que cabem em `width`; a última leva "…" se sobrar. */
function wrap(ctx, text, width, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= width || !line) line = test
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = ellipsis(ctx, `${lines[maxLines - 1]}…`, width)
  }
  return lines.map(l => ellipsis(ctx, l, width))
}

function ellipsis(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

function drawCover(ctx, image, book, x, y, w, h, angle) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(angle)
  ctx.translate(-w / 2, -h / 2)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 18
  roundRect(ctx, 0, 0, w, h, 12)
  ctx.fillStyle = '#222'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.clip()

  if (image) {
    // "cover": preenche o retângulo sem distorcer
    const scale = Math.max(w / image.width, h / image.height)
    const iw = image.width * scale
    const ih = image.height * scale
    ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih)
  } else {
    const rgb = COVER_RGB[tagColorName(book.title || book.authors)] || COVER_RGB.blue
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, mix(rgb, 0.78))
    gradient.addColorStop(1, mix(rgb, 0.38))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.lineWidth = 2
    ctx.strokeRect(14, 14, w - 28, h - 28)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `700 ${Math.round(w * 0.12)}px ${SERIF}`
    const lines = wrap(ctx, book.title, w - 56, 5)
    lines.forEach((line, i) => ctx.fillText(line, w / 2, 40 + i * w * 0.145))
    if (book.authors) {
      ctx.font = `400 ${Math.round(w * 0.065)}px ${SANS}`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.fillText(ellipsis(ctx, book.authors, w - 56), w / 2, h - 40 - w * 0.07)
    }
  }
  ctx.restore()
}

/**
 * Desenha a imagem no `canvas` (1080×1920). `text` traz as frases prontas
 * (traduzidas) — quem chama decide o idioma:
 *   { kicker, title, subtitle, stats: [{ value, label }], highlights: [...], footer }
 */
export async function drawYearStory(canvas, { year, covers, text }) {
  canvas.width = STORY_WIDTH
  canvas.height = STORY_HEIGHT
  const ctx = canvas.getContext('2d')
  const accent = accentRgb()
  const light = accent.map(c => Math.round(c + (255 - c) * 0.45))

  await loadFonts()
  const images = await Promise.all(covers.map(cover => loadCover(cover.bookId)))

  // Fundo: quase preto com um brilho da cor de destaque no alto
  ctx.fillStyle = '#0e0e11'
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)
  const glow = ctx.createRadialGradient(STORY_WIDTH * 0.8, 0, 50, STORY_WIDTH * 0.8, 0, 1300)
  glow.addColorStop(0, `rgba(${accent.join(', ')}, 0.75)`)
  glow.addColorStop(1, `rgba(${accent.join(', ')}, 0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)
  const floor = ctx.createLinearGradient(0, STORY_HEIGHT * 0.55, 0, STORY_HEIGHT)
  floor.addColorStop(0, 'rgba(0, 0, 0, 0)')
  floor.addColorStop(1, `rgba(${accent.join(', ')}, 0.22)`)
  ctx.fillStyle = floor
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Cabeçalho
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = `700 30px ${SANS}`
  ctx.letterSpacing = '6px'
  ctx.fillText(text.kicker, PAD, 150)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = '#fff'
  ctx.font = `600 76px ${SERIF}`
  ctx.fillText(ellipsis(ctx, text.title, STORY_WIDTH - PAD * 2), PAD, 270)

  ctx.fillStyle = `rgb(${light.join(', ')})`
  ctx.font = `700 230px ${SERIF}`
  ctx.fillText(String(year), PAD - 8, 480)

  if (text.subtitle) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.font = `400 34px ${SANS}`
    ctx.fillText(text.subtitle, PAD, 545)
  }

  // Números
  const stats = text.stats.slice(0, 3)
  const colWidth = (STORY_WIDTH - PAD * 2) / Math.max(1, stats.length)
  stats.forEach((stat, i) => {
    const x = PAD + i * colWidth
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${stat.value.length > 5 ? 74 : 92}px ${SERIF}`
    ctx.fillText(ellipsis(ctx, stat.value, colWidth - 16), x, 690)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.font = `400 32px ${SANS}`
    ctx.fillText(ellipsis(ctx, stat.label, colWidth - 16), x, 738)
  })

  // Capas: até 6, em duas fileiras levemente tortas
  const shown = covers.slice(0, 6)
  const perRow = shown.length <= 3 ? shown.length : 3
  const rows = Math.ceil(shown.length / Math.max(1, perRow))
  const coverW = rows === 1 ? 270 : 230
  const coverH = Math.round(coverW * 1.5)
  const gap = 40
  const blockTop = 800
  shown.forEach((book, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, shown.length - row * perRow)
    const col = i - row * perRow
    const rowWidth = inRow * coverW + (inRow - 1) * gap
    const x = (STORY_WIDTH - rowWidth) / 2 + col * (coverW + gap)
    const y = blockTop + row * (coverH + 44)
    const angle = ((i % 3) - 1) * 0.035
    drawCover(ctx, images[i], book, x, y, coverW, coverH, angle)
  })
  const coversBottom = blockTop + rows * coverH + (rows - 1) * 44

  // Destaques
  let y = Math.max(coversBottom + 96, 1480)
  ctx.font = `400 38px ${SANS}`
  for (const line of text.highlights.slice(0, 3)) {
    if (y > STORY_HEIGHT - 140) break
    ctx.fillStyle = `rgb(${light.join(', ')})`
    ctx.fillText('●', PAD, y)
    ctx.fillStyle = '#fff'
    ctx.fillText(ellipsis(ctx, line, STORY_WIDTH - PAD * 2 - 52), PAD + 52, y)
    y += 62
  }

  // Rodapé
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.font = `700 30px ${SANS}`
  ctx.textAlign = 'center'
  ctx.fillText(text.footer, STORY_WIDTH / 2, STORY_HEIGHT - 64)
  ctx.textAlign = 'left'
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/png')
  })
}
