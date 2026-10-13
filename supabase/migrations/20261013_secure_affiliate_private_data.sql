-- ETAPA 1: preparar armazenamento separado para dados pessoais e de pagamento dos afiliados.
-- Esta migração cria a tabela privada, copia os dados existentes e aplica RLS.
-- Não remove as colunas antigas de public.affiliates; isso só deve ocorrer após
-- a migração do frontend e a validação dos fluxos de afiliado e administrador.
--
-- IMPORTANTE: contas que usam affiliate-login próprio (sem Supabase Auth) não
-- conseguem acessar esta tabela como "authenticated" até existir um mecanismo
-- de sessão/autorização próprio. Nesse fluxo, os dados devem ser lidos/escritos
-- somente por Edge Function autorizada usando a chave secreta no servidor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.affiliate_private_data (
  affiliate_id text PRIMARY KEY
    REFERENCES public.affiliates(id) ON DELETE CASCADE,
  phone text,
  cpf text,
  pix_type text,
  pix_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_private_data ENABLE ROW LEVEL SECURITY;

-- Não conceder acesso a visitantes anônimos.
REVOKE ALL ON TABLE public.affiliate_private_data FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.affiliate_private_data TO authenticated;

DROP POLICY IF EXISTS affiliate_private_select_own_or_admin
  ON public.affiliate_private_data;
CREATE POLICY affiliate_private_select_own_or_admin
  ON public.affiliate_private_data
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.affiliates a
      WHERE a.id = affiliate_private_data.affiliate_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS affiliate_private_insert_own_or_admin
  ON public.affiliate_private_data;
CREATE POLICY affiliate_private_insert_own_or_admin
  ON public.affiliate_private_data
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.affiliates a
      WHERE a.id = affiliate_private_data.affiliate_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS affiliate_private_update_own_or_admin
  ON public.affiliate_private_data;
CREATE POLICY affiliate_private_update_own_or_admin
  ON public.affiliate_private_data
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.affiliates a
      WHERE a.id = affiliate_private_data.affiliate_id
        AND a.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.affiliates a
      WHERE a.id = affiliate_private_data.affiliate_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

-- Copia os dados existentes sem sobrescrever dados privados já migrados.
INSERT INTO public.affiliate_private_data
  (affiliate_id, phone, cpf, pix_type, pix_key, updated_at)
SELECT
  a.id, a.phone, a.cpf, a.pix_type, a.pix_key,
  COALESCE(a.updated_at, now())
FROM public.affiliates a
ON CONFLICT (affiliate_id) DO NOTHING;

COMMIT;

-- Verificação pós-migração:
-- SELECT count(*) AS afiliados,
--        (SELECT count(*) FROM public.affiliate_private_data) AS dados_privados
-- FROM public.affiliates;
