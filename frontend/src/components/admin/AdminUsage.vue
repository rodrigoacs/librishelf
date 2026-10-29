<template>
  <div class="usage">
    <AppSkeleton
      v-if="loading"
      height="420px"
    />
    <EmptyState
      v-else-if="failed"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="load"
    />

    <template v-else-if="data">
      <section
        class="card"
        aria-labelledby="admin-adoption-title"
      >
        <h2 id="admin-adoption-title">{{ t('admin.usage.adoption') }}</h2>
        <p class="hint">{{ t('admin.usage.adoptionHint', { n: data.adoption.users }) }}</p>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t('admin.usage.feature') }}</th>
              <th
                scope="col"
                class="num"
              >{{ t('admin.usage.accounts') }}</th>
              <th scope="col"><span class="sr-only">{{ t('admin.usage.share') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in adoption"
              :key="row.key"
            >
              <th scope="row">{{ t(`admin.usage.features.${row.key}`) }}</th>
              <td class="num">{{ formatNumber(row.value, locale) }}</td>
              <td class="share-cell">
                <div class="share">
                  <div
                    class="bar"
                    aria-hidden="true"
                  ><span :style="{ width: `${row.percent}%` }"></span></div>
                  <span class="pct">{{ row.percent }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        class="card"
        aria-labelledby="admin-events-title"
      >
        <h2 id="admin-events-title">{{ t('admin.usage.events') }}</h2>
        <p class="hint">{{ t('admin.usage.eventsHint') }}</p>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t('admin.usage.action') }}</th>
              <th
                scope="col"
                class="num"
              >{{ t('admin.usage.last7') }}</th>
              <th
                scope="col"
                class="num"
              >{{ t('admin.usage.last30') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.events"
              :key="row.event"
            >
              <th scope="row">{{ t(`admin.usage.eventNames.${row.event.replace('.', '_')}`) }}</th>
              <td class="num">{{ formatNumber(row.last7, locale) }}</td>
              <td class="num">{{ formatNumber(row.last30, locale) }}</td>
            </tr>
          </tbody>
        </table>
        <p
          v-if="scanShare !== null"
          class="note"
        >{{ t('admin.usage.scanShare', { p: scanShare }) }}</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import api from '../../services/api.js'
import { LockedError, useAdminCall, formatNumber } from './adminCall.js'

const { t, locale } = useI18n()
const call = useAdminCall()
const data = ref(null)
const loading = ref(true)
const failed = ref(false)

// Na ordem em que aparecem; as do topo são as mais "fundamentais"
const FEATURES = ['readingNow', 'rereads', 'goals', 'series', 'notes', 'reviews', 'lists', 'publicLibrary', 'community',
  'acceptsFollowers', 'following', 'followEmails', 'indexing', 'blocks']

const adoption = computed(() => {
  const a = data.value.adoption
  return FEATURES
    .map(key => ({ key, value: a[key], percent: a.users ? Math.round((a[key] / a.users) * 100) : 0 }))
    .sort((x, y) => y.value - x.value)
})

const scanShare = computed(() => {
  const events = Object.fromEntries(data.value.events.map(e => [e.event, e.last30]))
  const total = (events['isbn.scan'] || 0) + (events['isbn.typed'] || 0)
  return total ? Math.round((events['isbn.scan'] / total) * 100) : null
})

async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await call(() => api.adminUsage())
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.usage {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 1rem;
  align-items: start;
}

.card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
}

h2 {
  margin: 0;
  font-size: var(--fs-lg);
  color: var(--text-primary);
}

.hint,
.note {
  margin: 0.35rem 0 1rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.note {
  margin: 1rem 0 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

th,
td {
  text-align: left;
  padding: 0.5rem 0.4rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 400;
}

thead th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.share-cell {
  width: 40%;
}

.share {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-input);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: var(--main-color);
  border-radius: inherit;
}

.pct {
  width: 4.5ch;
  flex-shrink: 0;
  text-align: right;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem 1rem;
}
</style>
