import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://equipezero-web.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

const URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEYS = JSON.parse(
  Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'
);
const SERVICE =
  SUPABASE_SECRET_KEYS['default'] ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  '';
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') || '';

async function validateMercadoPagoSignature(req: Request): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) {
    console.error('MP_WEBHOOK_SECRET não configurado.');
    return false;
  }

  const xSignature = req.headers.get('x-signature') || '';
  const xRequestId = req.headers.get('x-request-id') || '';
  const url = new URL(req.url);
  const dataId = (url.searchParams.get('data.id') || '').toLowerCase();

  let ts = '';
  let v1 = '';

  for (const part of xSignature.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }

  if (!ts || !v1) {
    console.error('Assinatura do Webhook Mercado Pago ausente ou incompleta.');
    return false;
  }

  const manifestParts: string[] = [];
  if (dataId) manifestParts.push('id:' + dataId);
  if (xRequestId) manifestParts.push('request-id:' + xRequestId);
  manifestParts.push('ts:' + ts);
  const manifest = manifestParts.join(';') + ';';

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const computed = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  if (computed.length !== v1.length) return false;

  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);

  const signatureValid = await validateMercadoPagoSignature(req);
  if (!signatureValid) {
    return json({ error: 'Assinatura do Webhook inválida.' }, 401);
  }

  const payload = await req.json().catch(() => ({}));

  // Orders API: Mercado Pago envia type=order e data.id com o ID da Order.
  // A documentação recomenda consultar /v1/orders/{id} para obter os dados completos.
  const notificationType = String(
    payload?.type || payload?.topic || ''
  ).toLowerCase();

  if (notificationType === 'order' || notificationType === 'orders') {
    const orderId = String(
      payload?.data?.id ||
      payload?.id ||
      ''
    ).trim();

    if (!orderId) {
      return json({ received: true });
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
    });
    const mpOrder = await mpResponse.json().catch(() => ({}));

    if (!mpResponse.ok || !mpOrder?.id) {
      console.error('Não foi possível consultar a Order do Mercado Pago:', {
        status: mpResponse.status,
        order_id: orderId,
      });
      return json({ received: true });
    }

    console.log('Webhook Order recebido:', {
      order_id: mpOrder.id,
      status: mpOrder.status || null,
      status_detail: mpOrder.status_detail || null,
      external_reference: mpOrder.external_reference || null,
    });

    // A Order pode conter os pagamentos dentro de transactions.payments.
    // Mantemos o processamento legado abaixo para notificações payment.
    const orderExternalReference = String(
      mpOrder.external_reference || ''
    ).trim();

    if (orderExternalReference) {
      const admin = createClient(URL, SERVICE);
      const { data: order } = await admin
        .from('orders')
        .select('*')
        .eq('id', orderExternalReference)
        .maybeSingle();

      if (order) {
        const payments = Array.isArray(mpOrder?.transactions?.payments)
          ? mpOrder.transactions.payments
          : [];

        const payment = payments[0];

        const statusMap: Record<string, string> = {
          processed: 'approved',
          approved: 'approved',
          pending: 'pending',
          in_process: 'pending',
          action_required: 'pending',
          rejected: 'rejected',
          cancelled: 'cancelled',
          refunded: 'refunded',
          charged_back: 'chargeback',
        };

        const orderPaymentStatus =
          statusMap[String(mpOrder.status || '').toLowerCase()] ||
          statusMap[String(payment?.status || '').toLowerCase()] ||
          'pending';

        const approved =
          orderPaymentStatus === 'approved';

        const paymentId = String(
          payment?.id || ''
        ).trim();

        if (paymentId) {
          const amount = Number(
            payment?.amount ||
            payment?.paid_amount ||
            mpOrder.total_paid_amount ||
            mpOrder.total_amount ||
            0
          );

          const { data: existingPayment } = await admin
            .from('payments')
            .select('id,status')
            .eq('provider_payment_id', paymentId)
            .maybeSingle();

          const paymentRow = {
            order_id: orderExternalReference,
            provider: 'mercado_pago',
            provider_payment_id: paymentId,
            status: orderPaymentStatus,
            amount,
            currency: mpOrder.currency_id || 'BRL',
            payment_method:
              payment?.payment_method?.type ||
              payment?.payment_method?.id ||
              'mercado_pago',
            provider_status:
              payment?.status ||
              mpOrder.status ||
              null,
            provider_status_detail:
              payment?.status_detail ||
              mpOrder.status_detail ||
              null,
            paid_at:
              approved
                ? new Date().toISOString()
                : null,
          };

          if (existingPayment) {
            await admin
              .from('payments')
              .update(paymentRow)
              .eq('id', existingPayment.id);
          } else {
            await admin
              .from('payments')
              .insert({
                id: crypto.randomUUID(),
                ...paymentRow,
              });
          }
        }

        const newOrderStatus =
          approved
            ? 'paid'
            : orderPaymentStatus === 'refunded'
              ? 'refunded'
              : orderPaymentStatus === 'rejected' ||
                orderPaymentStatus === 'cancelled'
                ? 'cancelled'
                : 'pending';

        const orderUpdate: Record<string, unknown> = {
          payment_status: orderPaymentStatus,
          status: newOrderStatus,
        };

        if (approved) {
          orderUpdate.paid_at =
            new Date().toISOString();
        }

        const wasAlreadyApproved = order.payment_status === 'approved';

        await admin
          .from('orders')
          .update(orderUpdate)
          .eq('id', orderExternalReference);

        // Orders API: aplicar estoque e comissão somente na primeira transição para aprovado.
        // Isso torna o processamento idempotente contra notificações duplicadas.
        if (approved && !wasAlreadyApproved) {
          const { data: items } = await admin
            .from('order_items')
            .select('product_id,quantity')
            .eq('order_id', orderExternalReference);

          for (const item of items || []) {
            const { data: product } = await admin
              .from('products')
              .select('stock')
              .eq('id', item.product_id)
              .single();

            if (product) {
              await admin
                .from('products')
                .update({
                  stock: Math.max(0, Number(product.stock) - Number(item.quantity)),
                })
                .eq('id', item.product_id);
            }
          }

          if (order.affiliate_code) {
            const { data: affiliate } = await admin
              .from('affiliates')
              .select('id,total_sales,total_commission')
              .eq('code', order.affiliate_code)
              .maybeSingle();

            if (affiliate) {
              const { data: commissionItems } = await admin
                .from('order_items')
                .select('gross_price,quantity,affiliate_commission')
                .eq('order_id', orderExternalReference);

              let commission = 0;
              for (const item of commissionItems || []) {
                const savedCommission = Number(item.affiliate_commission || 0);
                commission += savedCommission > 0
                  ? savedCommission
                  : Number(item.gross_price || 0) * Number(item.quantity || 0) * 0.20;
              }

              await admin
                .from('affiliates')
                .update({
                  total_sales: Number(affiliate.total_sales || 0) + Number(order.total || 0),
                  total_commission:
                    Number(affiliate.total_commission || 0) +
                    Math.round(commission * 100) / 100,
                })
                .eq('id', affiliate.id);
            }
          }
        }
      }
    }

    return json({ received: true });
  }
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
