-- Impede que clientes autenticados leiam CPF, telefone e dados Pix diretamente
-- da tabela pública de afiliados. Esses campos são servidos por affiliate_private_data.
REVOKE SELECT ON TABLE public.affiliates FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  code,
  status,
  name,
  affiliate_email,
  instagram,
  website,
  total_sales,
  total_commission,
  created_at,
  updated_at
) ON TABLE public.affiliates TO authenticated;
