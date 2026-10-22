<template>
  <div class="password-field">
    <TextField
      :id="id"
      ref="field"
      :model-value="modelValue"
      :label="label"
      :type="revealed ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :error="error"
      :hint="hint"
      :required="required"
      :input-attrs="{ autocapitalize: 'none', spellcheck: 'false' }"
      @update:model-value="value => emit('update:modelValue', value)"
    >
      <template #suffix>
        <button
          type="button"
          class="reveal-btn"
          :aria-label="revealed ? t('password.hide') : t('password.show')"
          :aria-pressed="revealed ? 'true' : 'false'"
          @click="revealed = !revealed"
        >
          <i
            :class="revealed ? 'pi pi-eye-slash' : 'pi pi-eye'"
            aria-hidden="true"
          ></i>
        </button>
      </template>
    </TextField>

    <div
      v-if="strength && modelValue"
      class="strength"
      :class="`level-${level}`"
      aria-live="polite"
    >
      <span
        class="strength-bar"
        aria-hidden="true"
      ><span></span></span>
      <span class="strength-text">{{ levelLabel }}</span>
    </div>
    <small
      v-else-if="strength"
      class="strength-prompt"
    >{{ t('register.passwordPrompt') }}</small>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TextField from './TextField.vue'
import { isWeakPassword } from '../../utils/password.js'

/**
 * Senha com botão de mostrar/esconder e, se pedido, a força da senha
 * embaixo (fraca pela mesma regra do servidor; forte com 12+ caracteres
 * misturando maiúsculas, minúsculas e números).
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, required: true },
  label: { type: String, required: true },
  autocomplete: { type: String, default: 'current-password' },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  required: { type: Boolean, default: false },
  strength: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const revealed = ref(false)
const field = ref(null)

const level = computed(() => {
  const value = props.modelValue || ''
  if (isWeakPassword(value)) return 'weak'
  const strong = value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value)
  return strong ? 'strong' : 'medium'
})

const levelLabel = computed(() => t(`register.${level.value}`))

defineExpose({ focus: () => field.value?.focus() })
</script>

<style scoped>
.password-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.reveal-btn {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  margin-right: 0.35rem;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.reveal-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.reveal-btn:focus-visible {
  outline: 2px solid var(--main-color);
}

.strength {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: var(--fs-xs);
  font-weight: 600;
}

.strength-bar {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: var(--bg-input);
  overflow: hidden;
}

.strength-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.2s ease;
}

.level-weak .strength-bar span {
  width: 33%;
  background: var(--red);
}

.level-medium .strength-bar span {
  width: 66%;
  background: var(--yellow);
}

.level-strong .strength-bar span {
  width: 100%;
  background: var(--green);
}

.level-weak .strength-text {
  color: var(--red);
}

.level-medium .strength-text {
  color: var(--yellow);
}

.level-strong .strength-text {
  color: var(--green);
}

.strength-prompt {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
</style>
