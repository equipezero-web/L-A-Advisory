import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://equipezero-web.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SITE_URL =
  Deno.env.get("SITE_URL") ||
  "https://equipezero-web.github.io/L-A-Advisory";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders },
    );
  }

  const MP_TEST_ACCESS_TOKEN = (Deno.env.get("MP_TEST_ACCESS_TOKEN") || "").trim();

  if (!MP_TEST_ACCESS_TOKEN) {
    return new Response(
      JSON.stringify({
        error: "MP_TEST_ACCESS_TOKEN não configurado no Supabase.",
      }),
      { status: 500, headers: corsHeaders },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const payerEmail = String(body?.payer_email || "").trim();

    if (!payerEmail || !/^([^\s@]+)@([^\s@]+)\.[^\s@]+$/.test(payerEmail)) {
      return new Response(
        JSON.stringify({
          error: "Informe o e-mail da conta de comprador de teste do Mercado Pago.",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const idempotencyKey = crypto.randomUUID();
    const externalReference = `MPTEST-${Date.now()}`;
    const amount = "10.00";

    const order = {
      type: "online",
      processing_mode: "manual",
      total_amount: amount,
      external_reference: externalReference,
      description: "Teste de integração Checkout Pro - L&A Royal Advisory",
      payer: {
        email: payerEmail,
      },
      items: [
        {
          title: "Produto de teste Checkout Pro",
          quantity: 1,
          unit_price: amount,
          unit_measure: "unit",
          total_amount: amount,
        },
      ],
      capture_mode: "automatic",
      config: {
        online: {
          success_url: `${SITE_URL}/?mp_test=success`,
          failure_url: `${SITE_URL}/?mp_test=failure`,
          pending_url: `${SITE_URL}/?mp_test=pending`,
          auto_return: "approved",
        },
      },
    };

    const requestHeaders = new Headers();
    requestHeaders.set("Accept", "application/json");
    requestHeaders.set("Content-Type", "application/json");
    requestHeaders.set("Authorization", "Bearer " + MP_TEST_ACCESS_TOKEN);
    requestHeaders.set("X-Idempotency-Key", idempotencyKey);

    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(order),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Mercado Pago test order error:", response.status, data);
      return new Response(
        JSON.stringify({
          error: "Mercado Pago recusou a criação da order de teste.",
          status: response.status,
          details: data,
        }),
        { status: response.status, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: data.id,
        checkoutUrl: data.checkout_url,
        status: data.status,
        externalReference: data.external_reference,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("create-test-checkout error:", error);
    return new Response(
      JSON.stringify({
        error: "Erro interno ao criar a order de teste.",
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});
