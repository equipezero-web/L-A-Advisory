import express from "express";
import crypto from "crypto";

import { db } from "../services/firebaseAdmin.js";
import { paymentClient } from "../services/mercadoPago.js";
import { enviarEmailNotificacao } from "../services/email.js";

const router = express.Router();

function extrairAssinatura(xSignature = "") {
  const partes = xSignature.split(",");

  const dados = {};

  for (const parte of partes) {
    const [chave, valor] = parte.trim().split("=");

    if (chave && valor) {
      dados[chave] = valor;
    }
  }

  return dados;
}

function validarAssinaturaMercadoPago(req) {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!segredo) {
    throw new Error("MERCADOPAGO_WEBHOOK_SECRET não foi definido.");
  }

  const xSignature = req.headers["x-signature"];
  const xRequestId = req.headers["x-request-id"];
  const dataId = req.query["data.id"];

  if (!xSignature || !xRequestId || !dataId) {
    return false;
  }

  const { ts, v1 } = extrairAssinatura(xSignature);

  if (!ts || !v1) {
    return false;
  }

  const manifest = [
    `id:${String(dataId).toLowerCase()}`,
    `request-id:${xRequestId}`,
    `ts:${ts};`
  ].join(";");

  const assinaturaCalculada = crypto
    .createHmac("sha256", segredo)
    .update(manifest)
    .digest("hex");

  const assinaturaRecebida = Buffer.from(v1, "utf8");
  const assinaturaEsperada = Buffer.from(assinaturaCalculada, "utf8");

  if (assinaturaRecebida.length !== assinaturaEsperada.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    assinaturaRecebida,
    assinaturaEsperada
  );
}

router.post("/mercadopago", async (req, res) => {
  try {
    const assinaturaValida = validarAssinaturaMercadoPago(req);

    if (!assinaturaValida) {
      return res.status(401).json({
        erro: "Assinatura do webhook inválida."
      });
    }

    const tipo = req.body?.type || req.query?.type;
    const paymentId = req.body?.data?.id || req.query?.["data.id"];

    if (tipo !== "payment" || !paymentId) {
      return res.sendStatus(200);
    }

    const pagamento = await paymentClient.get({
      id: paymentId
    });

    if (pagamento.status !== "approved") {
      return res.sendStatus(200);
    }

    const orderId = pagamento.external_reference;

    if (!orderId) {
      return res.sendStatus(200);
    }

    const pedidoRef = db.collection("orders").doc(orderId);

    await db.runTransaction(async (transaction) => {
      const pedidoSnapshot = await transaction.get(pedidoRef);

      if (!pedidoSnapshot.exists) {
        throw new Error("Pedido não encontrado.");
      }

      const pedido = pedidoSnapshot.data();

      if (pedido.status === "approved") {
        return;
      }

      const valorRecebido = Number(pagamento.transaction_amount);

      if (valorRecebido !== Number(pedido.unitPrice)) {
        throw new Error("Valor do pagamento não corresponde ao pedido.");
      }

      transaction.update(pedidoRef, {
        status: "approved",
        mercadoPagoPaymentId: String(pagamento.id),
        paymentMethod: pagamento.payment_method_id || null,
        paymentType: pagamento.payment_type_id || null,
        pagoEm: new Date(),
        atualizadoEm: new Date()
      });

      const deveCriarComissao =
        pedido.commissionEligible === true &&
        pedido.affiliateId &&
        Number(pedido.commissionRate) > 0;

      if (!deveCriarComissao) {
        return;
      }

      const commissionId = `payment_${pagamento.id}`;
      const comissaoRef = db.collection("commissions").doc(commissionId);

      const comissaoSnapshot = await transaction.get(comissaoRef);

      if (comissaoSnapshot.exists) {
        return;
      }

      const valorComissao = Number(
        (pedido.unitPrice * pedido.commissionRate).toFixed(2)
      );

      transaction.set(comissaoRef, {
        commissionId,
        orderId,
        paymentId: String(pagamento.id),
        affiliateId: pedido.affiliateId,
        affiliateCode: pedido.affiliateCode,
        productId: pedido.productId,
        productName: pedido.productName,
        orderValue: pedido.unitPrice,
        commissionRate: pedido.commissionRate,
        commissionValue: valorComissao,
        status: "pending",
        criadoEm: new Date()
      });
    });

    const pedidoAtualizado = await pedidoRef.get();
    const pedido = pedidoAtualizado.data();

    if (pedido?.buyer?.email) {
      await enviarEmailNotificacao({
        para: pedido.buyer.email,
        assunto: "Pagamento aprovado — L&A Royal Advisory",
        texto: `Seu pagamento foi aprovado. Pedido: ${orderId}.`,
        html: `
          <h1>Pagamento aprovado</h1>
          <p>Olá${pedido.buyer.nome ? `, ${pedido.buyer.nome}` : ""}.</p>
          <p>Recebemos a confirmação do seu pagamento.</p>
          <p><strong>Pedido:</strong> ${orderId}</p>
          <p><strong>Produto:</strong> ${pedido.productName}</p>
        `
      });
    }

    return res.sendStatus(200);
  } catch (erro) {
    console.error("Erro no webhook Mercado Pago:", erro);

    return res.status(500).json({
      erro: "Não foi possível processar a notificação."
    });
  }
});

export default router;
