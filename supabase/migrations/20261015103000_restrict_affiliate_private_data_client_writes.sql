-- Remove direct client writes to affiliate private data.
-- Keep SELECT grants for the existing owner/admin UI; RLS continues to restrict rows.
-- Writes must go through trusted Edge Functions using service_role.

BEGIN;

REVOKE INSERT, UPDATE
ON TABLE public.affiliate_private_data
FROM authenticated;

REVOKE INSERT (
    affiliate_id,
    phone,
    cpf,
    pix_type,
    pix_key,
    updated_at
)
ON TABLE public.affiliate_private_data
FROM authenticated;

REVOKE UPDATE (
    affiliate_id,
    phone,
    cpf,
    pix_type,
    pix_key,
    updated_at
)
ON TABLE public.affiliate_private_data
FROM authenticated;

COMMIT;
