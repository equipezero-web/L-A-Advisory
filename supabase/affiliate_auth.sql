-- Autenticação separada para afiliados.
-- O cliente continua usando Supabase Auth.
-- O afiliado usa credenciais próprias e pode compartilhar o mesmo e-mail.

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS affiliate_email text,
  ADD COLUMN IF NOT EXISTS affiliate_password_hash text,
  ADD COLUMN IF NOT EXISTS affiliate_password_salt text;

ALTER TABLE public.affiliates
  ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS affiliates_affiliate_email_lower_unique
  ON public.affiliates (lower(affiliate_email))
  WHERE affiliate_email IS NOT NULL;

COMMENT ON COLUMN public.affiliates.affiliate_email IS
  'E-mail de login exclusivo do afiliado; pode ser igual ao e-mail de um cliente.';

COMMENT ON COLUMN public.affiliates.affiliate_password_hash IS
  'Hash PBKDF2 da senha exclusiva do afiliado. Nunca armazena a senha em texto puro.';

COMMENT ON COLUMN public.affiliates.affiliate_password_salt IS
  'Salt aleatório usado no hash PBKDF2 da senha do afiliado.';


-- ============================================================
-- CONTROLE DE PAGAMENTOS DE COMISSÃO DO AFILIADO
-- O ADM registra cada pagamento efetuado ao afiliado.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.affiliate_commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE CASCADE,
  affiliate_code text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_commission_payments_code_idx
  ON public.affiliate_commission_payments (affiliate_code);

CREATE INDEX IF NOT EXISTS affiliate_commission_payments_paid_at_idx
  ON public.affiliate_commission_payments (paid_at);

ALTER TABLE public.affiliate_commission_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Afiliado pode consultar seus pagamentos" ON public.affiliate_commission_payments;
CREATE POLICY "Afiliado pode consultar seus pagamentos"
  ON public.affiliate_commission_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.affiliates a
      WHERE a.id = affiliate_commission_payments.affiliate_id
        AND a.user_id = auth.uid()
        AND a.status IN ('active','approved')
    )
  );

DROP POLICY IF EXISTS "ADM pode consultar pagamentos de comissão" ON public.affiliate_commission_payments;
CREATE POLICY "ADM pode consultar pagamentos de comissão"
  ON public.affiliate_commission_payments
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ADM pode registrar pagamento de comissão" ON public.affiliate_commission_payments;
CREATE POLICY "ADM pode registrar pagamento de comissão"
  ON public.affiliate_commission_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ADM pode alterar pagamento de comissão" ON public.affiliate_commission_payments;
CREATE POLICY "ADM pode alterar pagamento de comissão"
  ON public.affiliate_commission_payments
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ADM pode excluir pagamento de comissão" ON public.affiliate_commission_payments;
CREATE POLICY "ADM pode excluir pagamento de comissão"
  ON public.affiliate_commission_payments
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- RPC segura para o afiliado consultar somente suas vendas indicadas,
-- mesmo quando a tabela orders estiver protegida por RLS.
CREATE OR REPLACE FUNCTION public.get_affiliate_dashboard(p_affiliate_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_affiliate public.affiliates%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT *
    INTO v_affiliate
  FROM public.affiliates
  WHERE upper(code) = upper(trim(p_affiliate_code))
    AND user_id = auth.uid()
  LIMIT 1;

  IF v_affiliate.id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado ao painel do afiliado';
  END IF;

  SELECT jsonb_build_object(
    'orders',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'code', o.code,
          'status', o.status,
          'payment_status', o.payment_status,
          'total', o.total,
          'created_at', o.created_at,
          'paid_at', o.paid_at,
          'affiliate_code', o.affiliate_code,
          'commission_amount',
          COALESCE((
            SELECT SUM(
              COALESCE(oi.price, 0) * COALESCE(oi.quantity, 1) *
              COALESCE(p.commission, 0) / 100
            )
            FROM public.order_items oi
            LEFT JOIN public.products p ON p.id = oi.product_id
            WHERE oi.order_id = o.id
          ), 0),
          'items',
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'name', oi.name,
                'price', oi.price,
                'quantity', oi.quantity
              )
            )
            FROM public.order_items oi
            WHERE oi.order_id = o.id
          ), '[]'::jsonb)
        )
        ORDER BY o.created_at DESC
      )
      FROM public.orders o
      WHERE upper(o.affiliate_code) = upper(v_affiliate.code)
    ), '[]'::jsonb),
    'payouts',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'amount', p.amount,
          'paid_at', p.paid_at,
          'reference', p.reference,
          'notes', p.notes
        )
        ORDER BY p.paid_at DESC
      )
      FROM public.affiliate_commission_payments p
      WHERE p.affiliate_id = v_affiliate.id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_dashboard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_dashboard(text) TO authenticated;
