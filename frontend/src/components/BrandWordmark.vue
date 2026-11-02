<template>
  <!-- Marca única: "LIBRI" sem serifa na cor de destaque + "SHELF" serifado.
       O tamanho vem de quem usa (font-size herdado). -->
  <span class="brand-wordmark"><span class="brand-libri">LIBRI</span><span class="brand-shelf">SHELF</span></span>
</template>

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
</style>
