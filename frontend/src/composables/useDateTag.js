import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { dateTag } from '../utils/dates.js'

/** Tag do Intl ('pt-BR' | 'en-US') do idioma da interface, reativa. */
export function useDateTag() {
  const { locale } = useI18n()
  return computed(() => dateTag(locale.value))
}
