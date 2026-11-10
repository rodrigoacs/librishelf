<template>
  <!-- Balão do botão de tema da barra do topo (celular): cor de destaque e
       claro/escuro. Aberto pelo popovertarget="accent-popover". -->
  <div
    id="accent-popover"
    popover="auto"
    class="accent-pop"
    role="dialog"
    aria-labelledby="accent-pop-title"
  >
    <p
      id="accent-pop-title"
      class="accent-pop-title"
    >{{ t('theme.accentGroup') }}</p>
    <div
      class="accent-dots"
      role="group"
      :aria-label="t('theme.accentGroup')"
    >
      <button
        v-for="color in ACCENT_COLORS"
        :key="color"
        type="button"
        class="accent-dot"
        :class="{ active: accentColor === color }"
        :style="{ '--dot': `rgb(var(--${color}-solid-rgb))` }"
        :aria-label="t('theme.accent', { color: t(`theme.colors.${color}`) })"
        :aria-pressed="accentColor === color"
        @click="setAccent(color)"
      ></button>
    </div>
    <button
      type="button"
      class="accent-theme"
      @click="toggleTheme"
    >
      <i
        class="pi"
        :class="currentTheme === 'dark' ? 'pi-sun' : 'pi-moon'"
        aria-hidden="true"
      ></i>
      {{ currentTheme === 'dark' ? t('theme.toLight') : t('theme.toDark') }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useTheme, ACCENT_COLORS } from '../../composables/useTheme.js'

const { t } = useI18n()
const { currentTheme, accentColor, toggleTheme, setAccent } = useTheme()
</script>

<style scoped>
@media (max-width: 639.98px) {
  .accent-pop {
    position: fixed;
    inset: auto;
    top: calc(var(--app-bar-height) + var(--space-1));
    right: var(--space-2);
    margin: 0;
    padding: var(--space-3) var(--space-4) var(--space-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-panel);
    color: var(--text-primary);
    box-shadow: var(--shadow-3);
    transform-origin: calc(100% - 60px) 0;
  }

  .accent-pop:popover-open {
    animation: accent-pop-in var(--dur-spring) var(--ease-spring);
  }

  .accent-pop-title {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .accent-dots {
    display: flex;
    gap: 2px;
  }

  .accent-dot {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    /* Bolinha de 28 px; selecionada ganha um anel */
    background: radial-gradient(circle closest-side, var(--dot) 13px, transparent 14px);
  }

  .accent-dot.active {
    background:
      radial-gradient(circle closest-side, var(--dot) 11px, transparent 11.5px, transparent 13px, var(--text-primary) 13.5px, var(--text-primary) 15px, transparent 15.5px);
  }

  .accent-dot:focus-visible,
  .accent-theme:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }

  .accent-theme {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    margin-top: var(--space-1);
    padding: 0 var(--space-1);
    border: none;
    border-top: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
  }
}

@keyframes accent-pop-in {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
}
</style>
