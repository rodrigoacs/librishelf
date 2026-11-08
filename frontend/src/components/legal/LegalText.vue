<template>
  <component :is="tag"><template
      v-for="(part, index) in parts"
      :key="index"
    ><a
        v-if="part.link === 'email'"
        :href="`mailto:${CONTACT_EMAIL}`"
      >{{ CONTACT_EMAIL }}</a><router-link
        v-else-if="part.link"
        :to="{ name: part.link }"
        :target="newTab ? '_blank' : undefined"
        :rel="newTab ? 'noopener' : undefined"
      >{{ t(LINK_LABELS[part.link]) }}</router-link><template v-else>{{ part.text }}</template></template></component>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CONTACT_EMAIL } from '../../config/site.js'
import { splitLinks } from '../../utils/legalText.js'

/**
 * Frase já traduzida com legalParams() (utils/legalText.js): as marcas de
 * {terms}, {privacy} e {email} viram links. newTab: abre os termos em outra
 * aba (cadastro e aviso de versão nova, para não perder o que está na tela).
 */
const props = defineProps({
  text: { type: String, required: true },
  tag: { type: String, default: 'span' },
  newTab: { type: Boolean, default: false }
})

const { t } = useI18n()

const LINK_LABELS = { terms: 'legal.links.termsInline', privacy: 'legal.links.privacyInline' }

const parts = computed(() => splitLinks(props.text))
</script>
