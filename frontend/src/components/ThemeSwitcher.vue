<template>
  <div class="theme-switcher">
    <button
      class="mode-btn"
      @click="toggleTheme"
      :title="currentTheme === 'dark' ? 'Mudar para Claro' : 'Mudar para Escuro'"
    >
      <i
        class="pi"
        :class="currentTheme === 'dark' ? 'pi-sun' : 'pi-moon'"
      ></i>
    </button>

    <div class="divider"></div>

    <div class="colors-list">
      <button
        v-for="color in availableColors"
        :key="color"
        class="color-dot"
        :class="{ active: accentColor === color }"
        :style="{ backgroundColor: `rgb(${getRxgb(color)})` }"
        @click="setAccent(color)"
        :title="color"
      ></button>
    </div>
  </div>
</template>

<script setup>
import { useTheme } from '../composables/useTheme.js'

const { currentTheme, accentColor, toggleTheme, setAccent, availableColors } = useTheme()

const colorsMap = {
  blue: '58, 134, 255',
  green: '169, 255, 84',
  purple: '141, 120, 250',
  red: '255, 75, 120',
  orange: '255, 138, 80',
  yellow: '253, 212, 87'
}

function getRxgb(name) {
  return colorsMap[name]
}
</script>

<style scoped>
.theme-switcher {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0.4rem 0.8rem;
  border-radius: 50px;
  width: fit-content;
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
}

.mode-btn:hover {
  color: var(--text-primary);
  transform: rotate(15deg);
}

.mode-btn i {
  font-size: 1.1rem;
}

.divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  opacity: 0.5;
}

.colors-list {
  display: flex;
  gap: 0.5rem;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
  opacity: 0.6;
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
