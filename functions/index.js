const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// Segredo armazenado no Firebase Secret Manager.
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

// Projeto Firebase
const FIREBASE_PROJECT_ID = "advisory-web";

// URL pública da Cloud Function do webhook.
// O Firebase Functions usa us-central1 por padrão quando nenhuma região é definida.
const WEBHOOK_URL =
  `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/mercadopagoWebhook`;


/**
 * Configuração básica de CORS.
 */
function cors(req, res) {
  const origin = req.headers.origin || "*";

  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}


/**
 * Cria uma preferência de pagamento no Mercado Pago.
 */
exports.createPayment = onRequest(
  {
    secrets: [MP_ACCESS_TOKEN],
    cors: true
  },
  async (req, res) => {
    cors(req, res);

    // Requisição CORS
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    // Somente POST
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Método não permitido."
      });
    }

    try {
      const order = req.body?.order;

      // Validação básica do pedido
      if (
        !order?.id ||
        !Array.isArray(order.items) ||
        order.items.length === 0
      ) {
        return res.status(400).json({
          error: "Pedido inválido."
        });
      }

      // Monta os produtos para o Mercado Pago
      const items = order.items.map((item) => ({
        id: String(item.id),
        title: String(item.name || "Produto").slice(0, 256),
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit_price: Math.max(0, Number(item.price) || 0),
        currency_id: "BRL"
      }));

      // E-mail do cliente, quando disponível
      const payer = {};

      if (order.customerEmail) {
        payer.email = String(order.customerEmail);
      }

      // Preferência do Mercado Pago
      const preference = {
        items,

        external_reference: String(order.id),

        notification_url: WEBHOOK_URL,

        back_urls: {
          success:
            `https://advisory-web.web.app/?payment=success&external_reference=${encodeURIComponent(
              order.id
            )}`,

          failure:
            `https://advisory-web.web.app/?payment=failure&external_reference=${encodeURIComponent(
              order.id
            )}`,

          pending:
            `https://advisory-web.web.app/?payment=pending&external_reference=${encodeURIComponent(
              order.id
            )}`
        },

        auto_return: "approved",

        metadata: {
          order_id: String(order.id)
        }
      };

      // Adiciona payer somente se houver e-mail
      if (Object.keys(payer).length > 0) {
        preference.payer = payer;
      }

      // Chamada para a API do Mercado Pago
      const response = await fetch(
        "https://api.mercadopago.com/checkout/preferences",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify(preference)
        }
      );

      const data = await response.json();

      // Mercado Pago recusou a criação
      if (!response.ok) {
        console.error(
          "Erro ao criar preferência no Mercado Pago:",
          data
        );

        return res.status(502).json({
          error:
            "O Mercado Pago recusou a criação do pagamento.",
          details: data
        });
      }

      // Retorna os dados necessários para o frontend
      return res.status(200).json({
        success: true,
        preference_id: data.id,
        init_point:
          data.init_point || data.sandbox_init_point || null
      });
    } catch (error) {
      console.error(
        "Erro interno ao criar pagamento:",
        error
      );

      return res.status(500).json({
        error: "Erro interno ao criar pagamento."
      });
    }
  }
);


/**
 * Webhook do Mercado Pago.
 *
 * O Mercado Pago chama esta função quando houver
 * atualização relacionada a um pagamento.
 */
exports.mercadopagoWebhook = onRequest(
  {
    secrets: [MP_ACCESS_TOKEN],
    cors: true
  },
  async (req, res) => {
    cors(req, res);

    try {
      /*
       * O Mercado Pago pode enviar os dados
       * pelo body ou pela query string.
       */

      const type =
        req.body?.type ||
        req.query?.type ||
        null;

      const paymentId =
        req.body?.data?.id ||
        req.query?.["data.id"] ||
        req.query?.id ||
        null;

      /*
       * Responde imediatamente para notificações
       * que não são de pagamento.
       */
      if (type !== "payment" || !paymentId) {
        return res.status(200).send("ignored");
      }

      // Consulta o pagamento diretamente na API do Mercado Pago
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
          paymentId
        )}`,
        {
          method: "GET",

          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}`
          }
        }
      );

      const payment = await response.json();

      if (!response.ok) {
        console.error(
          "Erro ao consultar pagamento no Mercado Pago:",
          payment
        );

        // Recebemos o webhook, mas não conseguimos consultar agora.
        return res.status(200).send("received");
      }

      /*
       * Recupera o ID do pedido criado no seu sistema.
       */
      const orderId =
        payment.external_reference ||
        payment.metadata?.order_id ||
        null;

      if (!orderId) {
        console.warn(
          "Pagamento recebido sem external_reference/order_id:",
          payment.id
        );

        return res.status(200).send("received");
      }

      /*
       * Seu sistema atualmente guarda o estado
       * no documento app_state/main.
       */
      const stateRef = db
        .collection("app_state")
        .doc("main");

      const stateSnapshot = await stateRef.get();

      if (!stateSnapshot.exists) {
        console.warn(
          "Documento app_state/main não encontrado."
        );

        return res.status(200).send("received");
      }

      const state = stateSnapshot.data() || {};

      const orders = Array.isArray(state.orders)
        ? [...state.orders]
        : [];

      /*
       * Localiza o pedido pelo ID.
       */
      const orderIndex = orders.findIndex(
        (order) => String(order.id) === String(orderId)
      );

      if (orderIndex === -1) {
        console.warn(
          `Pedido ${orderId} não encontrado no Firebase.`
        );

        return res.status(200).send("received");
      }

      /*
       * Conversão dos status do Mercado Pago
       * para os status utilizados pelo seu sistema.
       */
      const statusMap = {
        approved: "paid",
        pending: "pending",
        in_process: "pending",
        rejected: "rejected",
        cancelled: "canceled",
        refunded: "refunded",
        charged_back: "refunded"
      };

      const nextStatus =
        statusMap[payment.status] || "pending";

      const currentOrder = orders[orderIndex];

      /*
       * Atualiza as informações do pagamento.
       */
      orders[orderIndex] = {
        ...currentOrder,

        status: nextStatus,

        paymentStatus:
          payment.status || null,

        paymentId:
          payment.id != null
            ? String(payment.id)
            : null,

        paymentMethod:
          payment.payment_method_id ||
          "mercado_pago",

        paymentType:
          payment.payment_type_id ||
          null,

        paymentUpdatedAt:
          new Date().toISOString(),

        paidAt:
          payment.status === "approved"
            ? (
                currentOrder.paidAt ||
                new Date().toISOString()
              )
            : (
                currentOrder.paidAt ||
                null
              )
      };

      /*
       * Salva o pedido atualizado no Firestore.
       */
      await stateRef.set(
        {
          orders,
          updatedAt: new Date().toISOString()
        },
        {
          merge: true
        }
      );

      console.log(
        `Pedido ${orderId} atualizado para ${nextStatus}.`
      );

      return res.status(200).send("ok");
    } catch (error) {
      console.error(
        "Erro no webhook do Mercado Pago:",
        error
      );

      /*
       * O webhook deve receber uma resposta HTTP.
       */
      return res.status(500).send("error");
    }
  }
);
