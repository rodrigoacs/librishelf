import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { currentUser } from '../services/session.js'
import { avatarUrl } from '../utils/avatars.js'

/**
 * Nome e foto de quem está logado, para o menu e a barra do topo.
 * Foto de perfil (Conta → Foto de perfil); sem foto ou se a imagem falhar
 * (`photoFailed = true` no @error), `photo` vira null e quem usa mostra as
 * iniciais. Foto nova (avatarVersion muda) tenta de novo.
 */
export function useMyAvatar() {
  const { t } = useI18n()
  const displayName = computed(() => currentUser.value?.name || t('menu.guest'))
  const photoFailed = ref(false)
  watch(() => currentUser.value?.avatarVersion, () => { photoFailed.value = false })
  const photo = computed(() => (photoFailed.value ? null : avatarUrl(currentUser.value?.name, currentUser.value?.avatarVersion ?? null)))
  return { displayName, photo, photoFailed }
}
