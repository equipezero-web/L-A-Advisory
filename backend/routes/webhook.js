import express from "express";

import {
  MercadoPagoConfig,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError
} from "mercadopago";

import { enviarEmailNotificacao } from "../services/email.js";

const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const paymentClient = new Payment(client);

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

router.post("/", async (req, res) => {
  try {
    const dataId =
      req.query["data.id"] ||
      req.body?.data?.id;

    if (!dataId) {
      return res.status(400).send("ID do pagamento não encontrado");
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: req.headers["x-signature"],
        xRequestId: req.headers["x-request-id"],
        dataId: String(dataId),
        secret: WEBHOOK_SECRET
      });
    } catch (erro) {
      if (erro instanceof InvalidWebhookSignatureError) {
        return res.status(401).send("Assinatura inválida");
      }

      console.error("Erro ao validar assinatura:", erro);
      return res.status(401).send("Não foi possível validar o webhook");
    }

    const payment = await paymentClient.get({
      id: String(dataId)
    });

    const externalRef = payment.external_reference || `MP_${payment.id}`;

    /*
      IMPORTANTE:
      Só envie o e-mail de venda quando o pagamento for aprovado.
      Webhooks também chegam para pending, rejected, cancelled e refunded.
    */
    if (payment.status === "approved") {
      await enviarEmailNotificacao(externalRef, payment);

      /*
        PRÓXIMA ETAPA:
        Aqui será salvo o pedido no Firebase.

        await salvarPedidoFirebase({
          paymentId: payment.id,
          externalReference: externalRef,
          statusPagamento: payment.status,
          valorPago: payment.transaction_amount,
          codigoAfiliado: payment.metadata?.codigoAfiliado || null
        });
      */
    }

    return res.status(200).send("OK");

  } catch (erro) {
    console.error("Erro ao processar webhook:", erro);

    return res.status(500).send("Erro ao processar webhook");
  }
});

export default router;
