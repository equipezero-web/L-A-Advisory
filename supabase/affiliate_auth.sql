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
