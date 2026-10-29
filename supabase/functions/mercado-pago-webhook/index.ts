import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const SERVICE = SECRET_KEYS.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || '';
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') || '';
const SHEETS_WEBHOOK_URL = Deno.env.get('SHEETS_WEBHOOK_URL') || '';
const SHEETS_WEBHOOK_SECRET = Deno.env.get('SHEETS_WEBHOOK_SECRET') || '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

async function validateMercadoPagoSignature(req: Request): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return false;
  const xSignature = req.headers.get('x-signature') || '';
  const xRequestId = req.headers.get('x-request-id') || '';
  const url = new URL(req.url);
  const dataId = (url.searchParams.get('data.id') || '').toLowerCase();
  let ts = '';
  let v1 = '';
  for (const part of xSignature.split(',')) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (key?.trim() === 'ts') ts = value;
    if (key?.trim() === 'v1') v1 = value;
  }
  if (!ts || !v1) return false;
  const manifestParts: string[] = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = manifestParts.join(';') + ';';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const computed = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (computed.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

async function logSaleToSheet(admin: ReturnType<typeof createClient>, orderId: string, paidAtIso: string) {
  if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) return;
  try {
    const { data: order } = await admin.from('orders').select('code,affiliate_code').eq('id', orderId).maybeSingle();
    const { data: items } = await admin.from('order_items').select('product_name,quantity,unit_price,subtotal').eq('order_id', orderId);
    if (!order || !items?.length) return;
    const paidAt = new Date(paidAtIso);
    const tz = 'America/Sao_Paulo';
    const date = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(paidAt);
    const time = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(paidAt);
    const rows = items.map((item: any) => [order.code, item.product_name, Number(item.quantity), Number(item.unit_price), Number(item.subtotal), order.affiliate_code || '', date, time]);
    await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: SHEETS_WEBHOOK_SECRET, rows }),
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('Falha ao registrar venda na planilha:', error instanceof Error ? error.message : error);
  }
}

function normalizeStatus(value: unknown) {
  const map: Record<string, string> = {
    processed: 'approved', approved: 'approved', pending: 'pending', in_process: 'pending', action_required: 'pending',
    rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'chargeback',
  };
  return map[String(value || '').toLowerCase()] || 'pending';
}

async function savePayment(admin: ReturnType<typeof createClient>, orderId: string, paymentId: string, status: string, amount: number, currency: string, method: string, providerStatus: unknown, detail: unknown) {
  if (!paymentId) return;
  const { data: existing } = await admin.from('payments').select('id').eq('provider_payment_id', paymentId).maybeSingle();
  const row = {
    order_id: orderId,
    provider: 'mercado_pago',
    provider_payment_id: paymentId,
    status,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: currency || 'BRL',
    payment_method: method || 'mercado_pago',
    provider_status: providerStatus ? String(providerStatus) : null,
    provider_status_detail: detail ? String(detail) : null,
    paid_at: status === 'approved' ? new Date().toISOString() : null,
  };
  if (existing) await admin.from('payments').update(row).eq('id', existing.id);
  else await admin.from('payments').insert({ id: crypto.randomUUID(), ...row });
}

async function applyOrderStatus(admin: ReturnType<typeof createClient>, orderId: string, paymentStatus: string) {
  if (paymentStatus === 'approved') {
    const paidAt = new Date().toISOString();
    const { data: applied, error } = await admin.rpc('fulfill_paid_order_atomic', { p_order_id: orderId, p_paid_at: paidAt });
    if (error) throw new Error(`Falha no fulfillment atômico: ${error.message}`);
    if (applied === true) await logSaleToSheet(admin, orderId, paidAt);
    return;
  }
  const status = paymentStatus === 'refunded' ? 'refunded' : (paymentStatus === 'rejected' || paymentStatus === 'cancelled') ? 'cancelled' : 'pending';
  await admin.from('orders').update({ payment_status: paymentStatus, status }).eq('id', orderId).neq('payment_status', 'approved');
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);
    if (!SUPABASE_URL || !SERVICE || !MP_ACCESS_TOKEN) return json({ error: 'Servidor não configurado corretamente.' }, 503);
    if (!(await validateMercadoPagoSignature(req))) return json({ error: 'Assinatura do Webhook inválida.' }, 401);

    const payload = await req.json().catch(() => ({}));
    const type = String(payload?.type || payload?.topic || '').toLowerCase();
    if (type === 'mp-connect' || type === 'application.authorized') return json({ received: true });
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

    if (type === 'order' || type === 'orders') {
      const mpOrderId = String(payload?.data?.id || payload?.id || '').trim();
      if (!mpOrderId) return json({ received: true });
      const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(mpOrderId)}`, { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, Accept: 'application/json' } });
      const mpOrder = await response.json().catch(() => ({}));
      if (!response.ok || !mpOrder?.id) return json({ received: true });
      const orderId = String(mpOrder.external_reference || '').trim();
      if (!orderId) return json({ received: true });
      const { data: order } = await admin.from('orders').select('id').eq('id', orderId).maybeSingle();
      if (!order) return json({ received: true });
      const payments = Array.isArray(mpOrder?.transactions?.payments) ? mpOrder.transactions.payments : [];
      const payment = payments[0] || {};
      const paymentStatus = normalizeStatus(mpOrder.status || payment.status);
      const paymentId = String(payment.id || '').trim();
      await savePayment(admin, orderId, paymentId, paymentStatus, Number(payment.amount || payment.paid_amount || mpOrder.total_paid_amount || mpOrder.total_amount || 0), mpOrder.currency_id || 'BRL', payment?.payment_method?.type || payment?.payment_method?.id || 'mercado_pago', payment.status || mpOrder.status, payment.status_detail || mpOrder.status_detail);
      await applyOrderStatus(admin, orderId, paymentStatus);
      return json({ received: true });
    }

    const paymentId = String(payload?.data?.id || payload?.id || '').trim();
    if (!paymentId || (type && !type.includes('payment'))) return json({ received: true });
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } });
    const payment = await response.json().catch(() => ({}));
    if (!response.ok || !payment?.id) return json({ error: 'Não foi possível verificar o pagamento.' }, 502);
    const orderId = String(payment.external_reference || '').trim();
    if (!orderId) return json({ received: true });
    const { data: order } = await admin.from('orders').select('id').eq('id', orderId).maybeSingle();
    if (!order) return json({ received: true });
    const paymentStatus = normalizeStatus(payment.status);
    await savePayment(admin, orderId, String(payment.id), paymentStatus, Number(payment.transaction_amount || 0), payment.currency_id || 'BRL', payment.payment_type_id || 'mercado_pago', payment.status, payment.status_detail);
    await applyOrderStatus(admin, orderId, paymentStatus);
    return json({ received: true });
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error instanceof Error ? error.message : error);
    return json({ error: 'Falha ao processar a notificação de pagamento.' }, 500);
  }
});
