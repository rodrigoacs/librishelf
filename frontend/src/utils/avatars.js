import { API_URL } from '../config/site.js'

/**
 * URL da foto de perfil. `version` é o avatarVersion do payload: número = a
 * pessoa tem foto e quem vê pode ver (vira ?v= para furar o cache quando a
 * foto muda); null/undefined = sem foto visível → o app mostra a inicial.
 * size: 'sm' (128 px, listas e cabeçalho) | 'lg' (384 px, perfil e Conta).
 */
export function avatarUrl(username, version, size = 'sm', ext = 'jpg') {
  if (!username || !Number.isFinite(version)) return null
  return `${API_URL}/avatars/${encodeURIComponent(username)}/${size}.${ext}?v=${version}`
}

/** Link de moderação: a foto mesmo oculta (vale só para a versão denunciada). */
export function moderationAvatarUrl(token) {
  return `${API_URL}/moderation/avatar/image?token=${encodeURIComponent(token)}`
}
