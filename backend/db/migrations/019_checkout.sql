-- 019 — checkout avulso do Mercado Pago
--
-- offer_reservations passa a guardar o que o checkout precisa:
--   holds_slot    true quando a reserva prendeu uma vaga da oferta (fundador
--                 novo). Renovação do fundador anual e ofertas sem limite não
--                 prendem vaga, então vencer o checkout não devolve nada.
--   amount_cents  preço no momento do checkout (o pagamento é conferido
--                 contra este valor, não contra o preço atual da oferta)
--   checkout_url  link do Mercado Pago (init_point), para reabrir o mesmo
--                 checkout enquanto a reserva vale
--   preference_id id da preferência no Mercado Pago
ALTER TABLE librishelf.offer_reservations ADD COLUMN IF NOT EXISTS holds_slot boolean NOT NULL DEFAULT false;
ALTER TABLE librishelf.offer_reservations ADD COLUMN IF NOT EXISTS amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0);
ALTER TABLE librishelf.offer_reservations ADD COLUMN IF NOT EXISTS checkout_url text CHECK (checkout_url IS NULL OR char_length(checkout_url) <= 1000);
ALTER TABLE librishelf.offer_reservations ADD COLUMN IF NOT EXISTS preference_id text CHECK (preference_id IS NULL OR char_length(preference_id) <= 200);

-- Pagamento aprovado que não virou Pro (vaga de fundador esgotada depois que
-- o checkout venceu, valor diferente do esperado…): a administração vê e
-- reembolsa. Texto curto com o motivo.
ALTER TABLE librishelf.payments ADD COLUMN IF NOT EXISTS problem text CHECK (problem IS NULL OR char_length(problem) <= 300);
CREATE INDEX IF NOT EXISTS idx_payments_problem ON librishelf.payments (created_at DESC) WHERE problem IS NOT NULL;
