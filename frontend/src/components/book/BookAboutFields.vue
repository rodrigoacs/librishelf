<template>
  <FormSection :legend="t('bookForm.aboutSection')">
    <div class="grid-2">
      <TextField
        :id="`${idPrefix}-publisher`"
        v-model="publisher"
        :label="t('bookForm.publisher')"
        :error="errors.publisher"
        maxlength="200"
      />
      <DateField
        :id="`${idPrefix}-pubdate`"
        v-model="pubdate"
        :label="t('bookForm.pubDate')"
        :min-date="PUB_MIN_DATE"
        :max-date="PUB_MAX_DATE"
        :error="errors.pubDate"
      />
    </div>

    <div class="grid-series">
      <TextField
        :id="`${idPrefix}-series`"
        v-model="series"
        :label="t('series.name')"
        :list="`${idPrefix}-series-options`"
        maxlength="200"
        :error="errors.series"
        :input-attrs="{ onFocus: loadSeriesOptions }"
      />
      <TextField
        :id="`${idPrefix}-volume`"
        v-model="seriesIndex"
        :label="t('series.volume')"
        inputmode="decimal"
        maxlength="7"
        :error="errors.seriesIndex"
      />
      <TextField
        :id="`${idPrefix}-pages`"
        v-model="pageCount"
        :label="t('bookForm.pages')"
        inputmode="numeric"
        maxlength="5"
        :error="errors.pageCount"
      />
    </div>
    <datalist :id="`${idPrefix}-series-options`">
      <option
        v-for="item in seriesOptions"
        :key="item.name"
        :value="item.name"
      ></option>
    </datalist>

    <TextField
      :id="`${idPrefix}-tags`"
      v-model="tags"
      :label="t('bookForm.tags')"
      :hint="t('bookForm.tagsHint')"
      :error="errors.tags"
    />
  </FormSection>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import FormSection from '../form/FormSection.vue'
import TextField from '../form/TextField.vue'
import DateField from '../form/DateField.vue'
import { PUB_MIN_DATE, PUB_MAX_DATE } from '../../utils/dates.js'

/**
 * "Sobre o livro" do formulário de livro (BookEditForm): editora, data de
 * publicação, série, volume, páginas e categorias.
 */
defineProps({
  idPrefix: { type: String, required: true },
  // Mensagens por campo (BookEditForm valida e limpa)
  errors: { type: Object, required: true }
})

const publisher = defineModel('publisher', { type: String })
const pubdate = defineModel('pubdate', { type: Date })
const series = defineModel('series', { type: String })
const seriesIndex = defineModel('seriesIndex', { type: [String, Number] })
const pageCount = defineModel('pageCount', { type: String })
const tags = defineModel('tags', { type: String })

const { t } = useI18n()

// Séries que a pessoa já tem, como sugestão (carrega no primeiro foco)
const seriesOptions = ref([])
async function loadSeriesOptions() {
  if (seriesOptions.value.length) return
  try {
    seriesOptions.value = await api.getSeries()
  } catch {
    seriesOptions.value = []
  }
}
</script>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
}

.grid-series {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem 6.5rem;
  gap: var(--space-4);
}

@media (max-width: 639.98px) {
  .grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }

  .grid-series {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .grid-series > :first-child {
    grid-column: 1 / -1;
  }
}
</style>
