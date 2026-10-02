import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);

  const payload = await req.json().catch(() => ({}));
  const paymentId = String(payload?.data?.id || payload?.id || '').trim();
  const type = String(payload?.type || payload?.topic || '').toLowerCase();
  if (!paymentId || (type && !type.includes('payment'))) return json({ received: true });

  const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  const payment = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok || !payment?.id) return json({ error: 'Não foi possível verificar o pagamento.' }, 502);

  const orderId = String(payment.external_reference || '').trim();
  if (!orderId) return json({ received: true });
  const admin = createClient(URL, SERVICE);
  const { data: order } = await admin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return json({ received: true });

  const statusMap: Record<string, string> = {
    approved: 'approved', pending: 'pending', in_process: 'pending', rejected: 'rejected',
    cancelled: 'cancelled', refunded: 'refunded', charged_back: 'chargeback',
  };
  const paymentStatus = statusMap[payment.status] || 'pending';
  const approved = payment.status === 'approved';
  const total = Number(payment.transaction_amount || 0);

  const { data: existingPayment } = await admin.from('payments')
    .select('id,status').eq('provider_payment_id', String(payment.id)).maybeSingle();
  const paymentRow = {
    order_id: orderId, provider: 'mercado_pago', provider_payment_id: String(payment.id),
    status: paymentStatus, amount: total, currency: payment.currency_id || 'BRL',
    payment_method: payment.payment_type_id || 'mercado_pago', provider_status: payment.status,
    provider_status_detail: payment.status_detail || null, paid_at: approved ? new Date().toISOString() : null,
  };
  if (existingPayment) await admin.from('payments').update(paymentRow).eq('id', existingPayment.id);
  else await admin.from('payments').insert({ id: crypto.randomUUID(), ...paymentRow });

  const newOrderStatus = approved ? 'paid' : paymentStatus === 'refunded' ? 'refunded' : paymentStatus === 'rejected' ? 'cancelled' : 'pending';
  const orderUpdate: Record<string, unknown> = { payment_status: paymentStatus, status: newOrderStatus };
  if (approved) orderUpdate.paid_at = new Date().toISOString();
  await admin.from('orders').update(orderUpdate).eq('id', orderId);

  // Idempotency: stock/commission are only applied when transitioning into approved.
  if (approved && order.payment_status !== 'approved') {
    const { data: items } = await admin.from('order_items').select('product_id,quantity').eq('order_id', orderId);
    for (const item of items || []) {
      const { data: product } = await admin.from('products').select('stock').eq('id', item.product_id).single();
      if (product) await admin.from('products').update({ stock: Math.max(0, Number(product.stock) - Number(item.quantity)) }).eq('id', item.product_id);
    }
    if (order.affiliate_code) {
      const { data: affiliate } = await admin.from('affiliates').select('id,total_sales,total_commission').eq('code', order.affiliate_code).maybeSingle();
      if (affiliate) {
        const { data: items } = await admin.from('order_items').select('gross_price,quantity,affiliate_commission').eq('order_id', orderId);
        let commission = 0;
        for (const item of items || []) {
          const savedCommission = Number(item.affiliate_commission || 0);
          commission += savedCommission > 0
            ? savedCommission
            : Number(item.gross_price || 0) * Number(item.quantity || 0) * 0.20;
        }
        await admin.from('affiliates').update({
          total_sales: Number(affiliate.total_sales || 0) + Number(order.total || 0),
          total_commission: Number(affiliate.total_commission || 0) + Math.round(commission * 100) / 100,
        }).eq('id', affiliate.id);
      }
    }
  }

  return json({ received: true });
});
