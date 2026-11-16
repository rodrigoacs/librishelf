<template>
  <span
    class="app-tag"
    :class="[`tone-${tone}`, variant, { caps }]"
  ><slot></slot></span>
</template>

<script setup>
/**
 * Selo curto de estado ("Atrasado", "Seu plano", "Suspensa", "Servidor").
 *   tone: main | red | green | orange | neutral
 *   variant: soft (fundo leve na cor do tom) | solid | outline
 *   caps: rótulo pequeno em maiúsculas (ofertas, empréstimo atrasado)
 * Posição e margem ficam com quem usa (classe própria no componente).
 */
defineProps({
  tone: { type: String, default: 'main', validator: value => ['main', 'red', 'green', 'orange', 'neutral'].includes(value) },
  variant: { type: String, default: 'soft', validator: value => ['soft', 'solid', 'outline'].includes(value) },
  caps: { type: Boolean, default: false }
})
</script>

<style scoped>
.app-tag {
  --tag-rgb: var(--main-color-rgb);
  --tag-fg: var(--main-color);

  display: inline-block;
  flex-shrink: 0;
  padding: 0.1rem var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
}

.tone-red {
  --tag-rgb: var(--red-rgb);
  --tag-fg: var(--red);
}

.tone-green {
  --tag-rgb: var(--green-rgb);
  --tag-fg: var(--green);
}

.tone-orange {
  --tag-rgb: var(--orange-rgb);
  --tag-fg: var(--orange);
}

.soft {
  background: rgba(var(--tag-rgb), 0.12);
  color: var(--tag-fg);
}

.tone-neutral.soft {
  background: var(--bg-input);
  color: var(--text-secondary);
}

.solid {
  background: var(--main-solid);
  color: var(--on-main);
}

.outline {
  background: transparent;
  color: var(--tag-fg);
  box-shadow: inset 0 0 0 1px var(--tag-fg);
}

.caps {
  padding: var(--space-1) var(--space-2);
  font-size: var(--fs-2xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1;
  text-transform: uppercase;
}
</style>
