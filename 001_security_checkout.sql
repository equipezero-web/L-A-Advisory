-- Execute no Supabase SQL Editor antes do deploy das Edge Functions.
-- Registra a taxa de comissão congelada no momento da compra.
alter table public.order_items
  add column if not exists commission_rate numeric(5,2) not null default 0
  check (commission_rate >= 0 and commission_rate <= 100);

-- Nunca permita que cliente altere campos financeiros/estado de afiliado diretamente.
drop policy if exists affiliates_update_own on public.affiliates;
create policy affiliates_update_own_safe
on public.affiliates
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (public.is_admin());

-- Cliente não cria/edita pedidos, pagamentos ou itens diretamente.
-- Essas operações são feitas pelas Edge Functions usando service role.

create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_payments_provider_payment_id on public.payments(provider_payment_id);
