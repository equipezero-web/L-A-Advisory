-- Freeze affiliate commission at checkout; retain atomic stock and idempotency.
CREATE OR REPLACE FUNCTION public.fulfill_paid_order_atomic(p_order_id text, p_paid_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_commission numeric := 0;
  v_item_commission numeric := 0;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'pedido não encontrado';
  end if;

  if v_order.payment_status = 'approved' then
    return false;
  end if;

  for v_item in
    select oi.id, oi.product_id, oi.quantity, oi.gross_price, oi.affiliate_commission, p.commission
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
    order by oi.id
  loop
    update public.products
       set stock = stock - v_item.quantity,
           updated_at = now()
     where id = v_item.product_id
       and active = true
       and stock >= v_item.quantity;

    if not found then
      raise exception 'estoque insuficiente para produto %', v_item.product_id;
    end if;

    if v_order.affiliate_code is not null then
      v_item_commission := round(
        coalesce(
          v_item.affiliate_commission,
          coalesce(v_item.gross_price, 0) * v_item.quantity *
          greatest(least(coalesce(v_item.commission, 0), 100), 0) / 100
        ), 2
      );

      update public.order_items
         set affiliate_commission = v_item_commission
       where id = v_item.id;

      v_commission := v_commission + v_item_commission;
    else
      update public.order_items
         set affiliate_commission = 0
       where id = v_item.id;
    end if;
  end loop;

  if v_order.affiliate_code is not null then
    update public.affiliates
       set total_sales = coalesce(total_sales, 0) + coalesce(v_order.total, 0),
           total_commission = coalesce(total_commission, 0) + round(v_commission, 2),
           updated_at = now()
     where code = v_order.affiliate_code
       and status = 'active';
  end if;

  update public.orders
     set payment_status = 'approved',
         status = 'paid',
         paid_at = coalesce(p_paid_at, now()),
         updated_at = now()
   where id = p_order_id;

  return true;
end;
$function$

