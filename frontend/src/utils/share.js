/**
 * Compartilhar um link: no celular abre a folha de compartilhar do sistema
 * (WhatsApp, Telegram…); no computador copia para a área de transferência.
 * → 'shared' | 'copied' | 'cancelled' | 'failed'
 *   https://developer.mozilla.org/docs/Web/API/Navigator/share
 */
export async function shareLink({ title, text, url }) {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.share && (!navigator.canShare || navigator.canShare({ url }))) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (error) {
      // Fechou a folha sem escolher: não é erro
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
