<template>
  <!-- Marca única: "LIBRI" sem serifa na cor de destaque + "SHELF" serifado.
       O tamanho vem de quem usa (font-size herdado). Com `mono`, as duas
       partes ficam na cor do texto em volta (sobre imagem ou fundo escuro,
       como no lado visual do login e no resumo do ano). -->
  <span
    class="brand-wordmark"
    :class="{ mono }"
  ><span class="brand-libri">LIBRI</span><span class="brand-shelf">SHELF</span></span>
</template>

<script setup>
defineProps({
  mono: { type: Boolean, default: false }
})
</script>

<style scoped>
.brand-wordmark {
  display: inline-flex;
  align-items: baseline;
  line-height: 1;
  white-space: nowrap;
  color: var(--text-primary);
}

.brand-libri {
  font-family: var(--font-family);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--main-color);
}

.brand-shelf {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.brand-wordmark.mono,
.mono .brand-libri {
  color: inherit;
}
</style>
