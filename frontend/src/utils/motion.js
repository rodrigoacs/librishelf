/**
 * Movimento do app: uma fonte só para durações, curvas e decisões de gesto.
 *
 * Os mesmos valores estão como tokens no topo do main.css (--dur-*, --ease-*);
 * o teste motion.test.js confere que os dois lados não se separam. Use os
 * tokens no CSS e MOTION aqui quando a animação for feita no JS (gestos e a
 * capa que viaja entre telas, com element.animate).
 */

export const MOTION = {
  // Durações (ms)
  short: 120, // toque, troca de cor, chips
  medium: 240, // telas, folhas fechando, aviso entrando
  long: 380, // capa que viaja, gráficos crescendo
  spring: 560, // folha e gaveta assentando (duração da curva de mola)
  stagger: 28, // diferença entre itens que entram em cascata
  staggerMax: 10, // depois do 10º item, todos entram juntos
  // Curvas
  easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
  easeEnter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  easeExit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  // Toque
  pressScale: 0.97
}

/**
 * Curva de mola em linear(): sobe com uma leve sobra e se assenta.
 * zeta < 1 = amortecimento abaixo do crítico (0.72 → ~3,5% de sobra).
 * Gera a string do token --ease-spring (o main.css guarda o resultado).
 */
export function springEasing({ zeta = 0.72, omega = 12, points = 26 } = {}) {
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  // Tempo até ficar a 0,1% do alvo (envelope e^(-zeta·omega·t))
  const end = Math.log(1000) / (zeta * omega)
  const values = []
  for (let i = 0; i <= points; i++) {
    const t = (end * i) / points
    const y = 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t))
    values.push(i === points ? 1 : Math.round(y * 1000) / 1000)
  }
  return `linear(${values.join(', ')})`
}

export const SPRING = springEasing()

/** Movimento reduzido (preferência do sistema): rolagens animadas viram salto. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** Use em scrollTo/scrollIntoView: { behavior: scrollBehavior() }. */
export function scrollBehavior(smooth = true) {
  return smooth && !prefersReducedMotion() ? 'smooth' : 'auto'
}

/** Celular (abaixo de 640 px): só aqui entram gestos e transições de tela. */
export const PHONE_QUERY = '(max-width: 639.98px)'

export function isPhone() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(PHONE_QUERY).matches)
}

/** Anima no celular, sem movimento reduzido. */
export function canAnimate() {
  return isPhone() && !prefersReducedMotion()
}

/** Atraso de cascata do item i (para --stagger-delay), com teto. */
export function staggerDelay(index) {
  return Math.min(Math.max(index, 0), MOTION.staggerMax) * MOTION.stagger
}

// ---------------------------------------------------------------------------
// Gestos: folha (puxar para baixo), gaveta (puxar para o lado) e puxar para
// atualizar. A distância é no sentido de fechar/abrir; a velocidade em px/ms.
// ---------------------------------------------------------------------------

export const GESTURE = {
  // Um puxão rápido decide mesmo curto…
  flingVelocity: 0.5,
  // …mas precisa ter andado um pouco (um toque trêmulo não fecha nada)
  flingMinDistance: 12,
  // Devagar: passou desta fração do tamanho, completa
  distanceRatio: 0.35,
  // Gaveta: começa a arrastar só a partir desta faixa da borda esquerda
  edgeWidth: 24,
  // Movimento mínimo antes de decidir se é gesto ou rolagem
  slop: 8,
  // Puxar para atualizar: distância (já com resistência) que dispara
  refreshTrigger: 72,
  refreshMax: 120
}

/**
 * Soltou o dedo: completa o gesto (fechar a folha, abrir/fechar a gaveta) ou
 * volta? distance e velocity positivos = no sentido de completar.
 */
export function shouldComplete({ distance, velocity, size }) {
  if (!(size > 0)) return false
  if (velocity >= GESTURE.flingVelocity && distance >= GESTURE.flingMinDistance) return true
  if (velocity <= -GESTURE.flingVelocity) return false
  return distance >= size * GESTURE.distanceRatio
}

/** Resistência de borracha além do limite (puxar para atualizar, folha para cima). */
export function rubberBand(offset, limit = GESTURE.refreshMax) {
  if (offset <= 0) return 0
  return limit * (1 - 1 / ((offset * 0.55) / limit + 1))
}

/**
 * Velocidade a partir das últimas amostras { t, v } (ms, px), olhando só os
 * últimos ~80 ms: o que importa é o movimento perto de soltar.
 */
export function velocityFrom(samples, windowMs = 80) {
  if (!samples || samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break
    first = samples[i]
  }
  const dt = last.t - first.t
  return dt > 0 ? (last.v - first.v) / dt : 0
}

// ---------------------------------------------------------------------------
// Transição entre telas: qual animação, pelo sentido da navegação
// ---------------------------------------------------------------------------

/**
 * Sentido pela posição no histórico (history.state.position do vue-router):
 * maior = avançou, menor = voltou; sem posição (replace, primeira tela) = troca.
 */
export function navDirection(fromPosition, toPosition) {
  if (!Number.isFinite(fromPosition) || !Number.isFinite(toPosition) || fromPosition === toPosition) return 'swap'
  return toPosition > fromPosition ? 'forward' : 'back'
}

/**
 * Animação da troca de tela no celular:
 *   book-open / book-close  livro aberto (?book=) entrando ou saindo: a capa viaja
 *   push / pop              tela mais funda (lista → detalhe) entrando ou saindo,
 *                           conforme o sentido (avançar/voltar) e a profundidade
 *   fade                    troca entre telas do mesmo nível (itens do menu) ou
 *                           sem sentido conhecido (redirecionamento)
 *   null                    mesma tela, só a URL mudou (filtros): sem animação
 * depth: meta.depth da rota (1 = tela do menu, 2 = detalhe).
 */
export function pickTransition({ fromPath, toPath, fromBook, toBook, direction, fromDepth = 1, toDepth = 1 }) {
  if (fromPath === toPath) {
    if (!fromBook && toBook) return 'book-open'
    if (fromBook && !toBook) return 'book-close'
    return null
  }
  if (toDepth > fromDepth) return direction === 'back' ? 'pop' : 'push'
  if (toDepth < fromDepth) return direction === 'forward' ? 'push' : 'pop'
  return 'fade'
}
