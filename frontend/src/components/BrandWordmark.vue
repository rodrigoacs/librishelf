<template>
  <!-- LIBRI sem serifa (destaque) + SHELF serifado, tamanho herdado.
       `mono`: as duas na cor do texto em volta (sobre imagem ou fundo escuro). -->
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

.brand-libri,
.brand-shelf {
  /* Mesma altura de maiúscula nas duas fontes (0,727 = a da Inter).
     https://developer.mozilla.org/en-US/docs/Web/CSS/font-size-adjust */
  font-size-adjust: cap-height 0.727;
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
