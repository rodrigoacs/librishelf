<template>
  <!-- Linha da Conta: abre uma folha (chevron), faz uma ação (botão) ou traz
       um interruptor à direita (slot trailing, com labelFor apontando para ele) -->
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="settings-row"
    :class="{ interactive, danger, disabled }"
    :disabled="interactive && disabled ? true : undefined"
    :aria-describedby="help && interactive ? helpId : undefined"
    :data-press="interactive ? '' : undefined"
    @click="interactive && !disabled && emit('click')"
  >
    <i
      v-if="icon"
      class="row-icon"
      :class="icon"
      aria-hidden="true"
    ></i>
    <span class="row-text">
      <label
        v-if="labelFor"
        :for="labelFor"
        class="row-label"
      >{{ label }}</label>
      <span
        v-else
        class="row-label"
      >{{ label }}</span>
      <span
        v-if="help"
        :id="helpId"
        class="row-help"
      >{{ help }}</span>
    </span>
    <span
      v-if="value"
      class="row-value"
    >{{ value }}</span>
    <slot name="trailing">
      <i
        v-if="loading"
        class="pi pi-spin pi-spinner row-trail"
        aria-hidden="true"
      ></i>
      <i
        v-else-if="trailIcon"
        class="row-trail"
        :class="trailIcon"
        aria-hidden="true"
      ></i>
    </slot>
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  help: { type: String, default: '' },
  value: { type: String, default: '' },
  icon: { type: String, default: '' },
  // Linha clicável (abre folha ou faz ação). Sem isso, é só um container
  interactive: { type: Boolean, default: false },
  // Ícone à direita da linha clicável: chevron (abre folha) ou outro
  trailIcon: { type: String, default: 'pi pi-chevron-right' },
  labelFor: { type: String, default: '' },
  helpId: { type: String, default: () => `row-help-${Math.random().toString(36).slice(2, 8)}` },
  danger: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['click'])
const helpId = computed(() => props.helpId)
</script>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 56px;
  padding: var(--space-3) var(--space-4);
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
}

.settings-row + .settings-row {
  border-top: 1px solid var(--border-color);
}

.settings-row.interactive {
  cursor: pointer;
}

.settings-row.interactive:hover:not(.disabled) {
  background: var(--bg-hover);
}

.settings-row.interactive:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
  border-radius: var(--radius-md);
}

.settings-row.disabled {
  cursor: default;
  opacity: 0.6;
}

.row-icon {
  flex-shrink: 0;
  width: 1.25rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  text-align: center;
}

.row-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-label {
  font-weight: 500;
  overflow-wrap: anywhere;
}

label.row-label {
  cursor: pointer;
}

.row-help {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.row-value {
  max-width: 45%;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-trail {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.danger .row-label,
.danger .row-icon {
  color: var(--danger);
}
</style>
