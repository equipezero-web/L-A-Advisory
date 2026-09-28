const ALLOWED_ORIGINS = [
  "https://l-a-advisory.lucaalves17-20.workers.dev",
  "https://equipezero-web.github.io"
];

function getCorsOrigin(request) {
  const origin = request.headers.get("Origin") || "";

  if (ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  return ALLOWED_ORIGINS[0];
}

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * CORS
     */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    /*
     * TESTE PRINCIPAL
     */
    if (url.pathname === "/" && request.method === "GET") {
      return json(request, {
        ok: true,
        service: "L&A Royal Advisory API",
        status: "online"
      });
    }

    /*
     * TESTE DO SECRET DO MERCADO PAGO
     */
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json(request, {
        ok: true,
        mercadoPagoConfigured: Boolean(env.MP_ACCESS_TOKEN),
        service: "L&A Royal Advisory API"
      });
    }

    /*
     * CRIAR PAGAMENTO
     *
     * POST /api/create-payment
     */
    if (
      url.pathname === "/api/create-payment" &&
      request.method === "POST"
    ) {
      try {
        if (!env.MP_ACCESS_TOKEN) {
          return json(
            request,
            {
              ok: false,
              error: "MP_ACCESS_TOKEN não configurado."
            },
            500
          );
        }

        const body = await request.json();

        if (
          !body.items ||
          !Array.isArray(body.items) ||
          body.items.length === 0
        ) {
          return json(
            request,
            {
              ok: false,
              error: "Nenhum produto foi enviado."
            },
            400
          );
        }

        const items = body.items.map((item) => {
          const quantity = Number(item.quantity || 1);
          const unitPrice = Number(item.unit_price || 0);

          if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(unitPrice) ||
            unitPrice <= 0
          ) {
            throw new Error(
              "Produto com quantidade ou preço inválido."
            );
          }

          return {
            id: String(item.id || ""),
            title: String(item.title || "Produto"),
            description: String(item.description || ""),
            quantity,
            unit_price: unitPrice,
            currency_id: "BRL"
          };
        });

        const externalReference = String(
          body.external_reference || `LA-${Date.now()}`
        );

        const preference = {
          items,

          external_reference: externalReference,

          payer: body.payer?.email
            ? {
                email: String(body.payer.email)
              }
            : undefined,

          back_urls: {
            success:
              body.back_urls?.success ||
              `${url.origin}/?payment=success`,

            failure:
              body.back_urls?.failure ||
              `${url.origin}/?payment=failure`,

            pending:
              body.back_urls?.pending ||
              `${url.origin}/?payment=pending`
          },

          auto_return: "approved"
        };

        const mercadoPagoResponse = await fetch(
          "https://api.mercadopago.com/checkout/preferences",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`
            },

            body: JSON.stringify(preference)
          }
        );

        const mercadoPagoData =
          await mercadoPagoResponse.json();

        if (!mercadoPagoResponse.ok) {
          return json(
            request,
            {
              ok: false,
              error:
                "Mercado Pago recusou a preferência.",
              details: mercadoPagoData
            },
            mercadoPagoResponse.status
          );
        }

        return json(request, {
          ok: true,
          preferenceId: mercadoPagoData.id,
          initPoint: mercadoPagoData.init_point,
          sandboxInitPoint:
            mercadoPagoData.sandbox_init_point || null,
          externalReference
        });

      } catch (error) {
        return json(
          request,
          {
            ok: false,
            error: error.message || "Erro interno."
          },
          500
        );
      }
    }

    /*
     * WEBHOOK DO MERCADO PAGO
     *
     * POST /api/webhook
     */
    if (
      url.pathname === "/api/webhook" &&
      request.method === "POST"
    ) {
      try {
        let payload = {};

        try {
          payload = await request.json();
        } catch {
          payload = {};
        }

        const paymentId =
          payload?.data?.id ||
          payload?.id ||
          null;

        if (!paymentId) {
          return json(request, {
            ok: true,
            received: true,
            paymentId: null
          });
        }

        /*
         * Consulta o pagamento diretamente no Mercado Pago.
         */
        const paymentResponse = await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
            paymentId
          )}`,
          {
            method: "GET",

            headers: {
              "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`
            }
          }
        );

        const payment = await paymentResponse.json();

        if (!paymentResponse.ok) {
          return json(
            request,
            {
              ok: false,
              error:
                "Não foi possível consultar o pagamento.",
              details: payment
            },
            502
          );
        }

        /*
         * Por enquanto registramos o pagamento
         * nos logs do Worker.
         *
         * Na próxima etapa vamos conectar
         * esta parte diretamente ao Firebase.
         */
        console.log(
          JSON.stringify({
            event: "mercado_pago_payment",
            paymentId: payment.id,
            status: payment.status,
            statusDetail: payment.status_detail,
            externalReference:
              payment.external_reference,
            transactionAmount:
              payment.transaction_amount
          })
        );

        return json(request, {
          ok: true,
          received: true,
          paymentId: payment.id,
          status: payment.status
        });

      } catch (error) {
        console.error(error);

        return json(
          request,
          {
            ok: false,
            error:
              error.message || "Erro no webhook."
          },
          500
        );
      }
    }

    /*
     * ROTAS /api NÃO ENCONTRADAS
     */
    if (url.pathname.startsWith("/api/")) {
      return json(
        request,
        {
          ok: false,
          error: "Endpoint não encontrado."
        },
        404
      );
    }

    /*
     * TODO O RESTANTE É O SEU SITE
     */
    return env.ASSETS.fetch(request);
  }
};
