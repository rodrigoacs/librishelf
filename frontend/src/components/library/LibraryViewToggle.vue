<template>
  <div
    class="view-toggle"
    :class="{ 'view-toggle-wide': wide }"
    role="group"
  >
    <template v-if="wide">
      <button
        v-for="mode in viewModes"
        :key="mode.value"
        type="button"
        class="view-btn view-btn-wide"
        :class="{ active: modelValue === mode.value }"
        :aria-pressed="modelValue === mode.value"
        @click="emit('update:modelValue', mode.value)"
      >
        <i
          :class="mode.icon"
          aria-hidden="true"
        ></i>
        <span>{{ mode.label }}</span>
      </button>
    </template>
    <template v-else>
      <button
        v-for="mode in viewModes"
        :key="mode.value"
        v-tooltip.bottom="mode.label"
        type="button"
        class="view-btn"
        :class="{ active: modelValue === mode.value }"
        :aria-pressed="modelValue === mode.value"
        :aria-label="mode.label"
        @click="emit('update:modelValue', mode.value)"
      >
        <i
          :class="mode.icon"
          aria-hidden="true"
        ></i>
      </button>
    </template>
  </div>
</template>

<script setup>
// Grade ou lista: só ícones (com dica) no cabeçalho; com o nome escrito, na
// largura toda, dentro da gaveta de filtros. O nome do grupo vem de fora
// (aria-label ou aria-labelledby).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  modelValue: { type: String, required: true },
  wide: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const viewModes = computed(() => [
  { value: 'grid', icon: 'pi pi-th-large', label: t('library.view_grid') },
  { value: 'list', icon: 'pi pi-list', label: t('library.view_list') }
])
</script>

<style scoped>
.view-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-color);
  background: var(--bg-app);
}

.view-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.view-btn:hover {
  color: var(--text-primary);
}

.view-btn.active {
  background: var(--main-solid);
  color: var(--on-main);
}

.view-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.view-toggle-wide {
  display: flex;
  width: 100%;
}

.view-btn-wide {
  flex: 1;
  width: auto;
  height: 2.75rem;
  gap: var(--space-2);
  font: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
}

/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
@media (pointer: coarse) {
  .view-btn {
    position: relative;
  }

  .view-btn::after {
    content: '';
    position: absolute;
    inset: -5px;
    border-radius: 50%;
  }
}
</style>
