<template>
  <AppDialog
    :visible="visible"
    drawer
    dialog-class="filters-drawer"
    :aria-label="t('library.filters_adv')"
    @update:visible="value => emit('update:visible', value)"
  >
    <div class="drawer-body">
      <div class="sidebar-header">
        <div>
          <h3>{{ t('library.filters_adv') }}</h3>
          <p>{{ t('library.refine_view') }}</p>
        </div>
        <IconButton
          icon="pi pi-times"
          :label="t('common.close')"
          @click="emit('update:visible', false)"
        />
      </div>

      <div class="sidebar-content">
        <!-- Celular: o alternador grade/lista sai do cabeçalho e mora aqui
             (no cabeçalho ele empurrava o título para baixo das ações) -->
        <div class="filter-group view-group">
          <span
            id="filter-view"
            class="group-label"
          >{{ t('library.view_label') }}</span>
          <LibraryViewToggle
            :model-value="view"
            wide
            aria-labelledby="filter-view"
            @update:model-value="value => emit('view-change', value)"
          />
        </div>

        <div class="filter-group">
          <label id="filter-read-status">{{ t('library.read_status') }}</label>
          <AppSelect
            :model-value="filters.readState"
            :options="readStateOptions"
            option-label="label"
            option-value="value"
            aria-labelledby="filter-read-status"
            class="w-full"
            @update:model-value="value => change('readState', value)"
          />
        </div>

        <div class="filter-group">
          <label for="filter-read-year">{{ t('library.read_year') }}</label>
          <AppSelect
            input-id="filter-read-year"
            :model-value="hasReadYear(filters) ? filters.readYear : 'all'"
            :options="yearOptions"
            option-label="label"
            option-value="value"
            :placeholder="t('library.select_year')"
            class="w-full"
            @update:model-value="setReadYear"
          />
        </div>

        <div class="filter-group">
          <label for="filter-sort">{{ t('library.sort_by') }}</label>
          <div class="sort-row">
            <AppSelect
              input-id="filter-sort"
              :model-value="filters.sortField"
              :options="sortOptions"
              option-label="label"
              option-value="value"
              class="custom-dropdown"
              @update:model-value="value => change('sortField', value)"
            />
            <AppButton
              v-tooltip.bottom="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
              :icon="filters.sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
              :aria-label="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
              class="btn-outlined btn-secondary sort-btn"
              @click="change('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')"
            />
          </div>
        </div>

        <div
          v-for="group in multiGroups"
          :key="group.key"
          class="filter-group"
        >
          <label :for="group.id">{{ group.label }}</label>
          <AppMultiSelect
            :input-id="group.id"
            :model-value="filters[group.key]"
            :options="group.options"
            option-label="name"
            option-value="name"
            :placeholder="group.placeholder"
            :max-labels="2"
            :selected-label="`{0} ${group.selected}`"
            filter
            class="w-full"
            @update:model-value="value => change(group.key, value)"
          />
        </div>
      </div>

      <div class="sidebar-footer">
        <AppButton
          :label="t('library.clear_all')"
          icon="pi pi-filter-slash"
          class="btn-outlined btn-danger w-full"
          @click="emit('reset')"
        />
      </div>
    </div>
  </AppDialog>
</template>

<script setup>
// Gaveta "Filtros avançados": grade/lista (só no celular), estado de leitura,
// ano, ordenação e as listas de categorias, autores e editoras.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppMultiSelect from '../ui/AppMultiSelect.vue'
import AppSelect from '../ui/AppSelect.vue'
import IconButton from '../form/IconButton.vue'
import LibraryViewToggle from './LibraryViewToggle.vue'
import { useLibraryFilterOptions, hasReadYear } from '../../composables/useLibraryFilterOptions.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  filters: { type: Object, required: true },
  view: { type: String, required: true },
  authors: { type: Array, required: true },
  publishers: { type: Array, required: true },
  tags: { type: Array, required: true }
})

const emit = defineEmits(['update:visible', 'filter-change', 'view-change', 'reset'])

const { t } = useI18n()
const { sortOptions, readStateOptions, yearOptions } = useLibraryFilterOptions()

const multiGroups = computed(() => [
  { key: 'tags', id: 'filter-tags', label: t('library.tags'), options: props.tags, placeholder: t('library.select_tags'), selected: t('library.selected_tags') },
  { key: 'author', id: 'filter-authors', label: t('library.authors'), options: props.authors, placeholder: t('library.select_authors'), selected: t('library.selected_authors') },
  { key: 'publisher', id: 'filter-publishers', label: t('library.publishers'), options: props.publishers, placeholder: t('library.select_publishers'), selected: t('library.selected_publishers') }
])

function change(key, value) {
  emit('filter-change', { key, value })
}

// Trocar o ano tira o mês (ele só existe junto com o ano de onde veio).
function setReadYear(value) {
  emit('filter-change', { key: 'readMonth', value: null, silent: true })
  change('readYear', value)
}
</script>

<style scoped>
.sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-7);
}

.sidebar-header h3 {
  margin: 0;
  font-size: var(--fs-xl);
  color: var(--text-primary);
}

.sidebar-header p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.filter-group label,
.filter-group .group-label {
  display: block;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
  font-weight: 600;
  text-transform: uppercase;
}

.sort-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
}

.sort-row .custom-dropdown {
  flex: 1;
  width: auto;
  min-width: 0;
}

.sort-btn {
  flex-shrink: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: var(--space-7);
}

/* Grade/lista dentro da gaveta: só no celular (no resto ele fica no cabeçalho) */
.view-group {
  display: none;
}

@media (max-width: 639.98px) {
  .view-group {
    display: block;
  }
}
</style>

<style>
/* Gaveta de filtros (AppDialog drawer) */
.filters-drawer .drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-6) var(--space-6) var(--space-6) var(--space-7);
  overflow-y: auto;
}
</style>
