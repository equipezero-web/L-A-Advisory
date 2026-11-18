-- Fix guest catalog: anon must not evaluate the is_admin() security helper.
-- Public visitor SELECT is already granted by "Produtos públicos podem ser visualizados"
-- which restricts rows to active=true. Admins retain inactive product access.
ALTER POLICY products_public_select ON public.products TO authenticated;
