<template>
  <Teleport to="body">
    <AppDialog
      :visible="visible"
      size="sm"
      :header="list ? t('lists.editTitle') : t('lists.newTitle')"
      @update:visible="value => emit('update:visible', value)"
    >
      <form
        class="list-form"
        novalidate
        @submit.prevent="submit"
      >
        <TextField
          :id="`${uid}-title`"
          v-model="title"
          :label="t('lists.name')"
          :maxlength="MAX_TITLE"
          :error="titleError"
          required
        />
        <div
          v-if="!list && !title"
          class="suggestions"
        >
          <span class="suggest-label">{{ t('lists.suggestions') }}</span>
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="suggestion"
            @click="title = suggestion"
          >{{ suggestion }}</button>
        </div>
        <TextField
          :id="`${uid}-description`"
          v-model="description"
          :label="t('lists.description')"
          :hint="t('lists.descriptionHint', { n: description.length, max: MAX_DESCRIPTION })"
          :maxlength="MAX_DESCRIPTION"
          multiline
          :rows="3"
        />

        <div class="toggle-block">
          <div class="toggle-row">
            <label :for="`${uid}-ranked`">
              <span>{{ t('lists.ranked') }}</span>
              <small>{{ t('lists.rankedHint') }}</small>
            </label>
            <AppSwitch
              v-model="ranked"
              :input-id="`${uid}-ranked`"
            />
          </div>
          <div class="toggle-row">
            <label :for="`${uid}-public`">
              <span>{{ t('lists.makePublic') }}</span>
              <small>{{ t('lists.publicHint') }}</small>
            </label>
            <AppSwitch
              v-model="isPublic"
              :input-id="`${uid}-public`"
            />
          </div>
          <p
            v-if="isPublic && !currentUser?.isPublic"
            class="notice"
          >
            <i
              class="pi pi-info-circle"
              aria-hidden="true"
            ></i>
            <i18n-t
              scope="global"
              keypath="lists.privateLibraryHint"
              tag="span"
            >
              <template #settings>
                <router-link
                  :to="{ name: 'settings' }"
                  @click="emit('update:visible', false)"
                >{{ t('review.settingsLink') }}</router-link>
              </template>
            </i18n-t>
          </p>
        </div>

        <small
          v-if="error"
          class="error"
          role="alert"
        >{{ error }}</small>

        <div class="actions">
          <AppButton
            type="button"
            :label="t('common.cancel')"
            class="btn-text btn-secondary"
            @click="emit('update:visible', false)"
          />
          <AppButton
            type="submit"
            :label="list ? t('lists.save') : t('lists.create')"
            class="btn-primary"
            :loading="saving"
          />
        </div>
      </form>
    </AppDialog>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import TextField from '../form/TextField.vue'
import api from '../../services/api.js'
import { currentUser } from '../../services/session.js'

/**
 * Criar ou editar uma lista (nome, descrição, numerada, pública). Com
 * `bookId`, a lista nova já nasce com esse livro. Emite "saved" com a lista.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  list: { type: Object, default: null },
  bookId: { type: Number, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])
const { t } = useI18n()

const MAX_TITLE = 100
const MAX_DESCRIPTION = 1000
const uid = `list-form-${Math.random().toString(36).slice(2, 8)}`

const title = ref('')
const description = ref('')
const ranked = ref(true)
const isPublic = ref(false)
const titleError = ref('')
const error = ref('')
const saving = ref(false)

const suggestions = computed(() => {
  const year = new Date().getFullYear()
  return [t('lists.suggestBest', { year }), t('lists.suggestVacation'), t('lists.suggestFavorites')]
})

watch(() => props.visible, open => {
  if (!open) return
  title.value = props.list?.title ?? ''
  description.value = props.list?.description ?? ''
  ranked.value = props.list?.ranked ?? true
  isPublic.value = props.list?.isPublic ?? false
  titleError.value = ''
  error.value = ''
})

async function submit() {
  titleError.value = ''
  error.value = ''
  if (!title.value.trim()) {
    titleError.value = t('errors.LIST_TITLE_REQUIRED')
    return
  }
  const body = { title: title.value, description: description.value, ranked: ranked.value, isPublic: isPublic.value }
  saving.value = true
  try {
    const result = props.list
      ? await api.updateList(props.list.id, body)
      : await api.createList(props.bookId ? { ...body, bookId: props.bookId } : body)
    emit('saved', result.list)
    emit('update:visible', false)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.list-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: -0.4rem;
}

.suggest-label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.suggestion {
  padding: 0.3rem 0.7rem;
  border: 1px dashed var(--border-hover);
  border-radius: 999px;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
}

.suggestion:hover {
  border-color: var(--main-color);
  color: var(--main-color);
}

.suggestion:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.toggle-block {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.toggle-row label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: var(--fs-md);
  cursor: pointer;
}

.toggle-row small {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.notice .pi {
  margin-top: 0.15rem;
  color: var(--main-color);
}

.notice a {
  color: var(--main-color);
}

.error {
  color: var(--red);
  font-size: var(--fs-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
