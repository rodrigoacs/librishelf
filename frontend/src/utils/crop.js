/**
 * Recorte da foto de perfil (AvatarCropSheet): matemática sem tela.
 *
 * A foto (iw × ih px) é desenhada numa moldura quadrada de `box` px, com
 * escala `scale` (px da tela por px da foto) e deslocamento (x, y) do canto
 * da foto em relação ao canto da moldura. O círculo da foto final é o
 * quadrado inscrito na moldura: a foto precisa cobrir a moldura inteira.
 */

export const MAX_ZOOM = 5 // vezes a escala mínima (a que só cobre a moldura)

/** Escala mínima: a foto cobre a moldura (o lado menor encosta nas bordas). */
export function minScale(iw, ih, box) {
  if (!(iw > 0 && ih > 0 && box > 0)) return 1
  return Math.max(box / iw, box / ih)
}

/** Começo: foto centralizada, cobrindo a moldura. */
export function initialView(iw, ih, box) {
  const scale = minScale(iw, ih, box)
  return { scale, x: (box - iw * scale) / 2, y: (box - ih * scale) / 2 }
}

/**
 * Mantém a foto cobrindo a moldura: escala entre a mínima e MAX_ZOOM vezes
 * ela, e sem sobrar fundo em nenhuma borda.
 */
export function clampView({ scale, x, y }, iw, ih, box) {
  const min = minScale(iw, ih, box)
  const s = Math.min(Math.max(scale, min), min * MAX_ZOOM)
  const w = iw * s
  const h = ih * s
  return {
    scale: s,
    x: Math.min(0, Math.max(box - w, x)),
    y: Math.min(0, Math.max(box - h, y))
  }
}

/**
 * Zoom em torno de um ponto da moldura (os dedos, o cursor): o ponto da foto
 * que estava sob (px, py) continua sob ele.
 */
export function zoomAround(view, nextScale, px, py) {
  const k = nextScale / view.scale
  return { scale: nextScale, x: px - (px - view.x) * k, y: py - (py - view.y) * k }
}

/**
 * Pinça: dos dois dedos no começo (a, b) e agora (a2, b2), a vista nova a
 * partir da vista do começo. A distância muda a escala; o ponto médio arrasta.
 */
export function pinchView(start, a, b, a2, b2) {
  const d0 = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const d1 = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1
  const m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const m1 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }
  const zoomed = zoomAround(start, start.scale * (d1 / d0), m0.x, m0.y)
  return { scale: zoomed.scale, x: zoomed.x + (m1.x - m0.x), y: zoomed.y + (m1.y - m0.y) }
}

/**
 * Borracha ao passar dos limites enquanto o dedo está na tela: o quanto
 * passou vira só uma fração (some quando solta e a vista volta ao limite).
 */
export function rubberView(view, iw, ih, box, factor = 0.35) {
  const c = clampView(view, iw, ih, box)
  return {
    scale: c.scale + (view.scale - c.scale) * factor,
    x: c.x + (view.x - c.x) * factor,
    y: c.y + (view.y - c.y) * factor
  }
}

/** Retângulo da foto (px da foto) que vai para o arquivo final, quadrado. */
export function cropRect(view, iw, ih, box) {
  const v = clampView(view, iw, ih, box)
  const size = Math.min(box / v.scale, iw, ih)
  const sx = Math.min(Math.max(-v.x / v.scale, 0), iw - size)
  const sy = Math.min(Math.max(-v.y / v.scale, 0), ih - size)
  return { sx, sy, size }
}

/** Zoom relativo (1 = escala mínima) ↔ escala absoluta, para o controle deslizante. */
export function zoomOf(view, iw, ih, box) {
  return view.scale / minScale(iw, ih, box)
}
