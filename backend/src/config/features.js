/**
 * Mapa de recursos → 'free' | 'pro'. Quem decide é o servidor; o frontend só
 * esconde ou mostra a partir do que /auth/me devolve em plan.features.
 *
 * Regra de ouro: nada que é grátis hoje vira pago. Recurso novo do Pro entra
 * aqui como 'pro'; um recurso grátis nunca muda de lado.
 *
 * Os 'free' estão listados para o /auth/me e para os testes: requirePro()
 * deixa passar direto.
 */
export const FREE = 'free'
export const PRO = 'pro'

export const FEATURES = Object.freeze({
  // Grátis para sempre
  export: FREE,
  import: FREE,
  loans: FREE,

  // Pro
  stats_advanced: PRO,   // comparar períodos, gráficos personalizados, ritmo, editoras/autores ao longo dos anos
  collector: PRO,        // fotos do exemplar, localização física, preço pago, valor da coleção, lembrete de empréstimo
  personalization: PRO,  // temas e paletas extras (também na página pública), ícone alternativo, capa de fundo no perfil público
  auto_backup: PRO       // backup automático periódico
})

export const FEATURE_NAMES = Object.freeze(Object.keys(FEATURES))
export const PRO_FEATURES = Object.freeze(FEATURE_NAMES.filter(name => FEATURES[name] === PRO))

/** Tier do recurso. Nome desconhecido é erro de programação: falha na hora. */
export function tierOf(feature) {
  const tier = FEATURES[feature]
  if (!tier) throw new Error(`Recurso desconhecido: "${feature}". Cadastre em config/features.js.`)
  return tier
}

/** { recurso: liberado? } para quem tem (ou não) Pro. */
export function featureFlags(hasPro) {
  return Object.fromEntries(FEATURE_NAMES.map(name => [name, FEATURES[name] === FREE || hasPro]))
}
