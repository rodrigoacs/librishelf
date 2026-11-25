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
        <h2 class="section-title" id="admin-adoption-title">{{ t('admin.usage.adoption') }}</h2>
        <p class="hint">{{ t('admin.usage.adoptionHint', { n: data.adoption.users }) }}</p>
        <div class="table-scroll">
          <table class="data-table">
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
                    <ProgressBar
                      class="share-bar"
                      :value="row.percent"
                    />
                    <span class="pct">{{ row.percent }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        class="card"
        aria-labelledby="admin-events-title"
      >
        <h2 class="section-title" id="admin-events-title">{{ t('admin.usage.events') }}</h2>
        <p class="hint">{{ t('admin.usage.eventsHint') }}</p>
        <div class="table-scroll">
          <table class="data-table">
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
        </div>
        <p
          v-if="scanShare !== null"
          class="note"
        >{{ t('admin.usage.scanShare', { p: scanShare }) }}</p>
      </section>

      <!-- Páginas públicas (pacote 41): visita → cadastro, sem dado de quem visitou -->
      <section
        v-if="pages"
        class="card"
        aria-labelledby="admin-public-pages-title"
      >
        <h2
          id="admin-public-pages-title"
          class="section-title"
        >{{ t('admin.publicPages.title') }}</h2>
        <p class="hint">{{ t('admin.publicPages.hint', { n: pages.days }) }}</p>
        <div class="table-scroll">
          <table class="data-table">
            <tbody>
              <tr
                v-for="event in PAGE_EVENTS"
                :key="event"
              >
                <th scope="row">{{ t(`admin.publicPages.events.${event}`) }}</th>
                <td class="num">{{ formatNumber(pages.totals[event], locale) }}</td>
              </tr>
              <tr>
                <th scope="row">{{ t('admin.publicPages.conversion') }}</th>
                <td class="num">{{ pages.conversion === null ? '–' : `${formatNumber(pages.conversion, locale)}%` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <template v-if="pages.topPages.length">
          <h3 class="section-title sub">{{ t('admin.publicPages.top') }}</h3>
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('admin.publicPages.page') }}</th>
                  <th
                    scope="col"
                    class="num"
                  >{{ t('admin.publicPages.events.visit') }}</th>
                  <th
                    scope="col"
                    class="num"
                  >{{ t('admin.publicPages.events.signup') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pages.topPages"
                  :key="row.username"
                >
                  <th scope="row">
                    <router-link :to="{ name: 'public-library', params: { username: row.username } }">/u/{{ row.username }}</router-link>
                  </th>
                  <td class="num">{{ formatNumber(row.visits, locale) }}</td>
                  <td class="num">{{ formatNumber(row.signups, locale) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p
          v-else
          class="note"
        >{{ t('admin.publicPages.empty') }}</p>
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
import ProgressBar from '../ui/ProgressBar.vue'
import { LockedError, useAdminCall, formatNumber } from './adminCall.js'

const { t, locale } = useI18n()
const call = useAdminCall()
const data = ref(null)
const pages = ref(null)
const PAGE_EVENTS = ['visit', 'share', 'invite_register', 'invite_login', 'signup']
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
    const [usage, publicPages] = await Promise.all([call(() => api.adminUsage()), call(() => api.adminPublicPages(30))])
    data.value = usage
    pages.value = publicPages
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
  gap: var(--space-4);
  align-items: start;
}

.card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
}

h2 {
  margin: 0;
}

.hint,
.note {
  margin: var(--space-1) 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.note {
  margin: var(--space-4) 0 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

th,
td {
  text-align: left;
  padding: var(--space-2) var(--space-2);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 400;
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
  gap: var(--space-2);
}

.share-bar {
  flex: 1;
  --bar-fill: var(--main-color);
}

h3.sub {
  margin: var(--space-5) 0 var(--space-2);
}

.pct {
  width: 4.5ch;
  flex-shrink: 0;
  text-align: right;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
