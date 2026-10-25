<template>
  <Teleport to="body">
    <AppDialog
      :visible="visible && !formOpen"
      size="sm"
      :header="t('lists.addToTitle')"
      @update:visible="value => emit('update:visible', value)"
    >
      <div class="add-to-list">
        <p class="book">{{ bookTitle }}</p>

        <p
          v-if="loading"
          class="muted"
        >{{ t('common.loading') }}</p>
        <p
          v-else-if="loadError"
          class="muted"
        >{{ t('lists.loadFailed') }}</p>

        <ul
          v-else-if="lists.length"
          class="lists"
        >
          <li
            v-for="list in lists"
            :key="list.id"
          >
            <label class="option">
              <input
                type="checkbox"
                :checked="list.hasBook"
                :disabled="busy === list.id"
                @change="toggle(list)"
              />
              <span class="name">{{ list.title }}</span>
              <span class="count">{{ list.itemCount }}</span>
            </label>
          </li>
        </ul>
        <p
          v-else
          class="muted"
        >{{ t('lists.noListsYet') }}</p>

        <div class="footer">
          <AppButton
            :label="t('lists.new')"
            icon="pi pi-plus"
            class="btn-text"
            @click="formOpen = true"
          />
          <AppButton
            :label="t('lists.done')"
            class="btn-primary"
            @click="emit('update:visible', false)"
          />
        </div>
      </div>
    </AppDialog>
  </Teleport>

  <ListFormDialog
    v-model:visible="formOpen"
    :book-id="bookId"
    @saved="onCreated"
  />
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import ListFormDialog from './ListFormDialog.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'

/** "Adicionar à lista" no livro aberto: marca/desmarca as listas ou cria uma nova já com o livro. */
const props = defineProps({
  visible: { type: Boolean, default: false },
  bookId: { type: Number, required: true },
  bookTitle: { type: String, default: '' }
})
const emit = defineEmits(['update:visible'])
const { t } = useI18n()
const toast = useToast()

const lists = ref([])
const loading = ref(false)
const loadError = ref(false)
const busy = ref(null)
const formOpen = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    lists.value = (await api.getLists(props.bookId)).lists
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, open => { if (open) load() })

async function toggle(list) {
  const adding = !list.hasBook
  busy.value = list.id
  try {
    if (adding) await api.addToList(list.id, props.bookId)
    else await api.removeFromList(list.id, props.bookId)
    list.hasBook = adding
    list.itemCount += adding ? 1 : -1
    toast.add({ severity: 'success', summary: adding ? t('lists.addedTo', { title: list.title }) : t('lists.removedFrom', { title: list.title }), life: 2500 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    busy.value = null
  }
}

function onCreated(list) {
  toast.add({ severity: 'success', summary: t('lists.addedTo', { title: list.title }), life: 2500 })
  load()
}
</script>

<style scoped>
.add-to-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.book {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.lists {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 50vh;
  overflow-y: auto;
}

.option {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 2.75rem;
  padding: 0 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
}

.option:hover {
  border-color: var(--border-hover);
}

.option:has(input:checked) {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
}

.option:has(input:focus-visible) {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.option input {
  width: 1.05rem;
  height: 1.05rem;
  margin: 0;
  accent-color: var(--main-solid);
}

.name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.count {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.25rem;
}
</style>
