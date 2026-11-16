/**
 * Primeiros passos (pacote 42). A ordem dos passos é a mesma do servidor
 * (onboardingService.STEPS); o estado fica lá, no /auth/me e no /onboarding.
 */
export const STEPS = ['start', 'books', 'public', 'finish']

/** Pendentes levam do Início ao onboarding; pulados não (retomam pelo aviso). */
export const needsOnboarding = user => Boolean(user?.emailVerified && user.onboarding?.status === 'pending')

/** Pulou e ainda não terminou: o Início mostra "Continuar os primeiros passos". */
export const canResumeOnboarding = user => Boolean(user?.emailVerified && user.onboarding?.status === 'skipped')

/** Passo vizinho (step + 1 ou - 1), sem sair da lista. */
export function stepAfter(step, offset = 1) {
  const index = Math.max(0, STEPS.indexOf(step))
  return STEPS[Math.min(STEPS.length - 1, Math.max(0, index + offset))]
}

/** "Passo 2 de 4" */
export const stepNumber = step => Math.max(0, STEPS.indexOf(step)) + 1

/** Livros que faltam para uma meta (3 primeiros, 10 do Vanguarda); nunca negativo. */
export const booksLeft = (books, target) => Math.max(0, target - (books || 0))
