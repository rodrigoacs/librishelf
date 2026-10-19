<template>
  <div class="theme-switcher">
    <button
      type="button"
      class="mode-btn"
      @click="toggleTheme"
      :aria-label="currentTheme === 'dark' ? t('theme.toLight') : t('theme.toDark')"
      v-tooltip.top="currentTheme === 'dark' ? t('theme.toLight') : t('theme.toDark')"
    >
      <i
        class="pi"
        :class="currentTheme === 'dark' ? 'pi-sun' : 'pi-moon'"
        aria-hidden="true"
      ></i>
    </button>

    <div
      class="divider"
      aria-hidden="true"
    ></div>

    <div
      class="colors-list"
      role="group"
      :aria-label="t('theme.accentGroup')"
    >
      <button
        v-for="color in availableColors"
        :key="color"
        type="button"
        class="color-dot"
        :class="{ active: accentColor === color }"
        :style="{ backgroundColor: `rgb(var(--${color}-rgb))` }"
        :aria-label="t('theme.accent', { color: t(`theme.colors.${color}`) })"
        :aria-pressed="accentColor === color"
        @click="setAccent(color)"
      ></button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useTheme } from '../composables/useTheme.js'

const { t } = useI18n()
const { currentTheme, accentColor, toggleTheme, setAccent, availableColors } = useTheme()
</script>

<style scoped>
.theme-switcher {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0.25rem 0.5rem;
  border-radius: 50px;
  width: fit-content;
  max-width: 100%;
  transition: all 0.2s ease;
}

.theme-switcher:hover {
  background-color: var(--bg-input);
  border-color: var(--border-color);
}

.mode-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, transform 0.2s;
  padding: 0;
  flex-shrink: 0;
}

.mode-btn:hover {
  color: var(--text-primary);
  transform: rotate(15deg);
}

.mode-btn i {
  font-size: var(--fs-lg);
}

.divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  opacity: 0.5;
  flex-shrink: 0;
}

.colors-list {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
  opacity: 0.6;
  flex-shrink: 0;
}

.color-dot:hover {
  transform: scale(1.3);
  opacity: 1;
}

.color-dot.active {
  opacity: 1;
  transform: scale(1.2);
  box-shadow: 0 0 0 2px var(--bg-panel), 0 0 0 3px var(--text-primary);
}
</style>