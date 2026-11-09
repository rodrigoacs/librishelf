<template>
  <ul
    v-if="loading && events.length === 0"
    class="feed-list skeleton-list"
    aria-busy="true"
    :aria-label="t('common.loading')"
  >
    <li
      v-for="n in 4"
      :key="n"
      class="feed-item"
    >
      <AppSkeleton
        width="40px"
        height="40px"
        border-radius="50%"
      />
      <div class="feed-body">
        <AppSkeleton
          width="80%"
          height="1rem"
        />
        <AppSkeleton
          width="45%"
          height="0.8rem"
          class="skeleton-gap"
        />
      </div>
      <AppSkeleton
        width="40px"
        height="60px"
        border-radius="var(--radius-sm)"
      />
    </li>
  </ul>
  <EmptyState
    v-else-if="error"
    variant="error"
    compact
    :level="3"
    :title="t('communityView.load_error')"
    :loading="loading"
    @action="load()"
  />
  <EmptyState
    v-else-if="events.length === 0"
    compact
    :level="3"
    icon="pi pi-globe"
    :title="t('communityView.feed_empty_title')"
    :text="t('communityView.feed_empty')"
  />

  <div
    v-else
    class="feed-days"
  >
    <section
      v-for="day in feedDays"
      :key="day.key"
      class="feed-day"
      :aria-label="dayLabel(day.date, { t, locale })"
    >
      <h2 class="day-title">{{ dayLabel(day.date, { t, locale }) }}</h2>
      <ul class="feed-list">
        <li
          v-for="item in day.items"
          :key="item.key"
          class="feed-item"
          :class="`kind-${item.type}`"
          :style="{ '--i': staggerIndex(item) }"
        >
          <CommunityFeedItem
            :item="item"
            :shown-spoilers="shownSpoilers"
            @reveal="revealSpoiler"
          />
        </li>
      </ul>
    </section>
  </div>

  <div
    v-if="hasMore"
    class="load-more"
  >
    <AppButton
      :label="t('publicLibrary.loadMore')"
      icon="pi pi-angle-down"
      class="btn-outlined btn-secondary"
      :loading="loading"
      @click="load({ append: true })"
    />
  </div>
</template>

<script setup>
// Aba "Feed" da Comunidade: eventos de quem a pessoa segue, agrupados por dia,
// com "Carregar mais". Quem decide quando recarregar é a tela (load exposto).
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import AppButton from '../ui/AppButton.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import CommunityFeedItem from './CommunityFeedItem.vue'
import { groupFeed, dayLabel } from '../../utils/feedGroups.js'
import { useIsPhone } from '../../composables/useIsPhone.js'

const { t, locale } = useI18n()

const events = ref([])
const page = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const error = ref(false)

// Feed agrupado por dia, com eventos repetidos juntos
const feedDays = computed(() => groupFeed(events.value))

// Celular: o feed traz também resenhas e listas (kinds=all), em cartões
const phone = useIsPhone()
const feedKinds = () => (phone.value ? 'all' : undefined)

// Cascata só para o que acabou de chegar (a página seguinte não refaz a primeira)
let staggerBase = 0
const staggerOrder = new Map()
function staggerIndex(item) {
  if (!staggerOrder.has(item.key)) staggerOrder.set(item.key, staggerOrder.size)
  return Math.max(0, staggerOrder.get(item.key) - staggerBase)
}

const shownSpoilers = ref(new Set())
function revealSpoiler(reviewId) {
  shownSpoilers.value = new Set(shownSpoilers.value).add(reviewId)
}

async function load({ append = false } = {}) {
  loading.value = true
  error.value = false
  try {
    const next = append ? page.value + 1 : 1
    const result = await api.getFeed(next, feedKinds())
    if (!append) {
      staggerOrder.clear()
      staggerBase = 0
    } else {
      staggerBase = staggerOrder.size
    }
    events.value = append ? [...events.value, ...result.events] : result.events
    page.value = next
    hasMore.value = result.hasMore
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

// Girou/redimensionou passando dos 640 px: o feed muda de formato
watch(phone, () => load())

const isEmpty = computed(() => events.value.length === 0)

defineExpose({ load, isEmpty })
</script>

<style scoped>
.skeleton-gap {
  margin-top: var(--space-2);
}

.feed-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feed-days {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.day-title {
  margin: 0 0 var(--space-1);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.feed-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-color);
}

.feed-item:last-child {
  border-bottom: none;
}

.feed-item :deep(.feed-body) {
  flex: 1;
  min-width: 0;
}

.load-more {
  display: flex;
  justify-content: center;
}

@media (max-width: 639.98px) {
  /* Feed em cartões, como no trailer: capa à direita, resenha e lista com
     cara própria; entram em cascata (só os que acabaram de chegar) */
  .feed-days {
    gap: var(--space-5);
  }

  .feed-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .feed-item,
  .feed-item:last-child {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-color);
    border-radius: var(--card-radius);
    background: var(--bg-panel);
    animation: feed-in var(--dur-medium) var(--ease-enter) both;
    animation-delay: calc(min(var(--i, 0), 10) * var(--stagger));
  }

  .skeleton-list .feed-item {
    animation: none;
  }

  .kind-list {
    align-items: flex-start;
  }
}

@keyframes feed-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-item,
  .feed-item:last-child {
    animation: none !important;
  }
}
</style>
