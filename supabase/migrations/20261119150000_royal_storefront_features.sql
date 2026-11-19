-- Royal Storefront: banners, carts, featured products and verified delivery confirmation.
alter table public.products add column if not exists featured boolean not null default false;

create table if not exists public.royal_storefront_settings (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint royal_storefront_settings_key_check check (key = 'hero_banners'),
  constraint royal_storefront_settings_banners_array_check check (jsonb_typeof(value) = 'array' and jsonb_array_length(value) <= 6)
);
alter table public.royal_storefront_settings enable row level security;
grant select on public.royal_storefront_settings to anon, authenticated;
grant insert, update, delete on public.royal_storefront_settings to authenticated;
create policy royal_settings_read on public.royal_storefront_settings for select to anon, authenticated using (true);
create policy royal_settings_admin_insert on public.royal_storefront_settings for insert to authenticated with check ((select public.is_admin()));
create policy royal_settings_admin_update on public.royal_storefront_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy royal_settings_admin_delete on public.royal_storefront_settings for delete to authenticated using ((select public.is_admin()));
insert into public.royal_storefront_settings(key, value) values ('hero_banners','[]'::jsonb)
on conflict(key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('royal-hero-banners', 'royal-hero-banners', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy royal_hero_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'royal-hero-banners' and (select public.is_admin()));
create policy royal_hero_admin_update on storage.objects for update to authenticated
using (bucket_id = 'royal-hero-banners' and (select public.is_admin()))
with check (bucket_id = 'royal-hero-banners' and (select public.is_admin()));
create policy royal_hero_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'royal-hero-banners' and (select public.is_admin()));
create policy royal_hero_admin_select on storage.objects for select to authenticated
using (bucket_id = 'royal-hero-banners' and (select public.is_admin()));

create table if not exists public.royal_carts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 items jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 constraint royal_carts_items_array check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100)
);
alter table public.royal_carts enable row level security;
grant select, insert, update, delete on public.royal_carts to authenticated;
create policy royal_carts_select on public.royal_carts for select to authenticated using (user_id = (select auth.uid()));
create policy royal_carts_insert on public.royal_carts for insert to authenticated with check (user_id = (select auth.uid()));
create policy royal_carts_update on public.royal_carts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy royal_carts_delete on public.royal_carts for delete to authenticated using (user_id = (select auth.uid()));

alter table public.orders add column if not exists delivered_confirmed_at timestamptz;
create or replace function public.confirm_order_delivery(p_order_id text)
returns timestamptz
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_confirmed_at timestamptz;
begin
 if (select auth.uid()) is null then raise exception 'Sessão necessária'; end if;
 update public.orders
    set status='delivered',
        delivered_confirmed_at=coalesce(delivered_confirmed_at, now()),
        updated_at=now()
  where id=p_order_id
    and user_id=(select auth.uid())
    and status in ('shipped','delivered')
    and payment_status='approved'
 returning delivered_confirmed_at into v_confirmed_at;
 if v_confirmed_at is null then
   raise exception 'Pedido não elegível para confirmação de recebimento';
 end if;
 return v_confirmed_at;
end;
$$;
revoke all on function public.confirm_order_delivery(text) from public, anon;
grant execute on function public.confirm_order_delivery(text) to authenticated;
