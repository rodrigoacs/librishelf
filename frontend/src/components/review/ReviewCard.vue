<template>
  <article
    class="review-card"
    :class="{ flat }"
  >
    <header class="review-head">
      <div
        v-if="showBook || showAuthor"
        class="who"
      >
        <button
          v-if="showBook"
          type="button"
          class="book-link"
          @click="emit('open-book', review.bookId)"
        >
          <span class="book-title">{{ review.book.title }}</span>
          <span
            v-if="review.book.authors"
            class="book-authors"
          >{{ review.book.authors }}</span>
        </button>
        <span
          v-if="showAuthor"
          class="author"
        >
          <ReaderAvatar
            :username="review.author.username"
            size="sm"
          />
          <ReaderName
            :username="review.author.username"
            :is-public="review.author.isPublic"
            :query="{ book: review.bookId }"
          />
        </span>
      </div>
      <div class="meta">
        <!-- Sem cabeçalho (dentro do livro aberto) a nota já está logo acima -->
        <StarRating
          v-if="review.book.rating && (showBook || showAuthor)"
          :model-value="review.book.rating"
          size="sm"
          readonly
        />
        <span
          v-if="review.visibility === 'followers'"
          class="badge"
          v-tooltip.top="t('review.followersHint')"
        >
          <i
            class="pi pi-users"
            aria-hidden="true"
          ></i>
          {{ t('review.followersBadge') }}
        </span>
        <time
          class="date"
          :datetime="review.updatedAt"
        >{{ formattedDate }}</time>
      </div>
    </header>

    <div
      class="body-wrap"
      :class="{ concealed: spoilerHidden }"
    >
      <p
        :id="bodyId"
        ref="bodyEl"
        class="body"
        :class="{ clamped: !expanded && !plain }"
        :aria-hidden="spoilerHidden ? 'true' : undefined"
        :inert="spoilerHidden || undefined"
      >{{ review.body }}</p>
      <button
        v-if="spoilerHidden"
        type="button"
        class="spoiler-btn"
        @click="spoilerShown = true"
      >
        <i
          class="pi pi-eye"
          aria-hidden="true"
        ></i>
        {{ t('review.showSpoiler') }}
      </button>
    </div>

    <footer class="review-foot">
      <button
        v-if="overflowing && !spoilerHidden"
        type="button"
        class="text-btn"
        :aria-expanded="expanded"
        :aria-controls="bodyId"
        @click="expanded = !expanded"
      >{{ expanded ? t('review.readLess') : t('review.readMore') }}</button>
      <span class="spacer"></span>

      <button
        v-if="canInteract"
        type="button"
        class="like-btn"
        :class="{ liked }"
        :aria-pressed="liked"
        :aria-label="liked ? t('review.unlike') : t('review.like')"
        :disabled="liking"
        @click="toggleLike"
      >
        <i
          :class="liked ? 'pi pi-heart-fill' : 'pi pi-heart'"
          aria-hidden="true"
        ></i>
        <span
          v-if="likeCount > 0"
          aria-hidden="true"
        >{{ likeCount }}</span>
      </button>
      <span
        v-else-if="likeCount > 0"
        class="like-count"
        :aria-label="t('review.likes', { n: likeCount }, likeCount)"
      >
        <i
          class="pi pi-heart"
          aria-hidden="true"
        ></i>
        {{ likeCount }}
      </span>

      <button
        v-if="canInteract"
        type="button"
        class="icon-btn"
        :aria-label="t('review.report')"
        v-tooltip.top="t('review.report')"
        @click="reportOpen = true"
      >
        <i
          class="pi pi-flag"
          aria-hidden="true"
        ></i>
      </button>
    </footer>

    <ReportDialog
      v-if="canInteract"
      v-model:visible="reportOpen"
      :review-id="review.id"
    />
  </article>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ReaderAvatar from '../ReaderAvatar.vue'
import ReaderName from '../ReaderName.vue'
import StarRating from '../StarRating.vue'
import ReportDialog from './ReportDialog.vue'
import api from '../../services/api.js'
import { currentUser } from '../../services/session.js'
import { useToast } from '../../services/toast.js'

/**
 * Resenha de um leitor: texto (borrado se tiver spoiler, cortado se longo),
 * nota do livro, data, curtir e denunciar. Curtir/denunciar só para quem está
 * logado e não é o autor.
 */
const props = defineProps({
  review: { type: Object, required: true },
  // No perfil: mostra o livro; na comunidade do livro: mostra quem escreveu
  showBook: { type: Boolean, default: false },
  showAuthor: { type: Boolean, default: false },
  // Sem borda/fundo (dentro de outro painel)
  flat: { type: Boolean, default: false },
  // Moderação: texto inteiro, sem borrar e sem curtir/denunciar
  plain: { type: Boolean, default: false }
})
const emit = defineEmits(['open-book'])
const { t, locale } = useI18n()
const toast = useToast()

const bodyId = `review-body-${Math.random().toString(36).slice(2, 8)}`
const bodyEl = ref(null)
const expanded = ref(false)
const overflowing = ref(false)
const spoilerShown = ref(false)
const reportOpen = ref(false)
const liking = ref(false)
const liked = ref(Boolean(props.review.likedByMe))
const likeCount = ref(Number(props.review.likeCount || 0))

watch(() => props.review, review => {
  liked.value = Boolean(review.likedByMe)
  likeCount.value = Number(review.likeCount || 0)
  spoilerShown.value = false
  expanded.value = false
  nextTick(measure)
})

const spoilerHidden = computed(() => !props.plain && props.review.hasSpoiler && !spoilerShown.value)
const isOwn = computed(() => currentUser.value?.name === props.review.author?.username)
const canInteract = computed(() => !props.plain && Boolean(currentUser.value) && !isOwn.value)

const formattedDate = computed(() => {
  const date = new Date(props.review.updatedAt)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
})

// "Ler mais" só se o texto passar do corte
function measure() {
  const el = bodyEl.value
  if (!el || expanded.value) return
  overflowing.value = el.scrollHeight > el.clientHeight + 2
}

let observer = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && bodyEl.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(bodyEl.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

async function toggleLike() {
  const next = !liked.value
  liking.value = true
  // Muda na hora; volta se der erro
  liked.value = next
  likeCount.value += next ? 1 : -1
  try {
    const result = await api.likeReview(props.review.id, next)
    if (typeof result?.likeCount === 'number') likeCount.value = result.likeCount
  } catch (error) {
    liked.value = !next
    likeCount.value += next ? -1 : 1
    toast.add({ severity: 'error', summary: t('review.likeFailed'), detail: error.message, life: 4000 })
  } finally {
    liking.value = false
  }
}
</script>

<style scoped>
.review-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  min-width: 0;
}

.review-card.flat {
  padding: 0.25rem 0 0;
  border: none;
  border-radius: 0;
  background: none;
}

/* Quem escreveu (ou o livro) em cima; nota, selo e data embaixo */
.review-head {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.who {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.book-link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.book-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-md);
  overflow-wrap: anywhere;
}

.book-link:hover .book-title {
  color: var(--main-color);
}

.book-link:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.book-authors {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-pill);
  background: rgba(var(--main-color-rgb), 0.12);
  color: var(--main-color);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.badge .pi {
  font-size: var(--fs-2xs);
}

.date {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.body-wrap {
  position: relative;
}

.body {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
  line-height: 1.55;
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.body.clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  line-clamp: 6;
  overflow: hidden;
}

.concealed .body {
  filter: blur(6px);
  user-select: none;
  min-height: 3.2em;
}

.spoiler-btn {
  position: absolute;
  inset: 0;
  margin: auto;
  width: fit-content;
  height: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-pill);
  background: var(--bg-panel);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-2);
}

.spoiler-btn:hover {
  border-color: var(--main-color);
  color: var(--main-color);
}

.review-foot {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
}

.spacer {
  flex: 1;
}

.text-btn {
  padding: 0.25rem 0;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.text-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.like-btn,
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.like-btn:hover,
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.like-btn.liked,
.like-btn.liked:hover {
  color: var(--red);
}

.like-btn:disabled {
  cursor: progress;
}

.icon-btn .pi {
  font-size: var(--fs-sm);
}

.like-count {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.5rem;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.like-btn:focus-visible,
.icon-btn:focus-visible,
.text-btn:focus-visible,
.spoiler-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

@media (pointer: coarse) {

  .like-btn,
  .icon-btn {
    min-width: 44px;
    height: 44px;
  }
}
</style>
