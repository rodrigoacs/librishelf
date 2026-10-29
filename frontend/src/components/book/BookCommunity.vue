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
        <button
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
          v-show="communityOpen"
          id="book-community-panel"
          class="community-panel"
        >
          <ul class="reader-list">
            <li
              v-for="reader in community.readers"
              :key="reader.username"
            >
              <router-link
                :to="{ name: 'public-library', params: { username: reader.username } }"
                class="reader-link"
              >@{{ reader.username }}</router-link>
              <i
                v-if="reader.hasRead"
                class="pi pi-check-circle text-theme"
                v-tooltip.top="t('community.has_read')"
                :aria-label="t('community.has_read')"
              ></i>
              <StarRating
                v-if="reader.rating"
                :model-value="reader.rating"
                size="sm"
                readonly
              />
            </li>
          </ul>

          <div
            v-if="community.alsoHave.length"
            class="also-have"
          >
            <h3>{{ t('community.also_have') }}</h3>
            <ul>
              <li
                v-for="item in community.alsoHave.slice(0, ALSO_HAVE_SHOWN)"
                :key="`${item.owner}-${item.bookId}`"
              >
                <router-link
                  :to="{ name: 'public-library', params: { username: item.owner }, query: { book: item.bookId } }"
                  class="also-link"
                >
                  <span class="also-title">{{ item.title }}</span>
                  <span
                    v-if="item.authors"
                    class="also-authors"
                  >{{ item.authors }}</span>
                </router-link>
                <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers)
                  }}</span>
              </li>
            </ul>
          </div>
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
import StarRating from '../StarRating.vue'
import ReviewCard from '../review/ReviewCard.vue'
import { currentUser } from '../../services/session.js'

/** Comunidade do livro: quem mais tem, média das notas e "quem tem também tem". */
const props = defineProps({
  bookId: { type: Number, required: true }
})

const { t } = useI18n()

const ALSO_HAVE_SHOWN = 3
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
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
  border-radius: 4px;
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
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
  border-radius: 6px;
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

.reader-list,
.also-have ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.reader-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.reader-list li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-input);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: var(--fs-sm);
}

.reader-link,
.also-link,
.community-hint a {
  color: var(--main-color);
  text-decoration: none;
}

.reader-link:hover,
.also-link:hover .also-title,
.community-hint a:hover {
  text-decoration: underline;
}

.also-have h3 {
  margin: 0 0 0.35rem;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.also-have li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border-color);
}

.also-have li:last-child {
  border-bottom: none;
}

.also-link {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.also-title {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.also-authors,
.also-count {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.also-count {
  flex-shrink: 0;
}

.community-hint {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.45;
}

.text-theme {
  color: var(--main-color);
  font-weight: bold;
}
</style>
