import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
const SITE_URL = Deno.env.get('SITE_URL') || 'https://equipezero-web.github.io/L-A-Advisory';

function money(n: number) { return Math.round(n * 100) / 100; }
function code(prefix: string) { return `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!MP_ACCESS_TOKEN) return json({ error: 'Mercado Pago não configurado no servidor.' }, 500);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'JSON inválido.' }, 400);

  const customer = body.customer || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const affiliateCode = typeof body.affiliateCode === 'string' ? body.affiliateCode.trim().toUpperCase() : null;

  if (!customer.fullName || !customer.cpf || !customer.phone || !customer.email || !customer.address) {
    return json({ error: 'Dados do cliente incompletos.' }, 400);
  }
  if (!items.length || items.length > 50) return json({ error: 'Carrinho inválido.' }, 400);

  const quantities = new Map<string, number>();
  for (const item of items) {
    const id = String(item?.productId || '');
    const quantity = Number(item?.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return json({ error: 'Item ou quantidade inválida.' }, 400);
    }
    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }

  const productIds = [...quantities.keys()];
  const { data: products, error: productsError } = await admin
    .from('products')
    .select('id,name,description,price,discount,stock,commission,image,active')
    .in('id', productIds)
    .eq('active', true);
  if (productsError) return json({ error: 'Não foi possível consultar os produtos.' }, 500);
  if (!products || products.length !== productIds.length) return json({ error: 'Um ou mais produtos não estão disponíveis.' }, 409);

  let subtotal = 0;
  const orderItems: any[] = [];
  const mpItems: any[] = [];
  for (const product of products) {
    const quantity = quantities.get(product.id)!;
    if (product.stock < quantity) return json({ error: `Estoque insuficiente para ${product.name}.` }, 409);
    const price = Number(product.price);
    const discount = Math.min(Math.max(Number(product.discount || 0), 0), 100);
    const unitPrice = money(price * (1 - discount / 100));
    const itemSubtotal = money(unitPrice * quantity);
    subtotal += itemSubtotal;
    orderItems.push({
      id: code('ITEM'), product_id: product.id, product_name: product.name,
      quantity, unit_price: unitPrice, discount, subtotal: itemSubtotal,
    });
    mpItems.push({
      id: product.id, title: product.name, description: product.description || product.name,
      quantity, unit_price: unitPrice, currency_id: 'BRL',
    });
  }
  subtotal = money(subtotal);

  let validAffiliateCode: string | null = null;
  if (affiliateCode) {
    const { data: affiliate } = await admin.from('affiliates')
      .select('code,status').eq('code', affiliateCode).eq('status', 'active').maybeSingle();
    if (affiliate) validAffiliateCode = affiliate.code;
  }

  const orderId = code('ORDER');
  const orderCode = code('ORD');
  const { error: orderError } = await admin.from('orders').insert({
    id: orderId, code: orderCode, user_id: user.id,
    customer_name: String(customer.fullName).slice(0, 160),
    customer_phone: String(customer.phone).slice(0, 40),
    customer_email: String(customer.email).slice(0, 254),
    address: { text: String(customer.address).slice(0, 1000), cpf: String(customer.cpf).replace(/\D/g, '') },
    status: 'pending', payment_status: 'pending', subtotal, shipping: 0, discount: 0,
    total: subtotal, currency: 'BRL', affiliate_code: validAffiliateCode,
    payment_method: 'mercado_pago',
  });
  if (orderError) return json({ error: 'Não foi possível criar o pedido.' }, 500);

  const { error: itemsError } = await admin.from('order_items').insert(orderItems.map(i => ({ ...i, order_id: orderId })));
  if (itemsError) {
    await admin.from('orders').delete().eq('id', orderId);
    return json({ error: 'Não foi possível criar os itens do pedido.' }, 500);
  }

  const preference = {
    items: mpItems,
    external_reference: orderId,
    notification_url: `${SUPABASE_URL}/functions/v1/mercado-pago-webhook`,
    payer: { email: String(customer.email).slice(0, 254) },
    back_urls: {
      success: `${SITE_URL}?payment=success&order=${encodeURIComponent(orderId)}`,
      failure: `${SITE_URL}?payment=failure&order=${encodeURIComponent(orderId)}`,
      pending: `${SITE_URL}?payment=pending&order=${encodeURIComponent(orderId)}`,
    },
    auto_return: 'approved',
  };

  const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(preference),
  });
  const mpData = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok || !mpData.id || !mpData.init_point) {
    await admin.from('orders').update({ status: 'cancelled', payment_status: 'cancelled' }).eq('id', orderId);
    console.error('Mercado Pago preference error', mpData);
    return json({ error: 'Não foi possível iniciar o pagamento.' }, 502);
  }

  const { error: paymentError } = await admin.from('payments').insert({
    id: code('PAY'), order_id: orderId, provider: 'mercado_pago',
    provider_payment_id: null, status: 'pending', amount: subtotal,
    currency: 'BRL', payment_method: 'mercado_pago', provider_status: 'created',
  });
  if (paymentError) console.error('payment insert error', paymentError);

  return json({ ok: true, orderId, init_point: mpData.init_point });
});
