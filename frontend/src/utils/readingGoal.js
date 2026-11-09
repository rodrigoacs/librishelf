/**
 * Meta anual de leitura no Painel: quanto falta, onde o leitor "deveria"
 * estar hoje e o recado (chave de `goal.*` nos locales).
 */

/** Fração do ano que já passou; null fora do ano atual. */
export function yearFraction(year, now = new Date()) {
  if (year !== now.getFullYear()) return null
  const start = new Date(year, 0, 1)
  const end = new Date(year + 1, 0, 1)
  return (now - start) / (end - start)
}

/**
 * { percent, pace, status }: percent da barra (0–100), pace = marcador do
 * ritmo em % (null fora do ano atual) e status = { key, n?, tone } ou null
 * sem meta.
 */
export function goalProgress({ goal, read, year, now = new Date() }) {
  const fraction = yearFraction(year, now)
  return {
    percent: goal ? Math.min(100, Math.round((read / goal) * 100)) : 0,
    pace: fraction === null ? null : Math.round(fraction * 100),
    status: goalStatus({ goal, read, year, fraction, now })
  }
}

function goalStatus({ goal, read, year, fraction, now }) {
  if (!goal) return null
  if (read >= goal) return { key: 'done', tone: 'good' }

  if (fraction === null) {
    return year < now.getFullYear()
      ? { key: 'missed', n: goal - read, tone: 'muted' }
      : { key: 'future', tone: 'muted' }
  }

  const diff = read - Math.floor(goal * fraction)
  if (diff > 0) return { key: 'ahead', n: diff, tone: 'good' }
  if (diff < 0) return { key: 'behind', n: -diff, tone: 'warn' }
  return { key: 'onTrack', tone: 'good' }
}
