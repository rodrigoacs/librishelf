<template>
  <!-- Resenha (só no celular, que pede kinds=all): texto borrado se tiver
       spoiler, até tocar em "Contém spoiler — mostrar" -->
  <template v-if="item.type === 'review'">
    <ReaderAvatar
      :username="item.username"
      :avatar="item.avatarVersion"
    />
    <div class="feed-body">
      <p class="feed-text">
        <ReaderName
          :username="item.username"
          :is-public="item.isPublic"
        />
        {{ ' ' + t('communityView.event_review') + ' ' }}
        <router-link
          v-if="item.isPublic"
          :to="bookLink(book)"
          class="book-link"
        >{{ book.title }}</router-link>
        <strong v-else>{{ book.title }}</strong>
      </p>
      <div
        class="feed-review"
        :class="{ concealed: spoilerHidden }"
      >
        <p
          class="feed-review-text"
          :aria-hidden="spoilerHidden ? 'true' : undefined"
          :inert="spoilerHidden || undefined"
        >{{ book.review.body }}{{ book.review.truncated ? '…' : '' }}</p>
        <button
          v-if="spoilerHidden"
          type="button"
          class="spoiler-btn"
          @click="emit('reveal', book.review.id)"
        >
          <i
            class="pi pi-exclamation-triangle"
            aria-hidden="true"
          ></i>
          {{ t('review.showSpoiler') }}
        </button>
      </div>
    </div>
  </template>

  <!-- Lista pública: capas em fila, numeradas se for ranking -->
  <template v-else-if="item.type === 'list'">
    <div class="feed-body">
      <p class="list-title">
        <router-link
          v-if="item.isPublic"
          :to="{ name: 'public-list', params: { username: item.username, id: book.list.id } }"
          class="book-link"
        >{{ book.title }}</router-link>
        <strong v-else>{{ book.title }}</strong>
      </p>
      <p class="feed-meta">
        {{ t('communityView.list_by', { name: `@${item.username}`, n: book.list.count }, book.list.count) }}
      </p>
      <ol
        class="list-covers"
        :class="{ ranked: book.list.ranked }"
      >
        <li
          v-for="entry in book.list.books"
          :key="entry.bookId"
        >
          <BookCover
            :book-id="entry.bookId"
            :version="entry.coverVersion"
            :title="entry.title"
            class="feed-cover"
          />
          <span
            v-if="book.list.ranked"
            class="rank"
            aria-hidden="true"
          >{{ entry.position }}</span>
          <span class="sr-only">{{ entry.title }}</span>
        </li>
      </ol>
    </div>
    <ReaderAvatar
      :username="item.username"
      :avatar="item.avatarVersion"
      class="list-avatar"
    />
  </template>

  <!-- Leu ou adicionou: um livro ou vários juntos -->
  <template v-else>
    <ReaderAvatar
      :username="item.username"
      :avatar="item.avatarVersion"
      :badge="item.type === 'read' ? 'pi pi-check' : 'pi pi-plus'"
    />
    <div class="feed-body">
      <p class="feed-text">
        <ReaderName
          :username="item.username"
          :is-public="item.isPublic"
        />
        <template v-if="item.books.length === 1">
          {{ ' ' + (item.type === 'read' ? t(book.reread ? 'communityView.event_reread' : 'communityView.event_read') : t('communityView.event_added')) + ' ' }}
          <router-link
            v-if="item.isPublic"
            :to="bookLink(book)"
            class="book-link"
          >{{ book.title }}</router-link>
          <strong v-else>{{ book.title }}</strong>
        </template>
        <template v-else>
          {{ ' ' + t(item.type === 'read' ? 'communityView.event_read_many' : 'communityView.event_added_many', { n: item.books.length }) }}
        </template>
      </p>
      <p
        v-if="item.books.length === 1"
        class="feed-meta"
      >
        <span v-if="book.authors">{{ book.authors }}</span>
        <StarRating
          v-if="item.type === 'read' && book.rating"
          :model-value="book.rating"
          size="sm"
          readonly
          class="feed-rating"
        />
      </p>
      <p
        v-else
        class="feed-meta many"
      >
        <span
          v-for="(entry, index) in item.books.slice(0, MANY_SHOWN)"
          :key="entry.bookId"
          class="many-item"
        ><router-link
            v-if="item.isPublic"
            :to="bookLink(entry)"
            class="book-link small"
          >{{ entry.title }}</router-link><template v-else>{{ entry.title }}</template>{{ index < Math.min(item.books.length, MANY_SHOWN) - 1 ? ', ' : '' }}</span>
        <span v-if="item.books.length > MANY_SHOWN"> {{ t('communityView.and_more', { n: item.books.length - MANY_SHOWN }) }}</span>
      </p>
    </div>
    <div
      class="feed-covers"
      :class="{ stack: item.books.length > 1 }"
      aria-hidden="true"
    >
      <BookCover
        v-for="entry in item.books.slice(0, COVERS_SHOWN)"
        :key="entry.bookId"
        :book-id="entry.bookId"
        :version="entry.coverVersion"
        :title="entry.title"
        :author="entry.authors"
        class="feed-cover"
      />
    </div>
  </template>
</template>

<script setup>
// Conteúdo de um evento do feed (o <li> é do CommunityFeed): resenha, lista
// pública ou "leu/adicionou" um ou vários livros (agrupados por groupFeed).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StarRating from '../StarRating.vue'
import ReaderName from '../ReaderName.vue'
import ReaderAvatar from '../ReaderAvatar.vue'
import BookCover from '../BookCover.vue'

const props = defineProps({
  item: { type: Object, required: true },
  // Ids das resenhas com spoiler que a pessoa já mandou mostrar
  shownSpoilers: { type: Set, required: true }
})

const emit = defineEmits(['reveal'])

const { t } = useI18n()

const MANY_SHOWN = 3
const COVERS_SHOWN = 3

const book = computed(() => props.item.books[0])
const spoilerHidden = computed(() => {
  const review = book.value.review
  return Boolean(review?.hasSpoiler) && !props.shownSpoilers.has(review.id)
})

function bookLink(entry) {
  return { name: 'public-library', params: { username: props.item.username }, query: { book: entry.bookId } }
}
</script>

<style scoped>
/* .feed-body e a linha (.feed-item) estão no CommunityFeed, que usa os dois
   também no esqueleto */
.feed-covers {
  display: flex;
  flex-shrink: 0;
}

.feed-cover {
  width: 40px;
  box-shadow: var(--shadow-2);
}

/* Vários livros: capas sobrepostas, como uma pilha */
.feed-covers.stack .feed-cover + .feed-cover {
  margin-left: -22px;
}

.feed-covers.stack .feed-cover {
  border: 2px solid var(--bg-app);
}

.feed-cover :deep(.title) {
  font-size: 0;
}

.feed-text {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.45;
}

.feed-meta {
  margin: 0.2rem 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

.feed-rating {
  margin-left: var(--space-2);
}

/* Título do livro em texto forte (o @nome já é o link colorido) */
.book-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 600;
}

.book-link:hover {
  color: var(--main-color);
  text-decoration: underline;
}

.feed-meta.many {
  display: block;
}

.many-item {
  white-space: normal;
}

.book-link.small {
  font-weight: 500;
  color: var(--text-secondary);
}

@media (max-width: 639.98px) {
  .feed-cover {
    width: 48px;
  }

  .book-link {
    font-family: var(--font-display);
  }

  .feed-review {
    position: relative;
    margin-top: var(--space-2);
  }

  .feed-review-text {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--fs-sm);
    line-height: 1.5;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    user-select: text;
  }

  .feed-review.concealed .feed-review-text {
    filter: blur(6px);
    opacity: 0.55;
    user-select: none;
  }

  .spoiler-btn {
    position: absolute;
    inset: 0;
    margin: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: fit-content;
    height: fit-content;
    min-height: 44px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .spoiler-btn .pi {
    color: var(--warning);
  }

  .list-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .list-title .book-link {
    font-weight: inherit;
  }

  .list-covers {
    display: flex;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    padding: 8px 8px 0 0;
    list-style: none;
    overflow: hidden;
  }

  .list-covers li {
    position: relative;
    flex: 0 0 auto;
  }

  .list-covers .feed-cover {
    width: 44px;
  }

  .rank {
    position: absolute;
    top: -6px;
    right: -6px;
    display: grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: var(--radius-pill);
    background: var(--main-solid);
    color: var(--on-main);
    font-size: var(--fs-2xs);
    font-weight: 700;
    box-shadow: 0 0 0 2px var(--bg-panel);
  }

  .list-covers li:first-child .rank {
    right: -4px;
  }

  .list-avatar {
    flex-shrink: 0;
  }
}
</style>
