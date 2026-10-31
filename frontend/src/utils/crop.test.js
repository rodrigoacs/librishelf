import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, minScale, initialView, clampView, zoomAround, pinchView, rubberView, cropRect, zoomOf } from './crop.js'

const BOX = 300

describe('recorte da foto de perfil', () => {
  it('começa centralizada cobrindo a moldura (lado menor encosta)', () => {
    const v = initialView(1200, 800, BOX)
    expect(v.scale).toBeCloseTo(BOX / 800)
    expect(v.y).toBeCloseTo(0)
    expect(v.x).toBeCloseTo((BOX - 1200 * v.scale) / 2)
    expect(cropRect(v, 1200, 800, BOX)).toEqual({ sx: 200, sy: 0, size: 800 })
  })

  it('não deixa sobrar fundo nem diminuir além da escala mínima', () => {
    const min = minScale(1000, 1000, BOX)
    const c = clampView({ scale: min / 2, x: 50, y: -999 }, 1000, 1000, BOX)
    expect(c).toEqual({ scale: min, x: 0, y: 0 })
    const big = clampView({ scale: min * 99, x: 0, y: 0 }, 1000, 1000, BOX)
    expect(big.scale).toBeCloseTo(min * MAX_ZOOM)
    const moved = clampView({ scale: min * 2, x: -10000, y: 20 }, 1000, 1000, BOX)
    expect(moved.x).toBeCloseTo(BOX - 1000 * min * 2)
    expect(moved.y).toBe(0)
  })

  it('zoom em torno de um ponto mantém o ponto da foto sob ele', () => {
    const v = { scale: 0.5, x: -100, y: -50 }
    const z = zoomAround(v, 1, 150, 150)
    const before = { u: (150 - v.x) / v.scale, w: (150 - v.y) / v.scale }
    const after = { u: (150 - z.x) / z.scale, w: (150 - z.y) / z.scale }
    expect(after.u).toBeCloseTo(before.u)
    expect(after.w).toBeCloseTo(before.w)
  })

  it('pinça: afastar os dedos dobra a escala; mover junto arrasta', () => {
    const start = { scale: 0.5, x: 0, y: 0 }
    const spread = pinchView(start, { x: 100, y: 150 }, { x: 200, y: 150 }, { x: 50, y: 150 }, { x: 250, y: 150 })
    expect(spread.scale).toBeCloseTo(1)
    const pan = pinchView(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 130, y: 120 }, { x: 230, y: 120 })
    expect(pan).toEqual({ scale: 0.5, x: 30, y: 20 })
  })

  it('borracha: passa do limite só uma fração e volta ao soltar', () => {
    const min = minScale(1000, 1000, BOX)
    const r = rubberView({ scale: min, x: 100, y: 0 }, 1000, 1000, BOX)
    expect(r.x).toBeCloseTo(35)
    expect(clampView(r, 1000, 1000, BOX).x).toBe(0)
  })

  it('recorte final quadrado, dentro da foto, a partir de onde ela está', () => {
    const min = minScale(1000, 1000, BOX)
    const v = clampView({ scale: min * 2, x: -300, y: -150 }, 1000, 1000, BOX)
    const r = cropRect(v, 1000, 1000, BOX)
    expect(r.size).toBeCloseTo(500)
    expect(r.sx).toBeCloseTo(500)
    expect(r.sy).toBeCloseTo(250)
    expect(zoomOf(v, 1000, 1000, BOX)).toBeCloseTo(2)
  })
})
