<template>
  <!-- Autor, Editora e Categoria sempre à esquerda, no mesmo lugar (abrem a
       folha de escolha; acesos com a contagem quando há escolha). Os
       escolhidos ficam na linha de baixo, enchendo da esquerda. -->
  <div
    class="chip-row"
    role="group"
    :aria-label="t('library.quickFilters')"
  >
    <button
      v-for="dim in dimensions"
      :key="dim.key"
      type="button"
      class="fchip fchip-dim"
      :class="{ 'has-picks': filters[dim.key].length }"
      :aria-label="filters[dim.key].length ? t('library.dimCount', { dim: dim.label, n: filters[dim.key].length }, filters[dim.key].length) : undefined"
      aria-haspopup="dialog"
      data-press
      @click="openPicker(dim)"
    >
      {{ dim.label }}
      <span
        v-if="filters[dim.key].length"
        class="fchip-count"
        aria-hidden="true"
      >{{ filters[dim.key].length }}</span>
      <i
        v-else
        class="pi pi-chevron-down"
        aria-hidden="true"
      ></i>
    </button>
  </div>

  <div
    v-if="active"
    class="chip-row chip-row-picked"
    role="group"
    :aria-label="t('library.filtering_by')"
  >
    <!-- Primeiro, para não sumir no fim de uma fila longa -->
    <button
      type="button"
      class="fchip fchip-clear"
      data-press
      @click="emit('reset')"
    >{{ t('library.clear_all') }}</button>
    <template
      v-for="dim in dimensions"
      :key="dim.key"
    >
      <span
        v-for="name in filters[dim.key]"
        :key="`${dim.key}-${name}`"
        class="fchip is-active"
        :style="dim.key === 'tags' ? { '--tag-color': tagColor(name) } : undefined"
      >
        <button
          type="button"
          class="fchip-label fchip-open"
          aria-haspopup="dialog"
          :aria-label="t('library.chipChange', { dim: dim.label, name })"
          data-press
          @click="openPicker(dim)"
        >{{ name }}</button>
        <button
          type="button"
          class="fchip-x"
          :aria-label="t('common.removeItem', { name })"
          @click="emit('remove', { key: dim.key, name })"
        >
          <i
            class="pi pi-times"
            aria-hidden="true"
          ></i>
        </button>
      </span>
    </template>
    <span
      v-for="chip in otherChips"
      :key="chip.key"
      class="fchip is-active"
    >
      <span class="fchip-label">{{ chip.label }}</span>
      <button
        type="button"
        class="fchip-x"
        :aria-label="t('common.removeItem', { name: chip.label })"
        @click="chip.remove"
      >
        <i
          class="pi pi-times"
          aria-hidden="true"
        ></i>
      </button>
    </span>
  </div>

  <FilterPickerSheet
    v-model:visible="pickerOpen"
    :title="pickerDim ? pickerDim.title : ''"
    :options="pickerDim ? pickerDim.options : []"
    :selected="pickerDim ? filters[pickerDim.key] : []"
    @update:selected="value => emit('filter-change', { key: pickerDim.key, value })"
  />
</template>

<script setup>
// Celular: filtros em chips abaixo da busca (no lugar da barra "Filtrando
// por" do computador). Autor, editora e categoria abrem a folha de escolha.
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FilterPickerSheet from '../FilterPickerSheet.vue'
import { tagColor } from '../../utils/tagColors.js'

const props = defineProps({
  filters: { type: Object, required: true },
  // Há algum filtro ativo (mostra a linha dos escolhidos)
  active: { type: Boolean, default: false },
  // Status, período, série, ISBN: [{ key, label, remove }]
  otherChips: { type: Array, required: true },
  authors: { type: Array, required: true },
  publishers: { type: Array, required: true },
  tags: { type: Array, required: true }
})

const emit = defineEmits(['filter-change', 'remove', 'reset'])

const { t } = useI18n()

const pickerOpen = ref(false)
const pickerKey = ref('')
const dimensions = computed(() => [
  { key: 'author', label: t('library.dim.author'), title: t('library.authors'), options: props.authors },
  { key: 'publisher', label: t('library.dim.publisher'), title: t('library.publishers'), options: props.publishers },
  { key: 'tags', label: t('library.dim.tag'), title: t('library.tags'), options: props.tags }
])
const pickerDim = computed(() => dimensions.value.find(dim => dim.key === pickerKey.value) || null)

function openPicker(dim) {
  pickerKey.value = dim.key
  pickerOpen.value = true
}
</script>

<style scoped>
/* Só aparece no celular (o cabeçalho decide); as regras ficam sem media query */

/* Linha dos três filtros: sempre à esquerda, no mesmo lugar */
.chip-row {
  display: flex;
  justify-content: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

/* Escolhidos: lado a lado numa linha só, a partir da esquerda; muitos
   rolam de lado (a altura não cresce) */
.chip-row-picked {
  flex-wrap: nowrap;
  margin: var(--space-2) calc(-1 * var(--space-4)) 0;
  padding: 0 var(--space-4) var(--space-1);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-padding-inline: var(--space-4);
  scrollbar-width: none;
}

.chip-row-picked::-webkit-scrollbar {
  display: none;
}

.fchip-dim.has-picks {
  border-color: rgba(var(--main-color-rgb), 0.45);
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
  font-weight: 600;
}

/* 320 px com os três acesos: um pouco menos de respiro para caber */
@media (max-width: 359.98px) {
  .chip-row {
    gap: 6px;
  }

  .chip-row .fchip-dim {
    padding: 0 var(--space-2) 0 calc(var(--space-2) + 2px);
  }
}

.fchip-count {
  min-width: 1.15rem;
  padding: 0 var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--main-solid);
  color: var(--on-main);
  font-size: var(--fs-xs);
  font-weight: 700;
  line-height: 1.15rem;
  text-align: center;
}

.fchip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  max-width: 70vw;
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.fchip .pi-chevron-down {
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.fchip.is-active {
  gap: 0;
  padding: 0 0 0 var(--space-3);
  border-color: rgba(var(--main-color-rgb), 0.45);
  background: rgba(var(--main-color-rgb), 0.15);
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
  font-weight: 600;
}

.fchip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fchip-open {
  align-self: stretch;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.fchip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: inherit;
  cursor: pointer;
}

.fchip-x .pi {
  font-size: 0.7rem;
}

.fchip-clear {
  border-color: transparent;
  color: var(--text-secondary);
}

.fchip:focus-visible,
.fchip-open:focus-visible,
.fchip-x:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
}

/* Toque: os chips ficam com 36 px de desenho e 44 px de área */
@media (pointer: coarse) {
  .fchip,
  .fchip-x {
    position: relative;
  }

  .fchip::after,
  .fchip-x::after {
    content: '';
    position: absolute;
    inset: -4px 0;
  }

  .fchip.is-active::after {
    content: none;
  }
}
</style>
