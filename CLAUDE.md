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
- Contagem no fim do pacote 38: 755 no backend, 120 no frontend, 30 no E2E
  (6 cenários × Pixel, iPhone e desktop).

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

Atualizado ao fim do pacote 39d (2026-11-08). Último commit: `b3cacfc`
(39c; o 39d ainda não commitado). Próximo: 39e, `Dashboard.vue` (1.220
linhas), seguindo o roteiro do 39b descrito na fila.

Linha de base depois do 39d (igual à do 39b): backend 755/755, frontend
123/123 e lint limpo,
E2E 30/30 no modo Docker (`E2E_IPHONE_BROWSER=chromium` nesta máquina WSL,
que não tem as dependências do WebKit).

Atenção nesta máquina: o relógio do Postgres no Docker fica ~570 ms à frente
do Node no WSL. Comparação entre hora do banco e hora da API quebra aqui.
Instável já visto uma vez: `community.test.js` estourou os 5 s do
`beforeAll` (três cadastros com bcrypt) numa rodada da suíte inteira; não
repetiu. Se voltar, dar um timeout maior a esse hook.

### Pendências antes de abrir as vendas
- Preencher `OWNER.document` (CPF ou CNPJ) em `frontend/src/config/site.js`.
- Revisão do advogado nos Termos e na Privacidade; depois, `LEGAL_DRAFT = false`
  e nova `TERMS_VERSION` nos dois arquivos.
- Testar a desistência no sandbox do Mercado Pago real, com cartão e com Pix.
- Decidir se a vaga de fundador volta para a oferta quando a compra é desistida
  ou reembolsada (hoje não volta).
- CSP: conferir o job E2E do CI (nginx real) e a aba Erros; sem violações,
  trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy`.
- HSTS no nginx da VPS.
- Conferir `ALLOWED_ORIGINS` em produção (ver "Ambientes e variáveis").

### Fila (um pacote por item, nesta ordem)

**39e em diante — Divisão das telas grandes** (feitos: 39 `queries.js`, 39b
`Settings.vue`, 39c `Community.vue`, 39d `LibraryHeader.vue`)
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
  navegação).
- Telas com mais de 1.100 linhas, subcomponentes por seção sem mudar
  comportamento: `Dashboard.vue`, `NavigationMenu.vue`, `BookEditForm.vue`,
  `PublicLibrary.vue`, `YearInBooks.vue`, `BookDialog.vue`. Um pacote por tela
  se ficar pesado. Rodar o E2E depois de cada uma.

**40 — Padrões compartilhados**
- Abas: `components/ui/AppTabs.vue` (do 39c: degradê nas bordas com
  `useScrollEdges`, aba ativa centralizada, setas do teclado) só está na
  Comunidade. Passar Admin (máscara própria, ícone nas abas: pede slot ou
  `icon` no item) e PublicLibrary (`.public-tabs`) para ele; o visual das
  bordas muda no Admin, conferir com captura.
- Selo (`.offer-tag`, `.late-tag`, admin pills, `.source` da aba Erros) →
  componente `AppTag`.
- Cascata do celular (Community, Loans, ReadingNow) → classe global com `--i`.
- Botões de texto (`.link-button`, `.action-link`, `.bar-link`,
  `.pro-notice-link`) → `.link-btn` (criar).
- Barra de progresso (Import, ReadingNow, ReadingNowCard) → componente.
- `AdminFilters` nos radiogroups escritos à mão em AdminAccounts,
  AdminModeration e AdminQueue.
- Varredura de CSS e funções duplicados (data, número, dinheiro; ex.:
  `money`/`shortDate` em SettingsPlan).

**41 — Métricas da página pública**
- Contador próprio, sem cookies e sem IP guardado. Eventos: visita a
  `/u/:usuario` (uma por sessão do navegador, hash do dia); cliques em
  Compartilhar, "Criar conta" e "Entrar" no convite; cadastro com origem
  `/u/...` pelo `redirect`. Agregado por dia, nada individual.
- Tela no Admin com a conversão página → cadastro. Atualizar a Privacidade
  se precisar (hoje diz "métricas internas").
- Estender o cenário E2E da página pública para conferir a contagem.
- Decisão pendente: "visitas da sua página" para o dono só no Pro?

**42 — Onboarding**
- Depois de confirmar o e-mail: como prefere começar (Goodreads/CSV, códigos
  de barras ou busca por título), 3 primeiros livros, ligar a biblioteca
  pública (opcional, com prévia), progresso até o Vanguarda (10 livros).
  Pode ser pulado e retomado; estado no servidor.
- Os cenários E2E que entram logo após o cadastro vão precisar pular o
  onboarding.
- Decisão pendente: a meta anual entra no onboarding?

**Por último — README**
- Pro e Mercado Pago (variáveis), desistência e reembolso; worker e jobs
  (inclui `errors.digest`); migrations até a mais nova; `ADMIN_EMAIL`,
  `BACKUP_DIR`, `ERROR_DIGEST_MINUTES` (a fila antiga citava `PROFILE_COVER`,
  mas no código só existe o erro `PROFILE_COVER_INVALID`: conferir); CSP
  (`nginx-security.conf`, `/csp-report`, como trocar para bloqueio),
  `/client-errors`, Termos (`TERMS_VERSION`, `LEGAL_DRAFT`, `OWNER`); CI, E2E
  (dois modos, `NODE_ENV=e2e`, `MP_API_URL`) e o fluxo de trabalho.

### Bugs anotados (fora de pacote)
- `Unsubscribe.vue` manda para `/settings#settings-notifications`, mas o
  `scrollBehavior` do router ignora o hash e a seção de avisos não tem esse
  `id` (o `SettingsGroup` aceita `anchor`). Hoje cai no topo da Conta.
- Feed da Comunidade, evento com mais de 3 livros: falta o espaço antes de
  "e mais N" ("Vidas Secase mais 2"), em `CommunityFeedItem.vue` (o espaço
  inicial do `<span>` some no template). Já era assim antes do 39c.
- Biblioteca no computador (1366 px, menu lateral aberto): a busca fica
  estreita entre o título e o ordenar e até o texto curto aparece cortado
  ("Buscar li"). Já era assim antes do 39d (visto nas capturas).

### Lembrete guardado (não fazer agora)
Apps iOS e Android: avaliar empacotar o PWA (Capacitor ou TWA) em vez de um
app React Native separado. Atenção à regra de compra dentro do app no iOS
para o Pro via Mercado Pago. O Rodrigo pediu para esperar e ser lembrado.
