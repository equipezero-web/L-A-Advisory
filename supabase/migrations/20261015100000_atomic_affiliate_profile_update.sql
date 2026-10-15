-- Atomically save an affiliate's own public profile and private payout/contact data.
-- Only the trusted service_role may execute this RPC. The Edge Function must
-- validate the affiliate session and reject blocked accounts before calling it.

BEGIN;

CREATE OR REPLACE FUNCTION public.affiliate_update_profile_atomic(
    p_affiliate_id text,
    p_name text,
    p_instagram text,
    p_website text,
    p_phone text,
    p_cpf text,
    p_pix_type text,
    p_pix_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_updated_id text;
BEGIN
    IF p_affiliate_id IS NULL OR pg_catalog.btrim(p_affiliate_id) = ''
       OR p_name IS NULL OR pg_catalog.btrim(p_name) = ''
       OR p_phone IS NULL OR pg_catalog.btrim(p_phone) = ''
       OR p_cpf IS NULL OR p_cpf !~ '^[0-9]{11}$'
       OR p_pix_type IS NULL OR pg_catalog.btrim(p_pix_type) = ''
       OR p_pix_key IS NULL OR pg_catalog.btrim(p_pix_key) = '' THEN
        RAISE EXCEPTION 'Dados de perfil inválidos'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.affiliates
    SET name = pg_catalog.btrim(p_name),
        instagram = NULLIF(pg_catalog.btrim(COALESCE(p_instagram, '')), ''),
        website = NULLIF(pg_catalog.btrim(COALESCE(p_website, '')), ''),
        updated_at = pg_catalog.now()
    WHERE id = p_affiliate_id
      AND status <> 'blocked'
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RAISE EXCEPTION 'Afiliado não encontrado ou indisponível'
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.affiliate_private_data (
        affiliate_id, phone, cpf, pix_type, pix_key, updated_at
    )
    VALUES (
        p_affiliate_id,
        pg_catalog.btrim(p_phone),
        p_cpf,
        pg_catalog.btrim(p_pix_type),
        pg_catalog.btrim(p_pix_key),
        pg_catalog.now()
    )
    ON CONFLICT (affiliate_id) DO UPDATE
    SET phone = EXCLUDED.phone,
        cpf = EXCLUDED.cpf,
        pix_type = EXCLUDED.pix_type,
        pix_key = EXCLUDED.pix_key,
        updated_at = EXCLUDED.updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.affiliate_update_profile_atomic(
    text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.affiliate_update_profile_atomic(
    text, text, text, text, text, text, text, text
) TO service_role;

COMMIT;
