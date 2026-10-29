<template>
  <div class="year-page">
    <div class="year-content">
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
            class="year-pill"
            :class="{ active: option === year }"
            :aria-current="option === year ? 'page' : undefined"
          >{{ option }}</router-link>
        </nav>
        </template>
      </PageHeader>

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
        <!-- Números grandes -->
        <section
          class="hero"
          :aria-label="t('year.summary')"
        >
          <div class="hero-card main">
            <span class="hero-value">{{ formatNumber(data.totals.readings) }}</span>
            <span class="hero-label">{{ t('year.booksRead', data.totals.readings) }}</span>
            <span
              v-if="data.totals.rereads"
              class="hero-note"
            >{{ t('year.rereads', { n: data.totals.rereads }, data.totals.rereads) }}</span>
          </div>
          <div class="hero-card">
            <span class="hero-value">{{ formatNumber(data.totals.pages) }}</span>
            <span class="hero-label">{{ t('year.pages', data.totals.pages) }}</span>
            <span
              v-if="data.totals.pagesMissing"
              class="hero-note"
            >{{ t('year.pagesMissing', { n: data.totals.pagesMissing }, data.totals.pagesMissing) }}</span>
          </div>
          <div class="hero-card">
            <span class="hero-value">
              <template v-if="data.totals.averageRating">
                {{ formatDecimal(data.totals.averageRating) }}<i
                  class="pi pi-star-fill star"
                  aria-hidden="true"
                ></i>
              </template>
              <template v-else>—</template>
            </span>
            <span class="hero-label">{{ t('year.averageRating') }}</span>
            <span
              v-if="data.totals.rated"
              class="hero-note"
            >{{ t('year.ratedCount', { n: data.totals.rated }, data.totals.rated) }}</span>
          </div>
          <div class="hero-card">
            <span class="hero-value">{{ compareValue }}</span>
            <span class="hero-label">{{ t('year.vsLast', { year: year - 1 }) }}</span>
            <span class="hero-note">{{ t('year.lastYearCount', { n: data.previousYear }, data.previousYear) }}</span>
          </div>
        </section>

        <!-- Meta -->
        <section
          v-if="data.goal"
          class="panel goal"
        >
          <div class="goal-head">
            <h2>{{ t('year.goalTitle') }}</h2>
            <span class="goal-numbers">{{ t('year.goalProgress', { done: data.goal.done, target: data.goal.target }) }}</span>
          </div>
          <div
            class="goal-bar"
            role="progressbar"
            :aria-valuenow="Math.min(data.goal.done, data.goal.target)"
            aria-valuemin="0"
            :aria-valuemax="data.goal.target"
            :aria-label="t('year.goalTitle')"
          >
            <span :style="{ width: `${Math.min(100, Math.round((data.goal.done / data.goal.target) * 100))}%` }"></span>
          </div>
          <p class="goal-note">{{ data.goal.done >= data.goal.target ? t('year.goalDone') : t('year.goalLeft', { n: data.goal.target - data.goal.done }, data.goal.target - data.goal.done) }}</p>
        </section>

        <!-- Mês a mês -->
        <section class="panel">
          <h2>{{ t('year.byMonth') }}</h2>
          <p
            v-if="data.busiestMonth"
            class="panel-sub"
          >{{ t('year.busiest', { month: monthName(data.busiestMonth.month), n: data.busiestMonth.count }, data.busiestMonth.count) }}</p>
          <ol class="months">
            <li
              v-for="(count, index) in data.months"
              :key="index"
              :class="{ peak: data.busiestMonth && index + 1 === data.busiestMonth.month, future: isFuture(index) }"
            >
              <span class="month-count">{{ count || '' }}</span>
              <span
                class="month-bar"
                :style="{ height: `${barHeight(count)}%` }"
                aria-hidden="true"
              ></span>
              <span
                class="month-label"
                aria-hidden="true"
              >{{ monthShort(index + 1) }}</span>
              <span class="sr-only">{{ t('year.monthCount', { month: monthName(index + 1), n: count }, count) }}</span>
            </li>
          </ol>
        </section>

        <!-- Melhores -->
        <section
          v-if="data.topRated.length"
          class="panel"
        >
          <div class="panel-head">
            <h2>{{ t('year.topRated') }}</h2>
            <AppButton
              :label="t('year.makeList')"
              icon="pi pi-list"
              class="btn-text btn-sm"
              :loading="makingList"
              @click="makeList"
            />
          </div>
          <ol class="top-books">
            <li
              v-for="(book, index) in data.topRated"
              :key="book.bookId"
            >
              <button
                type="button"
                class="top-book"
                @click="openBook(book.bookId)"
              >
                <span
                  class="top-rank"
                  aria-hidden="true"
                >{{ index + 1 }}</span>
                <BookCover
                  class="top-cover"
                  :book-id="book.bookId"
                  :version="book.coverVersion"
                  :title="book.title"
                  :author="book.authors || ''"
                />
                <span class="top-title">{{ book.title }}</span>
                <StarRating
                  :model-value="book.rating"
                  size="sm"
                  readonly
                />
              </button>
            </li>
          </ol>
        </section>

        <div class="two-cols">
          <!-- Autores e categorias -->
          <section
            v-if="data.authors.length || data.tags.length"
            class="panel"
          >
            <h2>{{ t('year.authorsTitle') }}</h2>
            <ol class="rank-list">
              <li
                v-for="author in data.authors"
                :key="author.name"
              >
                <span>{{ author.name }}</span>
                <span class="muted">{{ t('year.booksCount', { n: author.count }, author.count) }}</span>
              </li>
            </ol>
            <template v-if="data.tags.length">
              <h2 class="sub">{{ t('year.tagsTitle') }}</h2>
              <div class="tags">
                <span
                  v-for="tag in data.tags"
                  :key="tag.name"
                  class="tag"
                  :style="{ '--tag-color': tagColor(tag.name) }"
                >#{{ tag.name }} <small>{{ tag.count }}</small></span>
              </div>
            </template>
          </section>

          <!-- Recordes -->
          <section class="panel">
            <h2>{{ t('year.records') }}</h2>
            <dl class="records">
              <template
                v-for="record in records"
                :key="record.key"
              >
                <dt>{{ record.label }}</dt>
                <dd>
                  <button
                    v-if="record.book"
                    type="button"
                    class="record-book"
                    @click="openBook(record.book.bookId)"
                  >{{ record.book.title }}</button>
                  <span
                    v-if="record.detail"
                    class="muted"
                  >{{ record.book ? ` · ${record.detail}` : record.detail }}</span>
                </dd>
              </template>
            </dl>
          </section>
        </div>

        <!-- Imagem para stories -->
        <section
          class="panel story"
          :aria-labelledby="`${uid}-story`"
        >
          <div class="story-preview">
            <canvas
              ref="canvasEl"
              class="story-canvas"
              :class="{ ready: storyReady }"
              role="img"
              :aria-label="t('year.storyAlt', { year, n: data.totals.readings })"
            ></canvas>
            <span
              v-if="!storyReady"
              class="story-loading"
            >{{ t('year.storyDrawing') }}</span>
          </div>
          <div class="story-text">
            <h2 :id="`${uid}-story`">{{ t('year.storyTitle') }}</h2>
            <p>{{ t('year.storyText') }}</p>
            <div class="story-actions">
              <AppButton
                v-if="canShareFile"
                :label="t('year.share')"
                icon="pi pi-share-alt"
                class="btn-primary"
                :disabled="!storyReady"
                @click="shareStory"
              />
              <AppButton
                :label="t('year.download')"
                icon="pi pi-download"
                :class="canShareFile ? 'btn-outlined btn-secondary' : 'btn-primary'"
                :disabled="!storyReady"
                @click="downloadStory"
              />
            </div>
            <p class="story-note">{{ t('year.storyPrivacy') }}</p>
          </div>
        </section>
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import BookCover from '../components/BookCover.vue'
import StarRating from '../components/StarRating.vue'
import BookDialog from '../components/BookDialog.vue'
import api from '../services/api.js'
import { currentUser } from '../services/session.js'
import { useToast } from '../services/toast.js'
import { tagColor } from '../utils/tagColors.js'
import { drawYearStory, canvasToBlob } from '../utils/yearStory.js'

/**
 * "Seu ano em livros": números, mês a mês, melhores, recordes e uma imagem
 * 9:16 para stories feita no navegador. Vale o ano todo (no ano corrente,
 * "até hoje"); dá para ver os anos anteriores.
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const uid = `year-${Math.random().toString(36).slice(2, 8)}`
const CURRENT_YEAR = new Date().getFullYear()
const data = ref(null)
const loading = ref(true)
const loadError = ref(false)
const canvasEl = ref(null)
const storyReady = ref(false)
const makingList = ref(false)
const openedBookId = ref(null)
const bookDialogOpen = ref(false)
let storyBlob = null
let storyUrl = ''

const year = computed(() => Number(route.params.year) || CURRENT_YEAR)
const years = computed(() => data.value?.years ?? [CURRENT_YEAR])
const todayLabel = computed(() => new Date().toLocaleDateString(locale.value, { day: 'numeric', month: 'long' }))

// Compartilhar arquivo (folha do sistema) só onde o navegador aceita imagem
const canShareFile = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' &&
  (() => {
    try {
      return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
    } catch {
      return false
    }
  })()

const formatNumber = value => Number(value).toLocaleString(locale.value)
const formatDecimal = value => Number(value).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const monthName = month => new Date(2000, month - 1, 1).toLocaleDateString(locale.value, { month: 'long' })
const monthShort = month => new Date(2000, month - 1, 1).toLocaleDateString(locale.value, { month: 'narrow' })
const isFuture = index => year.value === CURRENT_YEAR && index > new Date().getMonth()

function barHeight(count) {
  const max = Math.max(1, ...(data.value?.months ?? [0]))
  return count ? Math.max(6, Math.round((count / max) * 100)) : 2
}

const compareValue = computed(() => {
  const diff = data.value.totals.readings - data.value.previousYear
  if (!data.value.previousYear) return '—'
  return diff > 0 ? `+${diff}` : String(diff)
})

function dateLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

const records = computed(() => {
  const d = data.value
  const list = []
  if (d.longest) list.push({ key: 'longest', label: t('year.longest'), book: d.longest, detail: t('year.pagesShort', { n: formatNumber(d.longest.pages) }) })
  if (d.shortest) list.push({ key: 'shortest', label: t('year.shortest'), book: d.shortest, detail: t('year.pagesShort', { n: formatNumber(d.shortest.pages) }) })
  if (d.fastest) list.push({ key: 'fastest', label: t('year.fastest'), book: d.fastest, detail: t('year.days', { n: d.fastest.days }, d.fastest.days) })
  if (d.averageDays !== null) list.push({ key: 'average', label: t('year.averageDays'), detail: t('year.days', { n: d.averageDays }, d.averageDays) })
  if (d.first) list.push({ key: 'first', label: t('year.first'), book: d.first, detail: dateLabel(d.first.finishedOn) })
  if (d.last) list.push({ key: 'last', label: d.isCurrentYear ? t('year.latest') : t('year.last'), book: d.last, detail: dateLabel(d.last.finishedOn) })
  if (d.totals.reviews) list.push({ key: 'reviews', label: t('year.reviews'), detail: t('year.reviewsCount', { n: d.totals.reviews }, d.totals.reviews) })
  return list
})

async function load() {
  loading.value = true
  loadError.value = false
  storyReady.value = false
  try {
    data.value = await api.getYearInBooks(year.value)
  } catch {
    loadError.value = true
    data.value = null
  } finally {
    loading.value = false
  }
  if (data.value?.totals.readings) {
    await nextTick()
    drawStory()
  }
}

// ------------------------------------------------------------ imagem

function storyText() {
  const d = data.value
  const highlights = []
  if (d.topRated[0]) highlights.push(t('year.storyFavorite', { title: d.topRated[0].title }))
  if (d.authors[0]?.count > 1) highlights.push(t('year.storyAuthor', { name: d.authors[0].name }))
  if (d.busiestMonth) highlights.push(t('year.storyMonth', { month: monthName(d.busiestMonth.month) }))
  if (highlights.length < 3 && d.longest) highlights.push(t('year.storyLongest', { title: d.longest.title, n: formatNumber(d.longest.pages) }))

  const stats = [{ value: formatNumber(d.totals.readings), label: t('year.booksRead', d.totals.readings) }]
  if (d.totals.pages) stats.push({ value: formatNumber(d.totals.pages), label: t('year.pages', d.totals.pages) })
  if (d.totals.averageRating) stats.push({ value: `${formatDecimal(d.totals.averageRating)}★`, label: t('year.averageRatingShort') })

  const user = currentUser.value
  const site = window.location.host
  return {
    kicker: 'LIBRISHELF',
    title: t('year.storyHeading'),
    subtitle: d.isCurrentYear ? t('year.soFar', { date: todayLabel.value }) : '',
    stats,
    highlights,
    footer: user?.isPublic ? `${site}/u/${user.name}` : site
  }
}

async function drawStory() {
  if (!canvasEl.value || !data.value) return
  storyReady.value = false
  try {
    await drawYearStory(canvasEl.value, { year: year.value, covers: data.value.covers, text: storyText() })
    storyBlob = await canvasToBlob(canvasEl.value)
    if (storyUrl) URL.revokeObjectURL(storyUrl)
    storyUrl = URL.createObjectURL(storyBlob)
    storyReady.value = true
  } catch {
    toast.add({ severity: 'error', summary: t('year.storyFailed'), life: 4000 })
  }
}

const fileName = () => `librishelf-${year.value}.png`

function downloadStory() {
  if (!storyUrl) return
  const link = document.createElement('a')
  link.href = storyUrl
  link.download = fileName()
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// A imagem já está pronta: o share sai no mesmo clique (o navegador exige)
async function shareStory() {
  if (!storyBlob) return
  const file = new File([storyBlob], fileName(), { type: 'image/png' })
  try {
    await navigator.share({ files: [file], title: t('year.title', { year: year.value }) })
  } catch (error) {
    if (error?.name !== 'AbortError') downloadStory()
  }
}

// ------------------------------------------------------------ ações

async function makeList() {
  makingList.value = true
  try {
    const ids = data.value.covers.map(cover => cover.bookId)
    const { list } = await api.createList({ title: t('lists.suggestBest', { year: year.value }), ranked: true, bookId: ids[0] })
    for (const id of ids.slice(1)) await api.addToList(list.id, id)
    toast.add({ severity: 'success', summary: t('year.listCreated'), life: 3000 })
    router.push({ name: 'list', params: { id: list.id } })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    makingList.value = false
  }
}

function openBook(bookId) {
  openedBookId.value = bookId
  bookDialogOpen.value = true
}

watch(year, load, { immediate: true })

onBeforeUnmount(() => {
  if (storyUrl) URL.revokeObjectURL(storyUrl)
})
</script>

<style scoped>
.year-page {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.year-content {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  color: var(--main-color);
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* 2rem até o conteúdo, contando o gap de 1.25rem do .year-content */
.year-content > .page-header {
  margin-bottom: 0.75rem;
}

.year-content > .page-header :deep(.page-header-actions) {
  min-width: 0;
  max-width: 100%;
}

.years {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  max-width: 100%;
  padding: 0.2rem;
  scrollbar-width: thin;
}

.year-pill {
  flex-shrink: 0;
  padding: 0.35rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-decoration: none;
}

.year-pill:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.year-pill.active {
  border-color: transparent;
  background: var(--main-solid);
  color: var(--on-main);
}

.year-pill:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.skeletons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Números grandes */
.hero {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.hero-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  min-width: 0;
}

.hero-card.main {
  border-color: transparent;
  background: linear-gradient(135deg, rgba(var(--main-solid-rgb), 1), rgba(var(--main-solid-rgb), 0.72));
  color: var(--on-main);
}

.hero-value {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  font-weight: 700;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}

.hero-value .star {
  font-size: var(--fs-xl);
  color: var(--rating);
}

.hero-label {
  font-size: var(--fs-sm);
  font-weight: 600;
}

.hero-card:not(.main) .hero-label {
  color: var(--text-secondary);
}

.hero-note {
  font-size: var(--fs-xs);
  opacity: 0.85;
}

.hero-card:not(.main) .hero-note {
  color: var(--text-muted);
  /* text-muted já está no limite (5,7:1); com a transparência caía para 4,1 */
  opacity: 1;
}

/* Painéis */
.panel {
  padding: 1.25rem 1.4rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  min-width: 0;
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: var(--fs-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.panel h2.sub {
  margin-top: 1.25rem;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.panel-head h2 {
  margin: 0;
}

.panel-sub {
  margin: -0.4rem 0 1rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.muted {
  color: var(--text-muted);
}

/* Meta */
.goal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.goal-numbers {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.goal-bar {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
}

.goal-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--main-solid);
}

.goal-note {
  margin: 0.6rem 0 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

/* Mês a mês */
.months {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  gap: 0.4rem;
  height: 11rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.months li {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
  height: 100%;
  min-width: 0;
}

.month-bar {
  width: 100%;
  max-width: 2.6rem;
  border-radius: var(--radius-sm) var(--radius-sm) 2px 2px;
  background: rgba(var(--main-color-rgb), 0.35);
}

.peak .month-bar {
  background: var(--main-solid);
}

.future .month-bar {
  background: var(--bg-input);
}

.month-count {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-height: 1em;
}

.month-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
}

/* Melhores */
.top-books {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.top-book {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.top-book:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

.top-cover {
  width: 100%;
  box-shadow: var(--shadow-2);
  transition: transform 0.15s ease;
}

.top-book:hover .top-cover {
  transform: translateY(-3px);
}

.top-rank {
  position: absolute;
  top: -0.5rem;
  left: -0.5rem;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  background: var(--main-solid);
  color: var(--on-main);
  font-weight: 700;
  font-size: var(--fs-sm);
  box-shadow: var(--shadow-2);
}

.top-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-sm);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.two-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.25rem;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank-list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: var(--fs-md);
}

.rank-list li span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag {
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in srgb, var(--tag-color) 45%, transparent);
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
  font-size: var(--fs-sm);
  font-weight: 600;
}

.tag small {
  opacity: 0.75;
  margin-left: 0.15rem;
}

.records {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.55rem 1rem;
  margin: 0;
  font-size: var(--fs-md);
}

.records dt {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  padding-top: 0.1rem;
}

.records dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.record-book {
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.record-book:hover {
  color: var(--main-color);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.record-book:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

/* Imagem para stories */
.story {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 2rem;
}

.story-preview {
  position: relative;
  width: 15rem;
  aspect-ratio: 9 / 16;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #0e0e11;
  box-shadow: var(--shadow-3);
}

.story-canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.story-canvas.ready {
  opacity: 1;
}

.story-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--fs-sm);
}

.story-text h2 {
  margin-bottom: 0.5rem;
}

.story-text p {
  margin: 0 0 1rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.story-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.story-text .story-note {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .top-cover,
  .story-canvas {
    transition: none;
  }
}

@media (max-width: 1023.98px) {
  .hero {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .two-cols {
    grid-template-columns: minmax(0, 1fr);
  }

  .top-books {
    grid-template-columns: repeat(auto-fill, minmax(5.25rem, 1fr));
    gap: 0.85rem 0.75rem;
  }
}

@media (max-width: 639.98px) {
  .year-page {
    padding: 1.25rem;
  }

  .hero-value {
    font-size: var(--fs-2xl);
  }

  .hero-card {
    padding: 0.9rem 1rem;
  }

  .panel {
    padding: 1.1rem;
  }

  .months {
    gap: 0.2rem;
    height: 9rem;
  }

  .story {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    text-align: center;
  }

  .story-actions {
    justify-content: center;
  }
}
</style>
