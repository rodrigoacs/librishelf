<template>
  <ul
    class="reader-list"
    :class="{ rows }"
  >
    <li
      v-for="reader in community.readers"
      :key="reader.username"
    >
      <ReaderAvatar
        v-if="rows"
        :username="reader.username"
        size="sm"
      />
      <router-link
        :to="{ name: 'public-library', params: { username: reader.username } }"
        class="reader-link"
      >@{{ reader.username }}</router-link>
      <i
        v-if="reader.hasRead"
        class="pi pi-check-circle text-theme"
        v-tooltip.top="t('community.has_read')"
        aria-hidden="true"
      ></i>
      <span
        v-if="reader.hasRead"
        class="sr-only"
      >{{ t('community.has_read') }}</span>
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
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import StarRating from '../StarRating.vue'
import ReaderAvatar from '../ReaderAvatar.vue'

/** Quem mais tem o livro (com nota e se leu) e "quem tem também tem". */
defineProps({
  community: { type: Object, required: true },
  // Celular (folha): uma pessoa por linha, com avatar, em vez de pílulas
  rows: { type: Boolean, default: false }
})

const { t } = useI18n()
const ALSO_HAVE_SHOWN = 3
</script>

<style scoped>
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
  border-radius: var(--radius-pill);
  padding: 0.25rem 0.7rem;
  font-size: var(--fs-sm);
}

.reader-link,
.also-link {
  color: var(--main-color);
  text-decoration: none;
}

.reader-link:hover,
.also-link:hover .also-title {
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

/* Folha do celular: linhas com avatar; o @nome em texto forte (o azul sobre
   o fundo do campo ficava abaixo de 4,5:1) */
.reader-list.rows {
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 0;
}

.reader-list.rows li {
  gap: var(--space-2);
  min-height: 48px;
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  background: none;
  font-size: var(--fs-md);
}

.reader-list.rows .reader-link {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-theme {
  color: var(--main-color);
  font-weight: bold;
}
</style>
