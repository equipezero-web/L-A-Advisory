-- Store Royal public product reviews. Only APPROVED review text/rating is public.
-- Preserve each customer's own review visibility and existing admin policies.
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reviews_public_approved ON public.reviews;
CREATE POLICY reviews_public_approved
ON public.reviews FOR SELECT TO anon, authenticated
USING (status = 'approved');

-- Public viewers do not need private user_id/order_id metadata.
REVOKE SELECT ON public.reviews FROM anon;
GRANT SELECT (product_id, rating, comment, status, created_at)
ON public.reviews TO anon;

-- RLS alone previously let a signed-in author set their own review status
-- to 'approved' on insert or update. Enforce moderation in the database.
CREATE OR REPLACE FUNCTION public.royal_guard_review_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $review_guard$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Somente administradores podem alterar o status da avaliação';
    END IF;
  END IF;
  RETURN NEW;
END;
$review_guard$;

DROP TRIGGER IF EXISTS royal_guard_review_approval_trigger ON public.reviews;
CREATE TRIGGER royal_guard_review_approval_trigger
BEFORE INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.royal_guard_review_approval();
