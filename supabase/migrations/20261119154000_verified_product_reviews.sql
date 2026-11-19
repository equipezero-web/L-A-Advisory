-- Only genuine delivered, customer-confirmed purchases can be reviewed.
drop policy if exists reviews_insert_own on public.reviews;
drop policy if exists reviews_verified_purchases_insert on public.reviews;
create policy reviews_verified_purchases_insert on public.reviews
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = reviews.product_id
      and o.user_id = (select auth.uid())
      and o.status = 'delivered'
      and o.delivered_confirmed_at is not null
      and o.payment_status = 'approved'
  )
);

-- Customers may not change moderation status themselves.
drop policy if exists reviews_update_own on public.reviews;
drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update on public.reviews
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
