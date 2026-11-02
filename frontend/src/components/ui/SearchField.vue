<template>
  <!-- Campo de busca único (pílula, 44 px, lupa à esquerda e limpar à direita).
       Uso: <SearchField v-model="q" id="x-search" :label="…" :placeholder="…" />
       Antes cada tela tinha o seu (Biblioteca em pílula, Autores retangular com
       borda, Descobrir, contas do admin, folhas e diálogos). -->
  <div
    class="search-field"
    :class="[attrs.class, { 'is-sm': size === 'sm' }]"
    :style="attrs.style"
    :role="region ? 'search' : undefined"
  >
    <i
      class="pi pi-search search-field-icon"
      aria-hidden="true"
    ></i>
    <label
      :for="id"
      class="sr-only"
    >{{ label || placeholder }}</label>
    <input
      :id="id"
      ref="input"
      class="search-field-input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :enterkeyhint="enterkeyhint"
      autocomplete="off"
      v-bind="inputAttrs"
      @input="emit('update:modelValue', $event.target.value)"
      @keydown.esc="onEsc"
    />
    <button
      v-if="clearable && modelValue"
      type="button"
      class="search-field-clear"
      :aria-label="t('library.clear_search')"
      @click="clear"
    >
      <i
        class="pi pi-times"
        aria-hidden="true"
      ></i>
    </button>
  </div>
</template>

<script setup>
import { computed, ref, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'

// class/style ficam no wrapper; o resto (ex.: @keydown.enter) vai para o <input>
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const props = defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, required: true },
  // Rótulo para leitor de tela (padrão: o placeholder)
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  maxlength: { type: [Number, String], default: undefined },
  enterkeyhint: { type: String, default: 'search' },
  clearable: { type: Boolean, default: true },
  // role="search" no wrapper (desligue quando já existe um <form role="search">)
  region: { type: Boolean, default: true },
  // sm: 36 px, para folhas, diálogos e barras densas
  size: { type: String, default: 'md' }
})
const emit = defineEmits(['update:modelValue', 'clear'])
const { t } = useI18n()
const input = ref(null)

function clear() {
  emit('update:modelValue', '')
  emit('clear')
  input.value?.focus()
}

function onEsc(event) {
  if (!props.modelValue) return
  event.stopPropagation()
  clear()
}

defineExpose({ input, focus: () => input.value?.focus() })
</script>

<style scoped>
.search-field {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.search-field-icon {
  position: absolute;
  left: var(--space-4);
  color: var(--text-muted);
  pointer-events: none;
}

.search-field-input {
  width: 100%;
  height: 2.75rem;
  padding: 0 2.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-family: inherit;
  font-size: var(--fs-md);
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-field-input::placeholder {
  color: var(--text-muted);
}

.search-field-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

.search-field-input:focus {
  outline: none;
  border-color: var(--main-color);
  background-color: var(--bg-panel);
  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
}

/* 24 × 24 px no mouse (WCAG 2.5.8); no toque o ::after leva a 44 px */
.search-field-clear {
  position: absolute;
  right: var(--space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  cursor: pointer;
}

.search-field-clear:hover {
  color: var(--text-primary);
}

.search-field-clear:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

@media (pointer: coarse) {
  .search-field-clear::after {
    content: '';
    position: absolute;
    inset: -10px;
  }
}

.is-sm .search-field-icon {
  left: var(--space-3);
}

.is-sm .search-field-input {
  height: 2.25rem;
  padding: 0 var(--space-7);
  font-size: var(--fs-sm);
}

.is-sm .search-field-clear {
  right: var(--space-2);
}
</style>
