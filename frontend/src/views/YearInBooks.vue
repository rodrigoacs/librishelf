<template>
  <div class="page year-page">
    <PageHeader
      :title="t('year.title', { year })"
      :subtitle="data?.isCurrentYear ? t('year.soFar', { date: todayLabel }) : ''"
      divider
    >
      <template #kicker>
        <p class="kicker">
          <i
            class="pi pi-sparkles"
            aria-hidden="true"
          ></i>
          {{ t('year.kicker') }}
        </p>
      </template>
      <template
        v-if="years.length > 1"
        #actions
      >
      <nav
        class="years"
        :aria-label="t('year.chooseYear')"
      >
        <router-link
          v-for="option in years"
          :key="option"
          :to="{ name: 'year', params: { year: option } }"
          class="pill-button"
          :class="{ active: option === year }"
          :aria-current="option === year ? 'page' : undefined"
        >{{ option }}</router-link>
      </nav>
      </template>
    </PageHeader>
    <div class="year-content">

      <div
        v-if="loading"
        class="skeletons"
        aria-busy="true"
        :aria-label="t('common.loading')"
      >
        <AppSkeleton
          v-for="n in 3"
          :key="n"
          height="8rem"
          border-radius="var(--radius-lg)"
        />
      </div>

      <EmptyState
        v-else-if="loadError"
        variant="error"
        :title="t('year.loadFailed')"
        @action="load"
      />

      <EmptyState
        v-else-if="data && data.totals.readings === 0"
        icon="pi pi-book"
        :title="data.isCurrentYear ? t('year.emptyCurrent') : t('year.emptyPast', { year })"
        :text="t('year.emptyHint')"
      >
        <template #action>
          <router-link
            :to="{ name: 'library' }"
            class="btn btn-outlined btn-secondary"
          >{{ t('year.goLibrary') }}</router-link>
        </template>
      </EmptyState>

      <template v-else-if="data">
        <YearHero
          :totals="data.totals"
          :previous-year="data.previousYear"
          :year="year"
        />

        <YearGoal
          v-if="data.goal"
          :goal="data.goal"
        />

        <YearMonths
          :months="data.months"
          :busiest-month="data.busiestMonth"
          :year="year"
        />

        <YearTopRated
          v-if="data.topRated.length"
          :books="data.topRated"
          :covers="data.covers"
          :year="year"
          @open="openBook"
        />

        <div class="two-cols">
          <YearAuthors
            v-if="data.authors.length || data.tags.length"
            :authors="data.authors"
            :tags="data.tags"
          />
          <YearRecords
            :data="data"
            @open="openBook"
          />
        </div>

        <YearStory
          :data="data"
          :year="year"
          :today-label="todayLabel"
        />
      </template>
    </div>

    <BookDialog
      v-if="openedBookId"
      v-model="bookDialogOpen"
      :book-id="openedBookId"
    />
  </div>
</template>

<script setup>
import PageHeader from '../components/ui/PageHeader.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import BookDialog from '../components/BookDialog.vue'
import YearHero from '../components/year/YearHero.vue'
import YearGoal from '../components/year/YearGoal.vue'
import YearMonths from '../components/year/YearMonths.vue'
import YearTopRated from '../components/year/YearTopRated.vue'
import YearAuthors from '../components/year/YearAuthors.vue'
import YearRecords from '../components/year/YearRecords.vue'
import YearStory from '../components/year/YearStory.vue'
import api from '../services/api.js'

/**
 * "Seu ano em livros": números, mês a mês, melhores, recordes e uma imagem
 * 9:16 para stories feita no navegador. Vale o ano todo (no ano corrente,
 * "até hoje"); dá para ver os anos anteriores. Cada seção é um componente
 * em components/year/.
 */
const { t, locale } = useI18n()
const route = useRoute()

const CURRENT_YEAR = new Date().getFullYear()
const data = ref(null)
const loading = ref(true)
const loadError = ref(false)
const openedBookId = ref(null)
const bookDialogOpen = ref(false)

const year = computed(() => Number(route.params.year) || CURRENT_YEAR)
const years = computed(() => data.value?.years ?? [CURRENT_YEAR])
const todayLabel = computed(() => new Date().toLocaleDateString(locale.value, { day: 'numeric', month: 'long' }))

async function load() {
  loading.value = true
  loadError.value = false
  try {
    data.value = await api.getYearInBooks(year.value)
  } catch {
    loadError.value = true
    data.value = null
  } finally {
    loading.value = false
  }
}

function openBook(bookId) {
  openedBookId.value = bookId
  bookDialogOpen.value = true
}

watch(year, load, { immediate: true })
</script>

<style scoped>
.year-page {
  /* Casca e recuo em .page (main.css) */
  --page-max: 1000px;
}

.year-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.kicker {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--main-color);
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.year-page > .page-header :deep(.page-header-actions) {
  min-width: 0;
  max-width: 100%;
}

.years {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  max-width: 100%;
  padding: 0.2rem;
  scrollbar-width: thin;
}

.skeletons {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.two-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-5);
}

@media (max-width: 1023.98px) {
  .two-cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
