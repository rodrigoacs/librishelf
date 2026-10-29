<template>
  <!-- Cabeçalho das colunas do modo lista: mesmo grid do BookRow. Clicar
       ordena (de novo na mesma coluna inverte a ordem); Editora não ordena. -->
  <div
    class="row-header"
    :class="{ selecting }"
  >
    <div class="header-main">
      <span
        v-if="selecting"
        aria-hidden="true"
      ></span>
      <span aria-hidden="true"></span>
      <template
        v-for="column in COLUMNS"
        :key="column.key"
      >
        <button
          v-if="column.sort"
          type="button"
          class="col-btn"
          :class="[column.key, { active: sortField === column.sort }]"
          @click="choose(column.sort)"
        >
          <span>{{ t(`library.col.${column.key}`) }}</span>
          <i
            v-if="sortField === column.sort"
            :class="sortOrder === 'asc' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"
            aria-hidden="true"
          ></i>
          <span
            v-if="sortField === column.sort"
            class="sr-only"
          >{{ sortOrder === 'asc' ? t('library.col.asc') : t('library.col.desc') }}</span>
        </button>
        <span
          v-else
          class="col-label"
          :class="column.key"
        >{{ t(`library.col.${column.key}`) }}</span>
      </template>
    </div>
    <span
      class="read-spacer"
      aria-hidden="true"
    ></span>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { nextColumnSort } from '../utils/columnSort.js'

const props = defineProps({
  sortField: { type: String, default: 'recent' },
  sortOrder: { type: String, default: 'desc' },
  selecting: { type: Boolean, default: false }
})
const emit = defineEmits(['sort'])
const { t } = useI18n()

const COLUMNS = [
  { key: 'title', sort: 'title' },
  { key: 'publisher', sort: null },
  { key: 'year', sort: 'pubDate' },
  { key: 'rating', sort: 'rating' },
  { key: 'readOn', sort: 'readDate' }
]

function choose(field) {
  emit('sort', nextColumnSort(field, props))
}
</script>

<style scoped>
/* Espelha .book-row / .row-main (components/BookRow.vue) */
.row-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.5rem;
  padding-right: 0.75rem;
  border: 1px solid transparent;
  margin-bottom: -0.15rem;
}

.header-main {
  display: grid;
  grid-template-columns: 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 3.5rem 6rem 6rem;
  align-items: center;
  gap: 1rem;
  padding-left: 0.65rem;
}

.selecting .header-main {
  grid-template-columns: 22px 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 3.5rem 6rem 6rem;
}

.read-spacer {
  width: 34px;
}

.selecting .read-spacer {
  display: none;
}

.col-btn,
.col-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-btn {
  justify-self: start;
  min-height: 2rem;
  margin-left: -0.4rem;
  padding: 0.2rem 0.4rem;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-family: inherit;
  cursor: pointer;
}

.col-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.col-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
}

.col-btn.active {
  color: var(--text-primary);
}

.col-btn .pi {
  font-size: 0.7em;
}

@media (max-width: 1279.98px) {
  .header-main {
    grid-template-columns: 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
  }

  .selecting .header-main {
    grid-template-columns: 22px 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
  }

  .year {
    display: none;
  }
}

@media (max-width: 1023.98px) {
  .header-main {
    grid-template-columns: 40px minmax(0, 1fr) 5.75rem;
    gap: 0.75rem;
  }

  .selecting .header-main {
    grid-template-columns: 22px 40px minmax(0, 1fr) 5.75rem;
  }

  .publisher,
  .rating {
    display: none;
  }

  .readOn {
    justify-self: end;
  }
}

/* Abaixo de 420 px a linha mostra só capa e título: sem cabeçalho */
@media (max-width: 420px) {
  .row-header {
    display: none;
  }
}

@media (pointer: coarse) {
  .col-btn {
    min-height: 44px;
  }
}
</style>
