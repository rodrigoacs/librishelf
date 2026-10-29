/**
 * Movimento reduzido (preferência do sistema): rolagens animadas viram salto.
 * Use em scrollTo/scrollIntoView: { behavior: scrollBehavior() }.
 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

export function scrollBehavior(smooth = true) {
  return smooth && !prefersReducedMotion() ? 'smooth' : 'auto'
}
