<template>
  <div
    class="star-rating"
    :class="[`size-${size}`, { readonly }]"
    role="group"
    :aria-label="label || t('rating.label')"
  >
    <template v-if="readonly">
      <i
        v-for="value in 5"
        :key="value"
        class="pi star"
        :class="value <= (modelValue || 0) ? 'pi-star-fill on' : 'pi-star'"
        aria-hidden="true"
      ></i>
      <span class="sr-only">{{ modelValue ? t('rating.value', { n: modelValue }) : t('rating.none') }}</span>
    </template>

    <template v-else>
      <button
        v-for="value in 5"
        :key="value"
        type="button"
        class="star-btn"
        :class="{ on: value <= (hover || modelValue || 0) }"
        :aria-label="t('rating.set', { n: value })"
        :aria-pressed="modelValue === value"
        :disabled="disabled"
        @mouseenter="hover = value"
        @mouseleave="hover = 0"
        @focus="hover = 0"
        @click="select(value)"
      >
        <i
          class="pi"
          :class="value <= (hover || modelValue || 0) ? 'pi-star-fill' : 'pi-star'"
          aria-hidden="true"
        ></i>
      </button>
      <button
        v-if="modelValue"
        type="button"
        class="clear-btn"
        :aria-label="t('rating.clear')"
        :title="t('rating.clear')"
        :disabled="disabled"
        @click="emit('update:modelValue', null)"
      >
        <i
          class="pi pi-times"
          aria-hidden="true"
        ></i>
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Nota de 1 a 5 estrelas inteiras. null = sem nota.
 * Clicar na estrela que já está marcada também tira a nota.
 */
const props = defineProps({
  modelValue: { type: Number, default: null },
  readonly: Boolean,
  disabled: Boolean,
  size: { type: String, default: 'md' },
  label: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const hover = ref(0)

function select(value) {
  emit('update:modelValue', props.modelValue === value ? null : value)
}
</script>

<style scoped>
.star-rating {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.star,
.star-btn {
  color: var(--text-secondary);
}

.star.on,
.star-btn.on {
  color: var(--rating);
}

.star-btn,
.clear-btn {
  background: none;
  border: none;
  padding: 0.15rem;
  cursor: pointer;
  line-height: 1;
  border-radius: 4px;
}

.star-btn:disabled,
.clear-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.star-btn:focus-visible,
.clear-btn:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 1px;
}

.clear-btn {
  color: var(--text-secondary);
  margin-left: 0.25rem;
}

.clear-btn .pi {
  font-size: var(--fs-xs);
}

/* .star-rating junto: o <dialog> também usa size-lg e as estrelas herdavam o tamanho grande */
.star-rating.size-sm .pi {
  font-size: var(--fs-sm);
}

.star-rating.size-md .pi {
  font-size: var(--fs-lg);
}

.star-rating.size-lg .pi {
  font-size: var(--fs-xl);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
