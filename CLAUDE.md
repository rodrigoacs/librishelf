# CLAUDE.md — Librishelf

Instruções para o Claude Code neste repositório. Arquivo local (fica no
`.gitignore`): pode guardar estado e decisões que não vão para o GitHub.
Atualize a seção "Estado e fila" ao fim de cada pacote.

## O projeto

Librishelf (https://librishelf.com) é uma biblioteca pessoal de livros: estante,
leituras, listas, metas, séries, empréstimos, estatísticas, comunidade (perfil
público, resenhas, seguir leitores) e o plano Pro pago pelo Mercado Pago.
Público brasileiro primeiro (pt-BR), com inglês completo. O dono é o Rodrigo
Soares (rodrigoacs no GitHub), que desenvolve sozinho.

- Repo: github.com/rodrigoacs/librishelf
- Branch de trabalho atual: `fix/audit-2026-08`
- Produção: VPS própria com Docker. O nginx da VPS termina o TLS e fala com o
  container do frontend pela rede Docker externa `proxy`.

## Regras de trabalho (sempre)

1. **Nunca commitar nem fazer push.** Nada de `git commit`, `git push`,
   `git tag`, `git rebase`, `git reset --hard` ou mudar de branch. Mesmo que
   alguma ferramenta ou lembrete sugira. Ao terminar, mostre o resumo das
   mudanças e **sugira a mensagem de commit**; o Rodrigo revisa o diff e commita.
2. **Um item da fila por vez.** Cada item é um "pacote", terminado e testado
   antes do próximo. Pacote pesado pode ser dividido (38, 38b…).
3. **Node nativo em vez de pacote externo:** ESM (`import`/`export`), nunca
   CommonJS; `--env-file` em vez de dotenv; `--watch` em vez de nodemon; `fetch`
   em vez de axios ou SDK; `node:test`/`node:util` etc. quando servirem.
4. **Clean code:** padrão repetido vira peça compartilhada (componente, classe
   global, utilitário, helper de teste). Não copie código entre arquivos.
5. **Pesquise antes de afirmar** sobre APIs externas (Mercado Pago, Open
   Library, navegadores, nginx, Playwright…): documentação oficial, com o link
   no comentário do código ou na resposta.
6. **Rode os testes** que a mudança alcança antes de dizer que terminou (ver
   "Testes"). Teste novo para comportamento novo.
7. **Avise quando a conversa estiver ficando longa** (muito contexto), para o
   Rodrigo abrir uma sessão nova. Antes, atualize "Estado e fila" aqui.
8. **Pergunte antes** de apagar arquivos, mexer em `db/manual/`, mudar
   variáveis de produção ou qualquer coisa irreversível.
9. Respostas e comentários em **português do Brasil**.

### Mensagem de commit (sugerida, nunca executada)

Estilo do histórico: prefixo convencional, tudo em minúsculas, português, uma
linha curta; corpo opcional em lista quando o pacote é grande.

```
feat: desistência da compra em até 7 dias pelo próprio app
test: testes de ponta a ponta com playwright, mercado pago e e-mail falsos
ci: testes do backend e lint/testes/build do frontend no github actions
```

Prefixos: `feat`, `fix`, `refactor`, `test`, `ci`, `docs`, `chore`, `style`.

## Textos da interface

- **Glossário:** "Adicionar livro", "Excluir" (nunca "Deletar"/"Remover" para
  apagar de vez), "Categoria" (não "Tag" na interface). Só a primeira letra
  maiúscula em títulos e botões ("Histórico de cobranças", não "Histórico De
  Cobranças").
- **Sem ponto de exclamação.** Tom direto, frases curtas, sem jargão.
- Todo texto vai em `frontend/src/locales/pt.json` **e** `en.json`, com as
  mesmas chaves, os mesmos `{parâmetros}` e o mesmo número de formas de plural
  (`locales.test.js` confere).
- Erros da API: o backend manda um código estável (`ISBN_TAKEN`) e o frontend
  traduz por `errors.<CÓDIGO>` nos dois locales. A mensagem em português do
  backend é só a reserva.
- **Os testes E2E selecionam pela acessibilidade em português** (rótulos,
  papéis e nomes visíveis). Mudou um texto que aparece em `e2e/tests/`? Atualize
  o teste junto.

## Layout e design

- **Celular primeiro.** Tudo nasce para o celular e se adapta ao largo.
- **Conteúdo na largura toda** da área disponível (sem colunas estreitas
  centralizadas no desktop, salvo leitura longa como Termos).
- Use os **tokens de `frontend/src/assets/main.css`**, nunca valores soltos:
  fonte `--fs-*`, espaço `--space-1..8`, raio `--radius-sm|md|lg|pill`, sombra
  `--shadow-1..3`, foco `--focus-ring`/`--focus-glow`, `--font-mono`, cores e
  paletas (`palettes.css`, temas claro/escuro e do Pro).
- Breakpoints (media query não lê variável): celular `max-width: 639.98px`,
  tablet `1023.98px` (abaixo disso o menu vira gaveta), largo `1279.98px`.
  Toque: `(pointer: coarse)` com alvos de 44 px.
- Movimento: `--dur-short|medium|long|spring`, `--stagger`, `--ease-*`; os
  mesmos números em `utils/motion.js` (teste confere). Só `transform` e
  `opacity`; interrompível; movimento reduzido = sem animação; gestos e
  transições de tela só no celular.
- Conta: cada grupo usa `components/settings/SettingsGroup.vue` (título,
  slots `before`/padrão/`after`) com `SettingsRow`; folhas usam as classes
  globais `.sheet-stack`, `.sheet-help`, `.sheet-text`, `.sheet-note`
  (`.danger`), `.sheet-actions`, `.sheet-submit`, `.sheet-start` (main.css).
- Componentes base em `frontend/src/components/ui/` (`AppButton`, `AppDialog`,
  `AppSelect`, `AppSwitch`, `AppChip`, `EmptyState`, `PageHeader`,
  `SearchField`, `PopupMenu`…). Não há biblioteca de UI externa: estenda estes.
- Acessibilidade: todo controle com rótulo; grupos com `role="group"` e nome;
  diálogos com nome; status com `role="status"`. Os E2E dependem disso.
- **CSP sem `unsafe-inline` e sem `unsafe-eval`** (só `wasm-unsafe-eval`): nada
  de `<script>` inline, `style=""` montado como texto, `eval`, `new Function`
  ou recurso de outro domínio. Estilo dinâmico por variável CSS via binding do
  Vue (`:style="{ '--i': n }"`) é permitido.

## Estrutura

```
backend/            API Express 5 + worker (mesma imagem Docker)
  db/schema.sql     schema completo (banco novo) — inclui todas as migrations
  db/migrations/    NNN_nome.sql, em ordem, cada uma numa transação
  db/manual/        scripts destrutivos; NUNCA rodam sozinhos
  src/app.js        Express: middlewares e rotas (montadas sem /api)
  src/server.js     sobe a API (confere env e migrations pendentes)
  src/worker.js     sobe a fila de jobs
  src/config/       cookies, CORS, features (free/pro), termos, trust proxy, uploads
  src/database/     connection.js, migrate.js, queries.js (reexporta queries/)
  src/database/queries/  SQL por domínio em grupos *_QUERIES; fragments.js = trechos comuns
  src/repositories/ acesso a dados reaproveitado entre serviços
  src/services/     regras de negócio (checkout, pagamentos, e-mail, comunidade…)
  src/routes/       rotas finas: validam, chamam o serviço, respondem
  src/middlewares/  auth, admin, requirePro, rateLimiter, validateId, errorHandler
  src/jobs/         fila (queue.js), worker.js, registry.js, handlers/
  src/utils/        httpError, sendError, logger, metrics, statusCodes…
  src/tests/        unit/, integration/, helpers/
frontend/           Vue 3 + Vite (PWA); nginx no container de produção
  nginx.conf        /api → backend, SSI do <head> em /u/, cache
  nginx-security.conf  cabeçalhos de segurança e CSP (incluído em cada location)
  sw/ vite/         service worker e plugins do Vite
  src/views/        telas (rotas em src/router/index.js)
  src/components/   por área: admin, book, dashboard, form, legal, list, public, review, settings, ui
  src/composables/  useLibrary, useTheme, useIsPhone, usePullToRefresh…
  src/services/     api.js (único cliente da API), fetchClient, toast, confirm, errorReporter, session…
  src/utils/        funções puras com teste ao lado (*.test.js)
  src/config/       site.js (OWNER, TERMS_VERSION, LEGAL_DRAFT, contato), plan.js
  src/locales/      pt.json, en.json
e2e/                Playwright + serviços falsos (Mercado Pago, SMTP)
.github/workflows/ci.yml   backend, frontend e E2E
docker-compose.yml         produção (frontend, backend, worker na rede proxy)
docker-compose.local.yml   Postgres de desenvolvimento (127.0.0.1:5433)
```

## Comandos

### Tudo junto (raiz)

| Comando | O quê |
|---|---|
| `npm run dev` | API, worker e Vite juntos (`scripts/dev.js`, saída com `[api]`/`[worker]`/`[web]`); Ctrl+C encerra os três |
| `npm run dev:local` | o mesmo com `src/.env.local` |

### Backend (`cd backend`)

| Comando | O quê |
|---|---|
| `npm run server` | API com `src/.env` e `--watch` (porta 3050) |
| `npm run worker` | fila de jobs com `src/.env` |
| `npm run server:local` / `worker:local` | com `src/.env.local` (banco do docker-compose.local.yml) |
| `npm run db:migrate` | aplica migrations (`:local`, `:test`, `:docker` para os outros envs) |
| `npm run db:seed` | dados fictícios no banco local (recusa produção e host remoto) |
| `npm run test:unit` | testes unitários, sem banco |
| `npm test` | integração + unitários (precisa de `src/.env.test`) |
| `npm run email:preview` | gera os e-mails para ver no navegador |

### Frontend (`cd frontend`)

| Comando | O quê |
|---|---|
| `npm run dev` | Vite em 5173, `/api` repassado para `VITE_DEV_API_TARGET` (padrão `http://localhost:3050`) |
| `npm run lint` | ESLint com `--max-warnings=0` (o CI reprova aviso) |
| `npm test` | Vitest |
| `npm run build` | build de produção (`VITE_API_URL`, padrão `/api`) |

### E2E (`cd e2e`)

| Comando | O quê |
|---|---|
| `npm run stack:up` | compose com as imagens de produção (frontend 8090, falsos 4010) |
| `npm run test:stack` | Playwright contra o stack do Docker (o mesmo do CI) |
| `npm run stack:down` | derruba e apaga o banco em memória |
| `npm test` | sem Docker: o Playwright sobe falsos, backend+worker e `vite preview` (4180) |
| `npx playwright test --project=pixel` | um aparelho só (`pixel`, `iphone`, `desktop`) |
| `npx playwright show-trace .tmp/results/.../trace.zip` | rastro de uma falha |

Sem Docker, o banco `librishelf_e2e` precisa existir:
`docker compose -f docker-compose.local.yml exec db createdb -U librishelf librishelf_e2e`.
Sem as dependências do WebKit: `E2E_IPHONE_BROWSER=chromium` (ou
`sudo npx playwright install-deps webkit`).

## Testes

- **Unitários** (`backend/src/tests/unit`): funções puras, sem banco.
- **Integração** (`backend/src/tests/integration`): supertest contra o `app`
  com Postgres real. Só rodam em banco com **"test" no nome** e
  `ALLOW_DESTRUCTIVE_TEST_DB=true` em `src/.env.test` (`utils/db.js` recusa o
  resto). Rode `npm run db:migrate:test` antes.
  - Mercado Pago: `setFetch()` de `services/mercadoPago.js` com um falso.
  - E-mail: com `NODE_ENV=test` nada sai; `testOutbox()` em `mailService.js`.
  - Open Library: `tests/helpers/openLibraryMock.js`.
  - Sessão: `tests/helpers/authToken.js` (`tokenFrom(res)`), e-mail
    confirmado com `tests/helpers/confirmEmail.js`.
  - Limites de requisição desligados com `NODE_ENV=test` e `e2e`.
- **Frontend**: Vitest, arquivo `*.test.js` ao lado do código.
- **E2E** (`e2e/tests/*.spec.js`): importe `test`/`expect` de
  `../support/test.js` (inclui a **guarda de CSP**: qualquer violação no
  Librishelf reprova). Ajudantes em `e2e/support/`: `createAccount(api)`
  (cadastro + confirmação + login pela API), `addBook`, `makePublic`,
  `waitForMail`/`linkIn`, `buyAnnual`, `startCheckout`, `payWithoutReturning`,
  `fakePayment`. Cada teste cria o próprio usuário (`newIdentity`): o banco do
  E2E não é limpo entre execuções e os testes rodam em paralelo.
- Efeito que a API dispara sem segurar a resposta (e-mail, registro de
  erro, limpeza de fila): espere com `tests/helpers/waitFor.js`, nunca com
  pausa fixa.
- Contagem no fim da sessão de 2026-11-12: 773 no backend, 158 no frontend,
  36 no E2E (12 cenários × Pixel, iPhone e desktop).

## Backend: convenções

- **Rota fina:** valida a entrada, chama o serviço, responde. Erro sempre por
  `sendError(res, error, 'Contexto em português')`.
- **Erro controlado:** `httpError('Mensagem em pt.', STATUS.X, 'CODIGO_ESTAVEL',
  { params })` e a chave `errors.CODIGO_ESTAVEL` nos dois locales do frontend.
  Erro sem `status` vira 500 genérico, vai para o log e para `error_reports`.
- Status HTTP por `utils/statusCodes.js`, nunca número solto.
- **Log** (`utils/logger.js`): nunca e-mail completo (só o domínio, ver
  `recipientDomain`), token, senha, cartão, documento ou corpo de pagamento.
  `error_reports` também não guarda dado pessoal.
- **Métricas:** `track('evento')` como middleware nas rotas que contam uso.
- **Pro:** recursos em `config/features.js`. Regra de ouro: **nada que é grátis
  hoje vira pago**. Recurso novo do Pro entra como `'pro'` e a rota usa
  `requirePro('recurso')`. O frontend só mostra/esconde a partir de
  `/auth/me` → `plan.features`.
- **Rate limit:** os limitadores prontos em `middlewares/rateLimiter.js`
  (rota aberta por IP, autenticada por usuário).
- **SQL:** em `database/queries/<domínio>.js`, agrupado em constantes
  `*_QUERIES`; trecho usado por mais de um domínio vai em `fragments.js`.
  Importe sempre de `database/queries.js`, que reexporta tudo (o ESM do Node
  não resolve pasta para `index.js`); arquivo novo entra na lista dele. Sempre
  parametrizado (`$1`), schema `librishelf.` explícito. Transação com
  `transaction(async client => …)` de `repositories/proGrantRepository.js`.
- **Migration nova:** `backend/db/migrations/NNN_nome.sql` (próximo número) **e**
  o mesmo bloco no fim de `db/schema.sql` (comentário `-- NNN_nome`, SQL
  idempotente com `IF NOT EXISTS`, e o `INSERT INTO librishelf.schema_migrations`).
  O servidor não sobe com migration pendente. Passo em JS que acompanha uma
  migration: em `database/migrate.js`.
- **Jobs:** `enqueue(tipo, payload, { dedupeKey, maxAttempts, runAt }, client)`
  dentro da mesma transação do que os gerou; handler em `jobs/registry.js`
  (recorrentes na lista com `everyMinutes`). Erro que não adianta repetir:
  `PermanentJobError`. Jobs atuais: `entitlements.expire`,
  `reservations.release`, `jobs.cleanup`, `webhook.process`,
  `mercadopago.reconcile`, `email.send`, `billing.reminders`,
  `follow-emails.sweep`, `tokens.cleanup`, `import.run`, `import.covers`,
  `imports.cleanup`, `backups.sweep`, `backup.create`, `errors.digest`.
- **E-mail:** modelos em `services/emailTemplates.js` (pt e en). E-mail de
  fila respeita o limite diário da caixa (`services/emailQuota.js`).
- **Mercado Pago:** só por `services/mercadoPago.js` (REST com `fetch`, sem
  SDK; links da documentação no topo do arquivo). Quem libera o Pro é o
  webhook/consulta à API (`paymentService.processPayment`, idempotente), nunca a
  URL de volta do navegador. Checkout só com e-mail confirmado e termos
  vigentes aceitos. Desistência em 7 dias (`withdrawalRules.js`).
- **Termos:** `TERMS_VERSION` em `backend/src/config/terms.js` **e**
  `frontend/src/config/site.js`, sempre iguais. Texto mudou de forma relevante
  = versão nova (pede aceite de novo).

## Frontend: convenções

- Chamadas à API só por `services/api.js` (que usa `fetchClient`); erros já
  chegam traduzidos (`ApiError`).
- Avisos com `useToast()` (`services/toast.js`); confirmação com
  `useConfirm()` / `confirmDiscard(t)` (`services/confirm.js`).
- Rotas em `router/index.js` com `meta`: `requiresAuth`, `requiresAdmin`,
  `guestOnly`, `standalone`, `public`, `title` (chave de `pageTitle.*`),
  `noindex` (`'server'` = o nginx decide) e `depth` (transição no celular).
- Estado da URL em telas filtráveis (ex.: página pública `?status=&q=&sort=`
  em `utils/publicShelf.js`): ler e escrever por funções puras testadas.
- Erros do navegador vão para o backend por `services/errorReporter.js`.
- Tema do dono (Pro) na página pública vale só enquanto ela está aberta.

## Ambientes e variáveis

`NODE_ENV`: `production` (imagem Docker), `development` (padrão), `test`
(integração: e-mail em memória, sem limites), `e2e` (sem limites e
`MP_API_URL` vale; **só** nele o endereço do Mercado Pago pode mudar).

Backend (`backend/src/.env`, modelo em `.env.example`):
- Banco: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SSL`,
  `DB_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_CA`
- Auth/HTTP: `SECRET_KEY` (32+), `COOKIE_SECURE`, `PORT`, `ALLOWED_ORIGINS`,
  `TRUST_PROXY` (2 em produção)
- Uploads e backup: `UPLOAD_DIR`, `BACKUP_DIR`, `BACKUP_KEEP`
- Open Library: `OPENLIBRARY_CONTACT`, `OPENLIBRARY_MIN_INTERVAL_MS`,
  `IMPORT_COVER_PAUSE_MS`
- E-mail: `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`, `MAIL_FROM`, `MAIL_LOGO_URL`, `MAIL_DAILY_LIMIT`,
  `MAIL_DIRECT_RESERVE`, `APP_TIME_ZONE`, `FOLLOW_EMAIL_INTERVAL_HOURS`,
  `ADMIN_EMAIL`, `ERROR_DIGEST_MINUTES`
- Mercado Pago: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_NOTIFICATION_URL`,
  `MP_SANDBOX`, `CHECKOUT_TTL_MINUTES`, `SUBSCRIPTION_GRACE_DAYS`, `MP_API_URL`
  (só `e2e`)
- Fila e logs: `JOB_POLL_MS`, `JOB_STALE_LOCK_SECONDS`, `LOG_FORMAT`, `LOG_LEVEL`
- Testes: `ALLOW_DESTRUCTIVE_TEST_DB`

Frontend: `VITE_API_URL` (padrão `/api`), `VITE_DEV_API_TARGET` (dev).
E2E: `E2E_BASE_URL`, `E2E_FAKES_URL`, `E2E_DB_HOST|PORT|NAME|USER|PASSWORD`,
`E2E_IPHONE_BROWSER`; o backend do E2E usa `e2e/backend.env`.

Atenção: o navegador manda `Origin` nos POST mesmo no mesmo domínio. Com
`ALLOWED_ORIGINS` vazio e `NODE_ENV=production`, o CORS recusa. Conferir o
valor na VPS antes de mexer em CORS.

## Deploy (referência; quem faz é o Rodrigo)

`docker compose up -d --build` na VPS (frontend, backend, worker na rede
`proxy`), depois `docker compose exec backend npm run db:migrate:docker` quando
houver migration. Uploads em `./uploads` com dono uid 1000. HSTS fica no nginx
da VPS, não no container.

## Estado e fila

Atualizado em 2026-11-16 (pacote 44; 45 em discussão). Último commit:
`af2c709` (`npm run dev` na raiz); até o 43 está commitado. O 44 está no
working tree, sem commit (mensagem sugerida: `fix: logo e marca únicos
(ícone plano em favicon, pwa e apple-touch; LIBRI + SHELF no login e nos
e-mails)`). O 45 (ícone selo de cera) também está no working tree, esperando o teste
no celular e em produção.
Feitos nesta sessão: 39h (`PublicLibrary.vue` → `components/public/`
`PublicProfileHeader`, `PublicFollowActions`, `PublicShelf`), 39i
(`YearInBooks.vue` → `components/year/`), 39j (`BookDialog.vue` →
`components/book/BookActions`, `BookPageBar`, `BookCoverPanel`,
`BookRateBlock`, `BookPublicReview`, `useBookReading.js`), 40, 41, 42, README
e os bugs. Fila de pacotes vazia; sobram as pendências antes das vendas.

Linha de base no fim da sessão: backend 772/773 (o 1 é o ritmo, ver
abaixo), frontend 158/158 com lint limpo e build ok, E2E 36/36 no modo Docker
(`E2E_IPHONE_BROWSER=chromium` nesta máquina WSL, sem as dependências do
WebKit).
Testes do backend que dependem da hora: `proStats.test.js` › "previsão de
término" falha entre 21h e meia-noite de Brasília (o `CURRENT_DATE` do banco
já é o dia seguinte em UTC: dá 9 dias em vez de 10). `backups.test.js` (dois
testes de agenda) falhou em duas rodadas da suíte inteira e passou sozinho e
na rodada seguinte: instável, provavelmente o relógio do Postgres no Docker
adiantado (ver abaixo). Nenhum dos dois foi mexido nesta sessão.
Capturas instáveis (39f e 39g): um rebuild do frontend pode mudar alguns
pixels de antisserrilhado (cantos arredondados, ~30 px) sem mudar layout.
Antes de culpar a mudança, gere um segundo "antes" (stash + rebuild) e meça
os elementos (`getBoundingClientRect` gravado em JSON no spec): no 39g o
"depois" bateu 0 px com o segundo "antes" e as medidas eram idênticas.

Atenção nesta máquina: o relógio do Postgres no Docker fica ~570 ms à frente
do Node no WSL. Comparação entre hora do banco e hora da API quebra aqui.
Instável já visto uma vez: `community.test.js` estourou os 5 s do
`beforeAll` (três cadastros com bcrypt) numa rodada da suíte inteira; não
repetiu. Se voltar, dar um timeout maior a esse hook.

### Pendências antes de abrir as vendas
- Preencher `OWNER.document` (CPF ou CNPJ) em `frontend/src/config/site.js`.
- Revisão do advogado nos Termos e na Privacidade; depois, `LEGAL_DRAFT = false`
  e nova `TERMS_VERSION` nos dois arquivos.
- Testar em produção (o sandbox não cobre, ver "Sandbox do Mercado Pago"
  abaixo): mensal com cartão real (R$ 6,90), conferir se chegam os webhooks
  de assinatura, cancelar pelo app e desistir; anual com Pix e desistir.
- Decidir se a vaga de fundador volta para a oferta quando a compra é desistida
  ou reembolsada (hoje não volta).
- CSP: conferir o job E2E do CI (nginx real) e a aba Erros; sem violações,
  trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy`.
- HSTS no nginx da VPS.
- Conferir `ALLOWED_ORIGINS` em produção (ver "Ambientes e variáveis").

### Fila

**39 — Divisão das telas grandes: concluído** (39 `queries.js`, 39b
`Settings.vue`, 39c `Community.vue`, 39d `LibraryHeader.vue`, 39e
`Dashboard.vue`, 39f `NavigationMenu.vue`, 39g `BookEditForm.vue`, 39h
`PublicLibrary.vue`, 39i `YearInBooks.vue`, 39j `BookDialog.vue`). O roteiro
abaixo vale para qualquer divisão futura.
- Como foi no 39b: subcomponentes por seção em `components/<área>/`, cada um
  com as próprias folhas; nenhum texto, rótulo ou papel muda (os E2E
  selecionam por eles). Conferir com capturas antes/depois pixel a pixel
  (spec temporário em `e2e/tests/`, `git stash` só de `frontend/` para gerar
  o "antes", `docker compose up -d --build --wait frontend` no `e2e/`).
  Detalhes que já morderam: guardar um `tar` de `frontend/` antes do
  `git stash push -u -- frontend`; comparar os PNG com `cmp` (sem PIL aqui);
  o spec de captura não pode clicar em nada que mude o estado da conta (ex.:
  a linha do teste grátis); classe global nova perde para o `.btn` declarado
  depois, então use seletor mais específico (`.sheet-stack > .sheet-submit`).
  Apagar o spec temporário no fim. Dados de tela que dependem de outras
  contas (como no 39c): o spec cria as contas uma vez e guarda em
  `e2e/.tmp/<pacote>/accounts.json`, e "antes" e "depois" usam as mesmas
  (`--workers=1`, `CAPTURE=before|after` no nome da pasta). Com o pacote
  anterior já commitado, o `git stash push -u --` pode levar só os arquivos
  do pacote (como no 39d). Depois de `Escape` num diálogo/gaveta, esperar
  antes do próximo `goto` (no celular o fechar mexe no histórico e aborta a
  navegação). Tela com gráfico: o `fullPage` no celular muda o tamanho da
  janela e o chart.js redesenha; aumente a janela até a altura da página
  (`setViewportSize`) e capture até duas seguidas saírem iguais. Classe
  renomeada: procure em `main.css` (a lista de alvos de toque de 44 px cita
  classes de componentes). Layout com `display: contents` (como o
  `.fields-column` do BookEditForm no celular): os filhos diretos ordenados
  pela grade ficam no próprio arquivo; só sai para componente o que é um
  bloco único (com uma raiz, ela herda o escopo do pai).

**40 — Padrões compartilhados: concluído.** `AppTabs` (com `icon` e
`--tabs-margin`) no Admin, Comunidade e página pública; `AppTag` (tom,
variante, `caps`); `.stagger-in` global (Comunidade, Empréstimos, Lendo
agora; Library e NavLinks têm movimento próprio e ficaram); `.link-btn`
global (`.tall`, `.danger`, `.muted`); `ProgressBar` (translateX, cores por
`--bar-fill`/`--bar-track`; o `GoalCard` ficou de fora pelo marcador de
ritmo); `AdminFilters` em todo o Admin; `useDateTag`, `formatLongDate`,
`localDate`/`toApiDate` no lugar das cópias (`isoDate`/`fromIso` saíram de
`statPeriods.js`), `formatMoney` único.

**41 — Métricas da página pública: concluído.** Tabela
`public_page_daily` (028), `POST /public-metrics/u/:usuario`,
`GET /profile-page/visits` (Pro: `page_visits`), `GET /admin/public-pages`
(seção na aba Uso), cadastro conta pelo `redirect`. Visita uma vez por
sessão e dia (`utils/publicVisit.js`, sessionStorage). Privacidade ganhou
dois parágrafos (sem nova `TERMS_VERSION`: decidir com o advogado).

**42 — Onboarding: concluído.** Migration 029 (`onboarding_status`,
`_step`, `_start`; contas antigas como `done`), `GET/PATCH /onboarding`,
`user.onboarding` no `/auth/me`, tela `/welcome` (`views/Onboarding.vue` e
`components/onboarding/`), o Início leva a ela enquanto estiver pendente
(`utils/onboarding.js`) e mostra "Continuar os primeiros passos" quando
pulado. Sem meta anual. No E2E, `createAccount` conclui o onboarding
(`onboarding: true` para deixar pendente); cenário em `onboarding.spec.js`.

**README: concluído** (Pro e Mercado Pago, desistência e reembolso, jobs,
backups e erros, CSP, Termos, E2E e CI, migrations até a 029, fluxo de
trabalho). `.env.example` ganhou as variáveis que faltavam.

### Sandbox do Mercado Pago (sessões de 2026-11-13 e 14)
Feito com conta de teste vendedora (TESTUSER5414…, id 3843975860, dona da
aplicação; token `APP_USR-…` de produção dela) e compradora
(`test_user_4506985576096390792@testuser.com`, id 3843975862), túnel ngrok,
API/worker/Vite locais com `MP_SANDBOX=true`. Conta `comprador` (id 46) no
banco local, com 2 pagamentos de teste aprovados.
- **ok:** anual aprovado (checkout, webhook assinado, worker, e-mail);
  segunda compra com Pro ativo entra na fila depois do primeiro ano.
- **Reembolso não é testável no sandbox:** MP responde 401 "Unauthorized use
  of live credentials" (pagamentos de teste saem com `live_mode=true`). A
  falha foi tratada certo: nada mudou sem o estorno.
- **Travou no checkout do MP, não no Librishelf:** cartão novo na compradora
  ("Ops, ocorreu um erro"), então recusado/pendente não rodaram; mensal
  (preapproval) recusado e `cancelled` pelo MP com o Visa salvo `APRO`.
  Nenhum webhook de assinatura chegou (nem o do cancelamento): conferir em
  produção se "Planos e assinaturas" está marcado.
- Fundador anual está `available: false` nas ofertas (B9 não rodou).
- Como subir o sandbox de novo (2026-11-15, funcionou): `MP_ACCESS_TOKEN`,
  `MP_WEBHOOK_SECRET` e `MP_SANDBOX=true` no `src/.env.local`. O token é o
  **Access Token** de produção da vendedora de teste (`APP_USR-<16 díg>-…`,
  longo); a Public Key (`APP_USR-` + UUID) dá 401 "Unauthorized access to
  resource". `ngrok http 5173`, e o endereço dele em `APP_URL`,
  `ALLOWED_ORIGINS` (junto com localhost) e `MP_NOTIFICATION_URL`
  (`…/api/webhooks/mercadopago`): o `/preapproval` recusa `back_url` em
  localhost. Subir com
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.ngrok-free.app npm run dev:local`
  e abrir o app pelo ngrok (cookie é por domínio). Conta `comprador` (id 46)
  com senha `senha12345` no banco local (trocada nesta data).

**43 — Ajustes do sandbox: concluído (2026-11-14).**
1. Desistência com erro do MP agora dá `REFUND_PROVIDER_ERROR` ("Não foi
   possível pedir o reembolso agora…"), nos dois locales.
2. IPN (`?id=&topic=`, sem `data.id` e sem `x-signature`) recebe 200 e é
   ignorada sem gravar (`isIpn` em `webhookService.js`); com `x-signature`
   continua conferida.
3. O log de diagnóstico da assinatura inválida ficou, com teste (formato sem
   valores).
4. Decisão: o Pro anual é **sempre 365 dias**, também em ano bissexto
   (comentário no `YEAR_MS` de `paymentService.js`).
5. `STATUS.BAD_GATEWAY` e `SERVICE_UNAVAILABLE` em `statusCodes.js`; nenhum
   5xx solto no backend.
Instável: `mercadopago-checkout.test.js` estourou os 5 s do `beforeAll`
(14 cadastros com bcrypt) em 3 de 6 rodadas; o "sync confere na API" falhou
2 vezes (`plan.pro` falso) e passou nas outras. Nenhum dos dois foi mexido.
`backups.test.js` (dois testes de agenda) falhou de novo, na suíte e sozinho
(`sweep` enfileira 0): o mesmo instável do relógio. Suíte: 773/775.

**44 — Logo único (ícone plano): concluído (2026-11-16).** O desenho
isométrico saiu; tudo vem do `favicon.svg` (porta-livros plano).
- PNG gerados com ImageMagick (`convert -background none -density 2400 …`):
  `bookshelf.png` (440, transparente: `og:image` e logo dos e-mails, mesma
  URL), `icons/icon-192|512.png` (transparentes), `favicon.ico` (48/32/16).
- Fundo opaco e glifo centrado: maskable 512 com escala 0,62 (o canto (30,30)
  fica dentro do círculo de 40%) e apple 180 com escala 0,75. Padrão em
  `#121212` (`icon-maskable-512.png`, `apple-touch-icon.png`); alternativos
  com a cor do próprio SVG (`icons/alt/<n>-maskable-512.png`, `<n>-apple.png`).
  Os manifestos alternativos apontam o maskable para o arquivo novo.
- `apple-touch-icon` opaco (o iOS pinta a transparência de preto) no
  `index.html`, `theme-boot.js` e `useTheme.js`; o seletor de ícone usa os
  `-apple.png` (os quatro com fundo).
- Menu, barra do celular, `PublicBar` e Início vazio usam `/favicon.svg`;
  `bookshelf.png` saiu do precache do service worker.
- Desenho mudar de novo: editar `favicon.svg` (e os `alt/*.svg`) e gerar os
  PNG do mesmo jeito.
- Marca escrita igual em todo lugar (LIBRI sem serifa + SHELF serifado):
  `BrandWordmark` ganhou `mono` (as duas partes na cor do texto em volta);
  o `AuthLayout` mostra a marca quando não recebe `title` (as telas de
  entrada pararam de passar "Librishelf"; o Cadastro mantém "Junte-se."), com
  `drop-shadow` no lugar do `text-shadow`; topo dos e-mails com os dois
  `<span>`. O resumo do ano (`yearStory.js`) já desenhava assim. Título da aba,
  assuntos e textos corridos continuam "Librishelf".

**45 — Ícone novo: selo de cera "W4": no código (2026-11-16), falta testar
no celular e em produção.** Depois de 12 rodadas de desenho (página:
https://claude.ai/artifact/BAAscCwRLubopbFryZs9j2, ler com a ferramenta
Artifact), o Rodrigo escolheu o W4: gota de lacre vermelho (`#e5484d`) com
sombra deslocada (`#c2272d`), anel e "LS" em relevo (L da Inter 800 + S da
Source Serif 4 700, contornos tirados dos woff2 com fontTools). Conceito:
ex-libris ("dos livros de"; "libris" é o LIBRI do nome).
- `favicon.svg` e `icons/alt/{paper,night,mono}.svg` novos (letras num
  `<defs>` usado duas vezes: sombra e relevo). Pro: papel = cera vinho
  `#9b1c2e` em `#f2e8d5`; noite = cera dourada `#e0b354` em `#141a2e`;
  mono = cera `#e6e6e6` com letras escuras `#2e2e2e` em `#111111`.
- PNG gerados **pelo Chromium do Playwright** (o ImageMagick não aplica bem
  os transforms das letras): `bookshelf.png` 440, `icon-192|512`,
  maskable `#121212` a 0,62, apple 180 `#121212` a 0,75, os `alt/` com o
  fundo do quadro; `favicon.ico` 48/32/16 juntado pelo ImageMagick. Script em
  `/tmp/claude-0/-root-librishelf/34edc410-5d29-463e-ad77-d5190e483b62/scratchpad/w4/gerar-icones.mjs`
  (pode sumir; para refazer basta renderizar os SVG de `public/` no tamanho).
- Service worker: o `BUILD_ID` agora inclui o conteúdo dos arquivos de
  `public/` do precache, e a instalação busca de novo tudo que não é de
  `/assets/` (antes um ícone novo com o mesmo nome ficava preso no cache).
- Testes: lint limpo, frontend 158/158, build ok. Falta: ver no celular
  (PWA instalado: Android pode demorar a trocar o ícone da tela inicial; no
  iOS, remover e adicionar de novo), aba, seletor de ícone do Pro e e-mail
  (o logo do e-mail é o `bookshelf.png` de produção, então só muda depois do
  deploy).
- Ajuste ainda em aberto: na prévia de link (og-image do lembrete abaixo),
  trocar a faixa de madeira por nada ou um fio vermelho.
- Alternativa guardada: "8a4i", pilha de livros na tábua (rodada 6 da página).
- Exploração depois do W4 (sem mudar código): rodada 13 = carimbo retangular
  com LS e tinta falhada (C1–C9); rodada 14 (2026-11-19) = xilogravura a partir
  das referências do Rodrigo em `~/temp/` (G1–G9: pilha entalhada, placa
  negativa, selo redondo, livro com raios, leitura noturna). O Rodrigo pediu
  só o L sem serifa, o S serifado e a borda: rodada 15 (H1–H9: redondo,
  redondo com fio, quadrado, em pé; tinta escura no papel ou vermelha sem
  quadro; L azul; disco vazado). Depois pediu mais natural e com linhas retas:
  rodada 16 (J1–J9), mesma geometria com filtro de tinta (`stampPrint`:
  ruído fino + manchas largas num limiar, borda 1,9). Em 16 px a textura
  estraga as letras: o favicon pequeno teria de sair sem textura. Pediu menos
  falha (wear baixou na 16) e depois falhas só horizontais: rodada 17
  (K1–K9, `streak: true` = ruído esticado em x, sem tremido na borda).
  Rodada 18 (N1–N9): forma preta com o LS vazado (transparente); N1/N2
  chapados (`flatPrint`). Preto some no fundo escuro: precisaria de versão
  clara no tema escuro. Rodada 19 (P1–P10): o preto vazado num quadro
  colorido (vermelho, azul do LIBRI, amarelo, verde); a cor aparece dentro
  das letras. Rodada 20 (Q1–Q10): só o quadrado vazado no quadro colorido, com
  detalhes de carimbo (fio, poucas falhas, riscos horizontais, batida torta de
  4°, pouca tinta); Q10 = o mesmo chapado, para o favicon.
  **Decisão (2026-11-19): ideia do carimbo/xilogravura abandonada** (rodadas
  13 a 20): o Rodrigo achou todos ruins de visualização. Fica o W4, que já
  está commitado (`e821f9b`); nada do carimbo foi para o código.
  Rodada 21 (T1–T12, chapados): marcador de página, prateleira com vaga,
  lombadas-gráfico, livro inclinado, livro-telhado (casa) e ficha de
  biblioteca, duas versões de cada. O Rodrigo gostou do T8 (livro
  inclinado + livro em pé + tábua, silhueta escura no quadro amarelo) por
  lembrar um L de longe. Rodada 22 (U1–U11, 2026-11-20, helper `leanL`):
  só o L, L mais reto, apoio baixo, canto fechado (tábua sem sobra à
  esquerda), vazado, azul, amarelo no escuro, azul sem quadro, lombadas,
  vermelho, L azul + apoio vermelho. O Rodrigo pediu variações do U5
  (vazado): rodada 23 (V1–V11, helper `cutTile`): quadro azul, vermelho,
  escuro, só o L, L mais reto, apoio baixo, centrado e maior, redondo,
  filetes sem recorte, L vazado + apoio em tinta, L vazado no azul.
  Pediu mais cara de livro e física certa: rodada 24 (Y1–Y10, helpers
  `physBooks`/`physCut`/`spine`): o inclinado gira no canto de baixo do
  lado para onde tomba e o ângulo sai do contato do canto de cima com o
  livro em pé (`asin`); cabeceado, etiqueta, dobras da capa dura, lombadas
  finas com 3 livros. Em 16 px os detalhes viram ruído.
  Rodada 25 (E1–E11, 2026-11-21, helpers `emblem`/`emblemMini`/`mono`/
  `arches`/`arcText`): emblema redondo a partir de uma foto do Rodrigo
  (`~/temp/2026-11-21_11-28.png`: fio vinho, anel creme com arcos, LIBRI
  SHELF em curva, disco verde-oliva com LS e S com cortes de "páginas").
  E1–E5 completos (fiel, com a marca, lombadas no lugar dos arcos, azul,
  sem texto); E6–E11 reduzidos para ícone (verde, com páginas, serifado,
  azul, vinho, Pro noite). Rodada 26 (F1–F12, helper `emblem2`):
  variações do E2: S liso, arcos simples, arcada maior, arcos com livros,
  EX LIBRIS em cima, pontos separadores, texto maior, disco maior, só
  vinho, verde por fora, tema escuro, LIBRI em azul. O Rodrigo não gostou de nenhuma (2026-11-22, lançamento
  com pressa): rodada 27 (R1–R8, chapados, sem estante nem emblema): óculos
  de leitura (amarelo, escuro), livro com visto, anel de progresso, balão de
  resenha, "ls" com o l de fita de marcador, L de fita, LS de fita.
  O Rodrigo gostou do R4 (anel de progresso com livro aberto): rodada 28
  (S1–S11, helper `progRing`): mais grosso, sem trilho, cursor na ponta,
  capítulos, página azul, quadro azul, claro, sem quadro, Pro papel e noite,
  arco em 90%. O Rodrigo mandou guardar a ideia (S1 é o melhor dela) e pediu
  símbolos de gerenciamento de acervo: rodada 29 (Z1–Z9): gaveta de
  fichário, código de barras-estante, leitor de ISBN, etiqueta de
  classificação, escaninhos, divisórias, lupa na estante, livro etiquetado,
  inventário. Gostou do Z5 (escaninhos) e do Z7 (lupa na estante): rodada 30
  (B1–B11, helpers `cubby`/`shelfLens`/`lensAt`): escaninhos no escuro,
  grossos, vaga azul, moldura azul, sem quadro; lupa maior, que amplia, no
  claro, no azul; escaninhos com a lupa no nicho vazio (claro e escuro).
  Pediu para seguir só com o Z7: rodada 31 (D1–D10, helper `lensShelf`):
  "achou" (cinza fora da lente, cor dentro; escuro e claro), sem tábua,
  lente azul, lupa no canto, duas lombadas, tons de azul, sem quadro, Pro
  papel e noite. O Rodrigo mandou guardar a ideia do Z7 (D1 "achou" é o
  melhor dela) e perguntou o que o slogan "Sua biblioteca pessoal, em todo
  lugar." sugere como logo. Rodada 32 (L1–L10, helpers `pinPath`,
  `ribbonPin`, `pocketShelf`, `bookRibbon`, `globeSpines`, `globeBands`):
  pino-livro (escuro, solto vermelho), marcador-pino, estante no bolso,
  livro com marcador saindo, globo de lombadas (com órbita, em gomos).
  Gostou do L2 (pino-livro vermelho, sem quadro): rodada 33 (O1–O10, helper
  `pinBook`): azul, livro maior, sombra no chão, livro vazado, lombadas na
  cabeça, meio a meio azul/vermelho, quadro escuro, creme com livro
  vermelho, Pro papel e noite. Pediu variações do O5 (lombadas na cabeça
  do pino): rodada 34 (I1–I10, helper `pinShelf`, livro inclinado com
  ângulo por asin): lombadas maiores, uma inclinada, coloridas, inclinada
  colorida, pino azul, vazada, sem tábua, quadro escuro, Pro papel e
  noite. **Rumo (2026-11-22): I6** (pino com estante vazada, uma inclinada),
  sempre vazado, cor principal azul, cor acompanhando o tema. Pendências
  da ideia: ícone de app (PWA maskable, apple-touch) precisa de fundo
  opaco, então lá o vazado mostra a cor do quadro; prévia de link e
  e-mail também com fundo fixo; versão de 16 px com lombadas mais grossas;
  dentro do app, componente SVG com a cor do token do tema e id de máscara
  único. Rodada 35 (helpers `pin6`, `pin16`): I6 sem fundo por tema (T-cl
  azul `rgb(10,104,180)`, T-es `#3a86ff`, T-pa vinho `#9b1c2e`, T-no dourado
  `#e0b354`, T-mo `#a1a1aa`), com fundo para a tela inicial (A-pd `#121212`,
  A-cl branco, A-pa `#f2e8d5`, A-no `#141a2e`, A-mo pino `#e6e6e6` em
  `#111111`) e versão reforçada de 16 px (16-cl, 16-es: duas lombadas +
  a inclinada, mais grossas, tábua 2,2). No código, o pino nos quadros
  ainda precisa encolher para a área segura (maskable 0,62; apple 0,75).
  Pediu o LS do W4 no lugar dos livros: rodada 36 (LS-1–LS-9, helper
  `pinLS`): LS vazado (azul escuro e claro), maior, branco por cima, L
  vazado + S branco, todo sem serifa (para 16 px), app padrão a 0,8, Pro
  papel e noite. O Rodrigo disse que está difícil escolher (2026-11-22).
  Sugestão dada: parar de gerar rodadas; finalistas W4 (no código), LS-3
  (pino com LS), D1 (lupa "achou") e S1 (anel de progresso); testar no
  celular e na aba de verdade, perguntar a leitores, prazo curto e, sem
  decisão, lançar com o W4. Seção "Finalistas" no topo da página (ROUND37:
  W4, LS-3, D1, S1, cada um com prévia de link, e-mail e menu). Pediu o
  W4 em azul: seção "W4 em azul" (ROUND38, `sealAlt(cera, sombra, letras)`):
  WB1 `#3a86ff`/`#1f5fc4`/`#dbe8ff`, WB2 `rgb(10,104,180)`/`#07477d`/
  `#d3e6f7`, WB3 marinho `#1e3a8a`/`#13255a`/`#e3ebff`, WB4 LS branco,
  WB5/WB6 nos quadros (escala 0,8). Para aplicar: trocar as cores no
  `favicon.svg` atual (mesmo desenho) e gerar os PNG. Pediu borda mais
  natural e arredondada: seção ROUND39 (helper `waxSoft`, 64 pontos, sem a
  frequência 11): WR1 suave {a3 .75, a5 .35, a7 .3}, WR2 mais suave {a3 .6,
  a5 .3, a7 .12}, WR3 solta {a2 .35, a3 .7, a5 .4, a7 .15}; WR4/WR5 no azul
  do escuro; WR6 no quadro. Aplicar = trocar o contorno da gota no
  `favicon.svg` (e alternativos) por esse caminho. Pediu mais redondo:
  ROUND40 (WC1 {a3 .42, a5 .16, a7 .05}, WC2 {a3 .3, a5 .1}, WC3 {a3 .18,
  a5 .07}; WC4/WC5 no azul do escuro; WC6 no quadro). **Escolhido: WC1**
  (2026-11-22). Seção ROUND41 mostra todos os usos: favicon claro (cera
  `rgb(10,104,180)`, sombra `#07477d`, LS `#d3e6f7`) e escuro (`#3a86ff`,
  `#1f5fc4`, `#dbe8ff`), app padrão `#121212` e claro branco (escala 0,8),
  Pro papel (`#9b1c2e`, `#6e1220`, `#f5d0d6` em `#f2e8d5`), noite (`#e0b354`,
  `#a77d22`, `#fff3d1` em `#141a2e`), mono (`#e6e6e6`, `#a1a1aa`, LS
  `#2e2e2e` em `#111111`). Próximo: pacote 45b (aplicar no código, sessão
  nova). **Aplicado (pacote 45b, 2026-11-22)**, ver o item 45b abaixo; o W4 segue no código como plano B.

**45b — Ícone WC1 (selo azul, borda redonda): no working tree, sem commit
(2026-11-22).** Mesmo desenho do W4 com a gota redonda (64 pontos, ondas
3/5/7 com amplitudes .42/.16/.05, sem a 11) e cera azul.
- `favicon.svg`, `bookshelf.png` e `icon-192|512` (transparentes): cera
  `#0a68b4`, sombra/anel `#07477d`, LS `#d3e6f7`. Maskable (0,62) e
  apple (0,75) em `#121212` com o azul do escuro (`#3a86ff`, `#1f5fc4`,
  `#dbe8ff`). Alternativos do Pro com a borda nova e as mesmas cores de
  antes. `favicon.ico` 16/32/48 do Chromium juntado pelo ImageMagick.
- Gerador: `scratchpad/wc1/gerar.py` desta sessão (pode sumir; refazer =
  trocar o caminho da gota nos SVG e renderizar como no 45). Cópia de
  `public/` antes da troca em `scratchpad/wc1/public-antes`.
- Testes: lint limpo, frontend 158/158, build ok. Falta ver no celular e,
  depois do deploy, o logo do e-mail. Mensagem sugerida:
  `feat: ícone em selo de cera azul com borda redonda (favicon, pwa, apple-touch e alternativos do pro)`

**46 — LIBRI e SHELF da mesma altura: no working tree, sem commit
(2026-11-25).** Na mesma `font-size`, a maiúscula da Source Serif 4 700 tem
0,672 em e a da Inter 800 tem 0,735 (medido pelo Chromium), então o SHELF
saía ~9% mais baixo. `BrandWordmark` usa `font-size-adjust: cap-height 0.727`
nas duas partes; o resumo do ano (`yearStory.js`, canvas) mede o "H" nas duas
fontes e ajusta o tamanho do SHELF; o topo dos e-mails põe o SHELF (Georgia)
em 25px contra 24px. Mensagem sugerida:
`fix: libri e shelf com a mesma altura de maiúscula na marca (app, resumo do ano e e-mails)`

### Bugs anotados (fora de pacote)
- Nenhum aberto. Corrigidos no fim da sessão de 2026-11-12: âncora
  `#settings-notifications` do descadastro (`utils/anchor.js`,
  `scrollBehavior` e `routeFocus`), espaço antes de "e mais N" no feed
  (`CommunityFeedItem.vue`) e busca estreita da Biblioteca a 1366 px com o
  menu (limite da linha única do `LibraryHeader` subiu para 1200 px).

### Lembrete guardado (não fazer agora)
Apps iOS e Android: avaliar empacotar o PWA (Capacitor ou TWA) em vez de um
app React Native separado. Atenção à regra de compra dentro do app no iOS
para o Pro via Mercado Pago. O Rodrigo pediu para esperar e ser lembrado.

Logo com o texto em fontes fixas (aprovado em 2026-11-16, fazer depois do
pacote 45): o ícone e a marca juntos numa imagem, renderizados
com Inter e Source Serif 4 pelo Playwright do `e2e/` (script que lê um HTML
de modelo, sem dependência nova). Saídas: `og-image.png` 1200×630 (fundo
`#18181b`, frase "Sua biblioteca pessoal, em todo lugar.", faixa marrom de
prateleira embaixo) com `twitter:card` `summary_large_image` no `index.html`
e no `metaService.js` (a página com capas mantém o mosaico; ajustar o
`linkPreview.test.js`); `email-logo.png` 2x no topo dos e-mails, no lugar
do ícone com o texto, com `alt="Librishelf"`. `LIBRI` no azul fixo
(`rgb(58,134,255)` no escuro, `rgb(10,104,180)` no claro) e respiro de
0,04em antes do `SHELF`. SVG com as letras em contorno ficou de fora (só para
impressão e imprensa; pediria `opentype.js`).
