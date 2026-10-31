<template>
  <section class="community-section">
    <p
      v-if="communityLoading"
      class="muted-line"
    >{{ t('common.loading') }}</p>

    <p
      v-else-if="communityError"
      class="muted-line"
    >{{ t('community.load_error') }}</p>

    <template v-else-if="community">
      <p
        v-if="community.readerCount === 0"
        class="muted-line"
      >
        <i
          class="pi pi-users"
          aria-hidden="true"
        ></i>
        {{ t('community.no_readers') }}
      </p>

      <template v-else>
        <!-- Celular: cartão com a pilha de avatares que abre uma folha -->
        <button
          v-if="phone"
          type="button"
          class="community-summary"
          aria-haspopup="dialog"
          @click="sheetOpen = true"
        >
          <span class="summary-text">
            <span class="summary-count">{{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}</span>
            <span class="summary-row">
              <AvatarStack
                :usernames="community.readers.map(r => r.username)"
                :total="community.readerCount"
                :max="4"
              />
              <span
                v-if="community.averageRating"
                class="summary-avg"
              >
                {{ t('community.average', { n: formatAverage(community.averageRating) }) }}
                <i
                  class="pi pi-star-fill"
                  aria-hidden="true"
                ></i>
              </span>
            </span>
          </span>
          <i
            class="pi pi-chevron-right summary-chevron"
            aria-hidden="true"
          ></i>
        </button>
        <AppDialog
          v-if="phone"
          v-model:visible="sheetOpen"
          :aria-label="t('community.sheetLabel')"
          dialog-class="community-sheet"
        >
          <div class="sheet-body">
            <IconButton
              class="sheet-close"
              icon="pi pi-times"
              :label="t('common.close')"
              @click="sheetOpen = false"
            />
            <p
              v-if="bookTitle"
              class="sheet-eyebrow"
            >
              {{ t('community.sheetEyebrow') }} · <strong>{{ bookTitle }}</strong>
            </p>
            <h2 class="sheet-title">{{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}</h2>
            <AvatarStack
              :usernames="community.readers.map(r => r.username)"
              :total="community.readerCount"
              size="md"
              animate
            />
            <p
              v-if="community.averageRating"
              class="sheet-avg"
            >
              {{ t('community.average', { n: formatAverage(community.averageRating) }) }}
              <i
                class="pi pi-star-fill"
                aria-hidden="true"
              ></i>
            </p>
            <BookCommunityReaders
              :community="community"
              rows
            />
          </div>
        </AppDialog>

        <button
          v-if="!phone"
          type="button"
          class="community-toggle"
          :aria-expanded="communityOpen"
          aria-controls="book-community-panel"
          @click="communityOpen = !communityOpen"
        >
          <i
            class="pi pi-users"
            aria-hidden="true"
          ></i>
          <span class="toggle-text">
            {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
            <span
              v-if="community.averageRating"
              class="avg-rating"
            >
              <i
                class="pi pi-star-fill"
                aria-hidden="true"
              ></i>
              {{ formatAverage(community.averageRating) }}
            </span>
          </span>
          <i
            class="pi pi-chevron-down chevron"
            :class="{ open: communityOpen }"
            aria-hidden="true"
          ></i>
        </button>

        <div
          v-if="!phone"
          v-show="communityOpen"
          id="book-community-panel"
          class="community-panel"
        >
          <BookCommunityReaders :community="community" />
        </div>
      </template>

      <div
        v-if="community.reviews?.length"
        class="community-reviews"
      >
        <h3>{{ t('review.fromReaders', { n: community.reviews.length }, community.reviews.length) }}</h3>
        <ReviewCard
          v-for="item in shownReviews"
          :key="item.id"
          :review="item"
          show-author
        />
        <button
          v-if="community.reviews.length > REVIEWS_SHOWN && !allReviews"
          type="button"
          class="more-reviews"
          @click="allReviews = true"
        >{{ t('review.showAll', { n: community.reviews.length }) }}</button>
      </div>

      <p
        v-if="!currentUser?.showInCommunity"
        class="community-hint"
      >
        <i18n-t
          scope="global"
          keypath="community.join_hint"
          tag="span"
        >
          <template #settings>
            <router-link :to="{ name: 'settings' }">{{ t('community.settings_link') }}</router-link>
          </template>
        </i18n-t>
      </p>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import ReviewCard from '../review/ReviewCard.vue'
import AppDialog from '../ui/AppDialog.vue'
import IconButton from '../form/IconButton.vue'
import AvatarStack from '../ui/AvatarStack.vue'
import BookCommunityReaders from './BookCommunityReaders.vue'
import { currentUser } from '../../services/session.js'
import { useIsPhone } from '../../composables/useIsPhone.js'

/** Comunidade do livro: quem mais tem, média das notas e "quem tem também tem". */
const props = defineProps({
  bookId: { type: Number, required: true },
  // Celular: título do livro no topo da folha "outros leitores têm este livro"
  bookTitle: { type: String, default: '' }
})

const phone = useIsPhone()
const sheetOpen = ref(false)

const { t } = useI18n()

const REVIEWS_SHOWN = 3

const allReviews = ref(false)
const shownReviews = computed(() => {
  const list = community.value?.reviews || []
  return allReviews.value ? list : list.slice(0, REVIEWS_SHOWN)
})

const communityOpen = ref(false)
const community = ref(null)
const communityLoading = ref(false)
const communityError = ref(false)

function formatAverage(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

async function loadCommunity() {
  if (!props.bookId) return
  communityLoading.value = true
  communityError.value = false
  sheetOpen.value = false
  allReviews.value = false
  try {
    community.value = await api.getBookCommunity(props.bookId)
  } catch {
    communityError.value = true
    community.value = null
  } finally {
    communityLoading.value = false
  }
}

watch(() => props.bookId, loadCommunity, { immediate: true })
</script>

<style scoped>
/* Resenhas de outros leitores */
.community-reviews {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.community-reviews h3 {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.more-reviews {
  align-self: flex-start;
  padding: 0.35rem 0.1rem;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.more-reviews:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.more-reviews:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

/* Comunidade recolhida */
.community-section {
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.muted-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.community-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0.35rem 0;
  font: inherit;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.community-toggle>.pi-users {
  color: var(--text-secondary);
}

.toggle-text {
  flex: 1;
  font-size: var(--fs-md);
}

.community-toggle:hover .toggle-text {
  color: var(--main-color);
}

.community-toggle:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.avg-rating {
  margin-left: 0.5rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.avg-rating .pi {
  color: var(--rating);
  font-size: var(--fs-sm);
}

.chevron {
  color: var(--text-muted);
  font-size: var(--fs-sm);
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}

.community-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.community-hint a {
  color: var(--main-color);
  text-decoration: none;
}

.community-hint a:hover {
  text-decoration: underline;
}

.community-hint {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.45;
}


/* Celular: cartão que abre a folha */
.community-summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.community-summary:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.summary-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-count {
  font-weight: 600;
}

.summary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
  margin-top: var(--space-1);
}

.summary-avg,
.sheet-avg {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.summary-avg .pi,
.sheet-avg .pi {
  color: var(--rating);
  font-size: var(--fs-xs);
}

.summary-chevron {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.sheet-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) calc(var(--space-5) + var(--safe-bottom, 0px));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.sheet-close {
  position: absolute;
  top: calc(-1 * var(--space-2));
  right: var(--space-2);
}

.sheet-eyebrow {
  margin: 0;
  padding-right: 3rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.sheet-eyebrow strong {
  color: var(--text-primary);
  font-family: var(--font-display);
}

.sheet-title {
  margin: 0;
  padding-right: 3rem;
  font-size: var(--fs-xl);
  line-height: 1.2;
}

.sheet-avg {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-md);
}
</style>
