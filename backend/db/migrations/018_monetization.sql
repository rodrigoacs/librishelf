-- 018 — monetização: planos Pro, pagamentos, webhooks, selos, termos e fila de jobs
--
-- "Tem Pro" = existe pelo menos um entitlement com status 'active' e ends_at
-- nulo (vitalício = enquanto o serviço existir) ou no futuro. Quem deixa de ter
-- Pro mantém os dados Pro visíveis; só a escrita é recusada (PRO_REQUIRED).
--
-- Valores sempre em centavos. Na web só BRL; o modelo já aceita as lojas
-- (source/provider 'apple' e 'google') para quando os apps chegarem.

-- ---------------------------------------------------------------------------
-- Ofertas: preço e vagas. As vagas do fundador e da Vanguarda são contadas
-- aqui (slots_used), sempre com SELECT … FOR UPDATE na linha da oferta.
-- A janela de lançamento é starts_at/ends_at; as de fundador nascem fechadas
-- (active = false, sem datas) e são abertas quando a janela for decidida.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.offers (
  code         text PRIMARY KEY CHECK (code IN ('monthly', 'annual', 'founder_annual', 'founder_lifetime', 'vanguarda')),
  price_cents  integer NOT NULL CHECK (price_cents >= 0),
  currency     text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  -- Quanto tempo cada compra vale: 'month', 'year' ou 'lifetime' (ends_at nulo)
  duration     text NOT NULL CHECK (duration IN ('month', 'year', 'lifetime')),
  -- true só no mensal (assinatura/preapproval no cartão)
  auto_renew   boolean NOT NULL DEFAULT false,
  slots_total  integer CHECK (slots_total IS NULL OR slots_total >= 0),
  slots_used   integer NOT NULL DEFAULT 0 CHECK (slots_used >= 0),
  starts_at    timestamptz,
  ends_at      timestamptz,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_slots_limit CHECK (slots_total IS NULL OR slots_used <= slots_total),
  CONSTRAINT offers_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

INSERT INTO librishelf.offers (code, price_cents, duration, auto_renew, slots_total, active) VALUES
  ('monthly',            690, 'month',    true,  NULL, true),
  ('annual',            4990, 'year',     false, NULL, true),
  ('founder_annual',    3990, 'year',     false, 100,  false),
  ('founder_lifetime', 14990, 'lifetime', false, 100,  false),
  ('vanguarda',            0, 'lifetime', false, 100,  true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Entitlements: cada período de Pro, venha de onde vier.
--   kind     o que deu o Pro
--   source   quem garante: mercadopago, grant (admin/Vanguarda), trial, lojas
--   status   active | canceled (revogado antes do fim) | expired | refunded
--   auto_renew + canceled_at: no mensal, cancelar a renovação NÃO tira o Pro;
--            o entitlement continua 'active' até ends_at, com auto_renew false.
--   external_id  preapproval do Mercado Pago, transação das lojas etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.entitlements (
  id           bigserial PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('monthly', 'annual', 'founder_annual', 'founder_lifetime', 'vanguarda', 'trial')),
  source       text NOT NULL CHECK (source IN ('mercadopago', 'grant', 'trial', 'apple', 'google')),
  starts_at    timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'refunded')),
  auto_renew   boolean NOT NULL DEFAULT false,
  canceled_at  timestamptz,
  external_id  text CHECK (external_id IS NULL OR char_length(external_id) <= 200),
  -- Quem concedeu/revogou pela administração (nulo para compras)
  granted_by   integer REFERENCES librishelf.users(id) ON DELETE SET NULL,
  note         text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_period CHECK (ends_at IS NULL OR ends_at > starts_at),
  -- Teste tem sempre fim; vitalícios nunca têm
  CONSTRAINT entitlements_trial_ends CHECK (kind <> 'trial' OR ends_at IS NOT NULL),
  CONSTRAINT entitlements_lifetime_open CHECK (kind NOT IN ('founder_lifetime', 'vanguarda') OR ends_at IS NULL)
);

-- "Tem Pro?" e o painel de Conta: só as linhas ativas de cada pessoa
CREATE INDEX IF NOT EXISTS idx_entitlements_user_active
  ON librishelf.entitlements (user_id, ends_at) WHERE status = 'active';
-- Job de expiração: o que já passou do fim e ainda está ativo
CREATE INDEX IF NOT EXISTS idx_entitlements_expiring
  ON librishelf.entitlements (ends_at) WHERE status = 'active' AND ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entitlements_granted_by
  ON librishelf.entitlements (granted_by) WHERE granted_by IS NOT NULL;
-- Um teste e uma Vanguarda por conta, em qualquer status
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_trial_per_user
  ON librishelf.entitlements (user_id) WHERE kind = 'trial';
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_vanguarda_per_user
  ON librishelf.entitlements (user_id) WHERE kind = 'vanguarda';
-- Mesmo recurso externo não vira dois entitlements
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_external
  ON librishelf.entitlements (source, external_id) WHERE external_id IS NOT NULL;

-- Um teste por conta, mesmo que o entitlement do teste seja apagado à mão
ALTER TABLE librishelf.users ADD COLUMN IF NOT EXISTS pro_trial_used_at timestamptz;

-- ---------------------------------------------------------------------------
-- Reservas de vaga: a vaga de fundador é presa (slots_used + 1, com FOR UPDATE)
-- ao abrir o checkout, para nunca vender a 101. Se o pagamento não sai até
-- expires_at, o job devolve a vaga (released). Aprovado → confirmed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.offer_reservations (
  id          bigserial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  offer_code  text NOT NULL REFERENCES librishelf.offers(code),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'released')),
  -- external_reference enviado ao Mercado Pago (liga o pagamento à reserva)
  reference   text NOT NULL UNIQUE CHECK (char_length(reference) <= 64),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Uma reserva em aberto por pessoa e oferta
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_reservations_open
  ON librishelf.offer_reservations (user_id, offer_code) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offer_reservations_expiring
  ON librishelf.offer_reservations (expires_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Pagamentos. Ficam guardados mesmo depois da exclusão da conta (prazo
-- fiscal): user_id vira NULL. Nunca há dado de cartão aqui; raw guarda a
-- resposta da API do provedor já sem os campos de cartão.
-- status segue os valores da API de pagamentos do Mercado Pago:
-- https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/response-handling/query-results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.payments (
  id              bigserial PRIMARY KEY,
  user_id         integer REFERENCES librishelf.users(id) ON DELETE SET NULL,
  offer_code      text NOT NULL REFERENCES librishelf.offers(code),
  provider        text NOT NULL CHECK (provider IN ('mercadopago', 'apple', 'google')),
  external_id     text NOT NULL CHECK (char_length(external_id) <= 200),
  method          text CHECK (method IS NULL OR method IN ('card', 'pix')),
  amount_cents    integer NOT NULL CHECK (amount_cents >= 0),
  currency        text NOT NULL DEFAULT 'BRL' CHECK (char_length(currency) = 3),
  status          text NOT NULL CHECK (status IN ('pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back')),
  entitlement_id  bigint REFERENCES librishelf.entitlements(id) ON DELETE SET NULL,
  reservation_id  bigint REFERENCES librishelf.offer_reservations(id) ON DELETE SET NULL,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  refunded_by     integer REFERENCES librishelf.users(id) ON DELETE SET NULL,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_external_unique UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON librishelf.payments (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created ON librishelf.payments (created_at DESC, id DESC);
-- Reconciliação diária: o que ainda não chegou a um estado final
CREATE INDEX IF NOT EXISTS idx_payments_open ON librishelf.payments (created_at)
  WHERE status IN ('pending', 'authorized', 'in_process', 'in_mediation');
CREATE INDEX IF NOT EXISTS idx_payments_entitlement ON librishelf.payments (entitlement_id) WHERE entitlement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_reservation ON librishelf.payments (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_refunded_by ON librishelf.payments (refunded_by) WHERE refunded_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Webhooks recebidos: gravados antes de qualquer processamento (idempotência
-- por provider + event_id) e reprocessáveis pela administração.
-- resource_id é o data.id da notificação (o recurso consultado na API).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.webhook_events (
  id            bigserial PRIMARY KEY,
  provider      text NOT NULL CHECK (provider IN ('mercadopago', 'apple', 'google')),
  event_id      text NOT NULL CHECK (char_length(event_id) <= 200),
  topic         text NOT NULL CHECK (char_length(topic) <= 100),
  resource_id   text CHECK (resource_id IS NULL OR char_length(resource_id) <= 200),
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload       jsonb NOT NULL,
  error         text,
  CONSTRAINT webhook_events_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON librishelf.webhook_events (received_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON librishelf.webhook_events (received_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Selos ('vanguarda' agora; outros depois)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.user_badges (
  user_id    integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  badge      text NOT NULL CHECK (badge IN ('vanguarda')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge)
);

-- ---------------------------------------------------------------------------
-- Aceite dos termos (uma linha por versão aceita)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.terms_acceptance (
  user_id       integer NOT NULL REFERENCES librishelf.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL CHECK (char_length(terms_version) <= 40),
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, terms_version)
);

-- ---------------------------------------------------------------------------
-- Fila de jobs no Postgres, consumida com FOR UPDATE SKIP LOCKED (sem Redis).
-- dedupe_key: o mesmo job agendado duas vezes vira um só (ex.: lembrete de
-- renovação do entitlement 42). Fica nulo quando duplicar não importa.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS librishelf.jobs (
  id            bigserial PRIMARY KEY,
  type          text NOT NULL CHECK (char_length(type) <= 60),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    text UNIQUE CHECK (dedupe_key IS NULL OR char_length(dedupe_key) <= 200),
  run_at        timestamptz NOT NULL DEFAULT now(),
  attempts      integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  locked_at     timestamptz,
  locked_by     text CHECK (locked_by IS NULL OR char_length(locked_by) <= 100),
  done_at       timestamptz,
  failed_at     timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- O worker busca: não terminado, não falhado de vez, na hora
CREATE INDEX IF NOT EXISTS idx_jobs_ready
  ON librishelf.jobs (run_at, id) WHERE done_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_type_done ON librishelf.jobs (type, done_at DESC);

-- ---------------------------------------------------------------------------
-- Novas ações da administração (conceder/revogar Pro, reembolso, webhook).
-- avatar.keep e avatar.remove já eram gravadas pela moderação de fotos (017),
-- mas faltavam aqui: a moderação de foto falhava com violação da CHECK.
-- ---------------------------------------------------------------------------
ALTER TABLE librishelf.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE librishelf.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('admin.unlock', 'review.hide', 'review.show', 'user.suspend', 'user.reactivate', 'user.resend_verification', 'email.test',
                    'avatar.keep', 'avatar.remove',
                    'pro.grant', 'pro.revoke', 'payment.refund', 'webhook.reprocess', 'offer.update'));
