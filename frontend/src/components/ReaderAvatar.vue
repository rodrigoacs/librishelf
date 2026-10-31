<template>
  <span
    class="reader-avatar"
    :class="[`size-${size}`, { 'has-photo': showPhoto }]"
    :style="{ '--reader-color': colorFor(username) }"
    aria-hidden="true"
  >
    <picture
      v-if="showPhoto"
      class="photo"
    >
      <source
        :srcset="avatarUrl(username, avatar, photoSize, 'avif')"
        type="image/avif"
      />
      <img
        :src="avatarUrl(username, avatar, photoSize, 'jpg')"
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        @error="failed = true"
      />
    </picture>
    <template v-else>{{ initial }}</template>
    <span
      v-if="badge"
      class="badge"
    ><i :class="badge"></i></span>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { colorFor } from '../utils/tagColors.js'
import { avatarUrl } from '../utils/avatars.js'

/**
 * Círculo do leitor: a foto de perfil, quando a API manda avatarVersion
 * (a pessoa tem foto e quem vê pode ver), ou a inicial na cor do nome (a
 * mesma em todo o app). Se a foto não carregar, volta para a inicial.
 */
const props = defineProps({
  username: { type: String, required: true },
  size: { type: String, default: 'md' },
  // Ícone pequeno no canto (ex.: 'pi pi-check' para "terminou de ler").
  badge: { type: String, default: '' },
  // avatarVersion do payload (null/undefined = sem foto visível)
  avatar: { type: Number, default: null }
})

const failed = ref(false)
watch(() => [props.username, props.avatar], () => { failed.value = false })
const showPhoto = computed(() => Number.isFinite(props.avatar) && !failed.value)
const photoSize = computed(() => (props.size === 'lg' || props.size === 'xl' ? 'lg' : 'sm'))

const initial = computed(() => props.username.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?')
</script>

<style scoped>
.reader-avatar {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  color: var(--reader-color);
  background: color-mix(in srgb, var(--reader-color) 16%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--reader-color) 40%, transparent);
}

/* Foto: preenche o círculo; a borda colorida continua (fica fina por cima) */
.reader-avatar.has-photo {
  background: var(--bg-input);
}

.photo,
.photo img {
  display: block;
  width: 100%;
  height: 100%;
}

.photo img {
  object-fit: cover;
  border-radius: 50%;
  user-select: none;
  -webkit-user-drag: none;
}

.size-xl {
  width: 6rem;
  height: 6rem;
  font-size: var(--fs-2xl);
  font-family: var(--font-display);
}

.size-sm {
  width: 1.6rem;
  height: 1.6rem;
  font-size: var(--fs-xs);
}

.size-md {
  width: 2.25rem;
  height: 2.25rem;
  font-size: var(--fs-md);
}

.size-lg {
  width: 3.5rem;
  height: 3.5rem;
  font-size: var(--fs-xl);
  font-family: var(--font-display);
}

.badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.badge .pi {
  font-size: var(--fs-2xs);
}
</style>
