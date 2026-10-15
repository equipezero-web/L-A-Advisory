-- Restrict direct client writes to the affiliates table.
-- Registration and privileged/admin changes must use server-side Edge Functions.
-- Authenticated users may only update the non-sensitive public profile fields;
-- RLS continues to restrict which affiliate row they can update.

BEGIN;

REVOKE INSERT, UPDATE ON TABLE public.affiliates FROM authenticated;

REVOKE INSERT (
    id,
    user_id,
    code,
    status,
    name,
    phone,
    cpf,
    pix_type,
    pix_key,
    instagram,
    website,
    total_sales,
    total_commission,
    created_at,
    updated_at,
    affiliate_email,
    affiliate_password_hash,
    affiliate_password_salt
)
ON TABLE public.affiliates
FROM authenticated;

REVOKE UPDATE (
    id,
    user_id,
    code,
    status,
    name,
    phone,
    cpf,
    pix_type,
    pix_key,
    instagram,
    website,
    total_sales,
    total_commission,
    created_at,
    updated_at,
    affiliate_email,
    affiliate_password_hash,
    affiliate_password_salt
)
ON TABLE public.affiliates
FROM authenticated;

GRANT UPDATE (
    name,
    instagram,
    website
)
ON TABLE public.affiliates
TO authenticated;


-- Restrict direct client writes to private affiliate contact and payout data.
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
