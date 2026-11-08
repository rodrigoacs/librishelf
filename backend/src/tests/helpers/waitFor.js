/**
 * Espera `check` (síncrono ou assíncrono) devolver algo verdadeiro, até `ms`.
 * Para efeitos que a API dispara sem segurar a resposta (e-mail, registro de
 * erro): uma pausa fixa falha quando a máquina está lenta.
 * Devolve o último valor de `check`, para usar direto no expect.
 */
export async function waitFor(check, ms = 2000) {
  const until = Date.now() + ms
  let value = await check()
  while (!value && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 20))
    value = await check()
  }
  return value
}
