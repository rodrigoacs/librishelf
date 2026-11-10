<template>
  <!-- Rodapé do menu lateral: quem está logado e as preferências (idioma e tema) -->
  <div class="sidebar-footer">

    <Transition name="scale-up">
      <div
        v-if="showSettings"
        id="nav-preferences"
        class="settings-menu"
      >
        <div class="settings-header">{{ t('menu.configurations') }}</div>

        <div class="settings-row">
          <span class="settings-label">{{ t('menu.language') }}</span>
          <LanguageSwitcher />
        </div>

        <div class="settings-divider"></div>

        <div class="settings-row">
          <ThemeSwitcher />
        </div>
      </div>
    </Transition>

    <div class="footer-content">
      <div class="user-info">
        <div
          class="avatar-circle"
          :class="{ 'has-photo': photo }"
          aria-hidden="true"
        >
          <img
            v-if="photo"
            :src="photo"
            alt=""
            draggable="false"
            @error="photoFailed = true"
          />
          <template v-else>{{ userInitial(displayName) }}</template>
        </div>
        <div class="user-details">
          <span
            class="username"
            :title="displayName"
          >{{ truncateName(displayName) }}</span>
          <span class="user-role">{{ currentUser?.isAdmin ? t('menu.adminRole') : t('menu.role') }}</span>
        </div>
      </div>

      <button
        type="button"
        class="settings-btn"
        :class="{ active: showSettings }"
        :aria-label="t('menu.preferences')"
        :aria-expanded="showSettings"
        aria-controls="nav-preferences"
        v-tooltip.top="t('menu.preferences')"
        @click="showSettings = !showSettings"
      >
        <i
          class="pi pi-cog"
          aria-hidden="true"
        ></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ThemeSwitcher from '../ThemeSwitcher.vue'
import LanguageSwitcher from '../LanguageSwitcher.vue'
import { currentUser } from '../../services/session.js'
import { useMyAvatar } from '../../composables/useMyAvatar.js'
import { truncateName, userInitial } from '../../utils/userName.js'

const route = useRoute()
const { t } = useI18n()
const { displayName, photo, photoFailed } = useMyAvatar()

// Preferências fecham ao trocar de tela
const showSettings = ref(false)
watch(() => route.path, () => { showSettings.value = false })
</script>

<style scoped>
.sidebar-footer {
  padding: var(--space-5);
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-app);
  position: relative;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  overflow: hidden;
}

.avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: var(--main-solid);
  color: var(--on-main);
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-md);
  flex-shrink: 0;
}

.avatar-circle.has-photo {
  background: var(--bg-input);
}

.avatar-circle img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.user-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.username {
  color: var(--text-primary);
  font-weight: 600;
  font-size: var(--fs-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.settings-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn:hover,
.settings-btn.active {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.settings-btn.active i {
  transform: rotate(45deg);
}

.settings-btn i {
  font-size: var(--fs-lg);
  transition: transform 0.3s ease;
}

/* A gaveta do celular não começa o arrasto aqui (NavigationMenu, closeDrag) */
.settings-menu {
  position: absolute;
  bottom: 80px;
  left: 1rem;
  right: 1rem;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-shadow: var(--shadow-3);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.settings-header {
  font-size: var(--fs-sm);
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.settings-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
}

.settings-label {
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.settings-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 0.2rem 0;
}

/* Rola na vertical; o lado é do gesto de fechar a gaveta */
@media (max-width: 639.98px) {
  .sidebar-footer {
    overscroll-behavior: contain;
    touch-action: pan-y;
  }
}

.scale-up-enter-active,
.scale-up-leave-active {
  transition: all 0.2s ease-out;
}

.scale-up-enter-from,
.scale-up-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
</style>
