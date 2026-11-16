<template>
  <!-- Visitas da página pública (pacote 41, Pro: page_visits). Sem Pro, a
       linha leva ao aviso do Pro; com Pro, a folha mostra os 30 dias. -->
  <SettingsRow
    :label="t('profilePage.visits.title')"
    :value="rowValue"
    icon="pi pi-chart-bar"
    interactive
    @click="open"
  />

  <AppDialog
    v-model:visible="sheetOpen"
    size="sm"
    dialog-class="settings-sheet"
    :header="t('profilePage.visits.title')"
  >
    <div class="sheet-stack">
      <ProNotice
        v-if="!pro"
        feature="page_visits"
      />
      <p
        v-else-if="failed"
        class="sheet-note danger"
      >{{ t('profilePage.visits.failed') }}</p>
      <template v-else-if="data">
        <p class="sheet-text">{{ t('profilePage.visits.total', { n: data.total, days: data.days }, data.total) }}</p>
        <ol
          class="visit-bars"
          role="img"
          :aria-label="t('profilePage.visits.chart', { n: data.total, days: data.days }, data.total)"
        >
          <li
            v-for="item in data.series"
            :key="item.day"
            :style="{ '--h': item.visits / peak }"
            :title="t('profilePage.visits.day', { date: shortDay(item.day), n: item.visits }, item.visits)"
          ></li>
        </ol>
        <p class="sheet-help">{{ t('profilePage.visits.help') }}</p>
      </template>
      <p
        v-else
        class="sheet-help"
        role="status"
      >{{ t('common.loading') }}</p>
    </div>
  </AppDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import ProNotice from '../ProNotice.vue'
import SettingsRow from './SettingsRow.vue'
import api from '../../services/api.js'
import { usePlan } from '../../services/plan.js'
import { localDate } from '../../utils/dates.js'
import { useDateTag } from '../../composables/useDateTag.js'

const { t } = useI18n()
const { canUse } = usePlan()
const tag = useDateTag()

const pro = computed(() => canUse('page_visits'))
const data = ref(null)
const failed = ref(false)
const sheetOpen = ref(false)

const peak = computed(() => Math.max(1, ...(data.value?.series ?? []).map(item => item.visits)))
const rowValue = computed(() => {
  if (!pro.value) return t('profilePage.visits.pro')
  return data.value ? t('profilePage.visits.short', { n: data.value.total, days: data.value.days }, data.value.total) : ''
})

const shortDay = day => localDate(day).toLocaleDateString(tag.value, { day: 'numeric', month: 'short' })

async function load() {
  failed.value = false
  try {
    data.value = await api.getPageVisits(30)
  } catch {
    failed.value = true
  }
}

function open() {
  sheetOpen.value = true
  if (pro.value) load()
}

// O número da linha aparece assim que o Pro estiver confirmado
watch(pro, value => { if (value && !data.value) load() }, { immediate: true })
</script>

<style scoped>
/* 30 barras finas, do dia mais antigo ao de hoje; altura por scaleY */
.visit-bars {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  align-items: end;
  gap: 2px;
  height: 6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.visit-bars li {
  height: 100%;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--main-solid);
  transform: scaleY(max(0.03, var(--h)));
  transform-origin: bottom;
}
</style>
