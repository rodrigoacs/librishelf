<template>
  <article class="reading-card">
    <button
      type="button"
      class="cover-btn"
      :aria-label="t('home.openBook', { title: book.title })"
      @click="dialogOpen = true"
    >
      <BookCover
        :book-id="book.book_id"
        :title="book.title"
        :author="book.authors"
      />
    </button>

    <div class="reading-info">
      <h3 class="reading-title">
        <button
          type="button"
          class="title-btn"
          @click="dialogOpen = true"
        >{{ book.title }}</button>
      </h3>
      <p class="reading-author">{{ book.authors }}</p>
      <p
        v-if="since"
        class="reading-since"
      >
        <i
          class="pi pi-calendar"
          aria-hidden="true"
        ></i>
        {{ since }}
      </p>
      <Button
        :label="t('home.finished')"
        icon="pi pi-check"
        class="p-button-sm p-button-outlined finish-btn"
        :loading="saving"
        @click="finish"
      />
    </div>

    <BookDialog
      v-if="dialogOpen"
      :model-value="dialogOpen"
      :book-id="book.book_id"
      @update:model-value="dialogOpen = $event"
      @updated="emit('updated')"
      @deleted="emit('updated')"
    />
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import api from '../services/api.js'
import BookCover from './BookCover.vue'
import BookDialog from './BookDialog.vue'
import { fromApiDate, toApiDate } from '../utils/dates.js'

/** Livro em "Lendo agora" no Início: capa maior, desde quando e "Terminei". */
const props = defineProps({
  book: { type: Object, required: true }
})

const emit = defineEmits(['updated'])
const { t, locale } = useI18n()
const toast = useToast()

const dialogOpen = ref(false)
const saving = ref(false)

const since = computed(() => {
  const date = fromApiDate(props.book.started_at)
  return date ? t('status.readingSince', { date: date.toLocaleDateString(locale.value) }) : ''
})

async function finish() {
  saving.value = true
  try {
    await api.setReadingStatus(props.book.book_id, 'read', toApiDate(new Date()))
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('home.finishedToast', { title: props.book.title }), life: 3000 })
    emit('updated')
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.reading-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  min-width: 0;
}

.cover-btn {
  flex: 0 0 104px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  align-self: flex-start;
}

.cover-btn:focus-visible,
.title-btn:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.reading-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
  flex: 1;
}

.reading-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  line-height: 1.25;
}

.title-btn {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.title-btn:hover {
  color: var(--main-color);
}

.reading-author {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reading-since {
  margin: 0.15rem 0 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.reading-since .pi {
  font-size: var(--fs-xs);
}

.finish-btn.p-button {
  margin-top: auto;
  align-self: flex-start;
  border-radius: 999px;
}
</style>
