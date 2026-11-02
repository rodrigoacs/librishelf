<template>
  <!-- Cabeçalho de página único (D2): h1 --fs-3xl (--fs-2xl abaixo de 640 px),
       subtítulo, ações à direita e 2rem até o conteúdo. A variante compacta
       (Biblioteca) é só o título numa linha, com um token só (--fs-xl) em
       todas as larguras. -->
  <header
    class="page-header"
    :class="{ compact, divider }"
  >
    <div class="page-header-main">
      <slot name="lead"></slot>
      <div class="page-header-text">
        <router-link
          v-if="back"
          :to="back"
          class="page-header-back"
        >
          <i
            class="pi pi-arrow-left"
            aria-hidden="true"
          ></i>
          {{ backLabel }}
        </router-link>
        <slot name="kicker"></slot>
        <div class="page-header-title-row">
          <h1 class="page-header-title">
            <slot name="title">{{ title }}</slot>
          </h1>
          <slot name="after-title"></slot>
        </div>
        <slot name="subtitle">
          <p
            v-if="subtitle"
            class="page-header-subtitle"
          >{{ subtitle }}</p>
        </slot>
        <slot></slot>
      </div>
    </div>
    <div
      v-if="$slots.actions"
      class="page-header-actions"
    >
      <slot name="actions"></slot>
    </div>
  </header>
</template>

<script setup>
/**
 * Uso:
 *   <PageHeader :title="t('lists.title')" :subtitle="t('lists.subtitle')" divider>
 *     <template #actions><AppButton … /></template>
 *   </PageHeader>
 * Voltar: :back="{ name: 'lists' }" :back-label="t('lists.back')" (link
 * acima do título, no lugar dos links soltos de cada tela).
 * Slots: kicker (acima do título), lead (à esquerda, ex.: avatar), title,
 * after-title (na linha do título, ex.: contagem), subtitle, default (abaixo
 * do subtítulo) e actions (à direita; abaixo do texto no celular).
 */
defineProps({
  title: { type: String, default: '' },
  // Destino e rótulo do link de voltar, acima do título
  back: { type: [String, Object], default: null },
  backLabel: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // Linha embaixo do cabeçalho, separando do conteúdo
  divider: { type: Boolean, default: false },
  // Só a linha do título, sem margem (cabeçalho da Biblioteca)
  compact: { type: Boolean, default: false }
})
</script>

<style>
/* Sem scoped: as views ajustam o próprio cabeçalho (ex.: .page-header-actions)
   sem :deep, e as classes têm prefixo para não colidir. */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-6);
  margin-bottom: var(--space-7);
}

.page-header.divider {
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--border-color);
}

.page-header-main {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  /* Com pouco espaço as ações descem para a linha de baixo em vez de
     espremer o título */
  flex: 1 1 24rem;
  min-width: 0;
}

.page-header-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.page-header-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.page-header-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  font-weight: 700;
  line-height: 1.15;
  color: var(--text-primary);
  overflow-wrap: break-word;
  min-width: 0;
}

.page-header-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  width: fit-content;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-decoration: none;
}

.page-header-back:hover {
  color: var(--text-primary);
}

.page-header-back:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.page-header-subtitle {
  margin: 0;
  color: var(--text-secondary);
}

.page-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
}

/* Compacta: só a linha do título, sem margem nem quebra */
.page-header.compact {
  display: block;
  margin: 0;
}

.page-header.compact .page-header-main {
  display: block;
}

.page-header.compact .page-header-title {
  font-size: var(--fs-xl);
  white-space: nowrap;
}

@media (max-width: 639.98px) {
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header-title {
    font-size: var(--fs-2xl);
  }
}

/* Faixa: dentro de .page (main.css) o cabeçalho vira a mesma barra da
   Biblioteca, de ponta a ponta, com o título no recuo da página. O divider
   deixa de ter efeito (a borda da faixa já separa). */
.page > .page-header {
  align-items: center;
  margin: 0 calc(-1 * var(--page-pad-x)) var(--space-6);
  padding: var(--space-4) var(--page-pad-x);
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
}

.page > .page-header .page-header-text {
  gap: var(--space-1);
}

.page > .page-header .page-header-title {
  font-size: var(--page-title-size);
}

.page > .page-header .page-header-subtitle {
  font-size: var(--fs-sm);
}
</style>
