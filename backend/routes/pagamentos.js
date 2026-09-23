import express from "express";
import crypto from "crypto";

import { db } from "../services/firebaseAdmin.js";
import { preferenceClient } from "../services/mercadoPago.js";

const router = express.Router();

function validarTexto(valor, limite = 120) {
  return typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.trim().length <= limite;
}

router.post("/criar-preferencia", async (req, res) => {
  try {
    const {
      productId,
      affiliateCode = null,
      buyer = {}
    } = req.body;

    if (!validarTexto(productId)) {
      return res.status(400).json({
        erro: "Produto inválido."
      });
    }

    const produtoRef = db.collection("catalogo").doc("products")
      .collection("items").doc(productId);

    const produtoSnapshot = await produtoRef.get();

    if (!produtoSnapshot.exists) {
      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    const produto = produtoSnapshot.data();

    if (
      produto.ativo !== true ||
      typeof produto.price !== "number" ||
      produto.price <= 0
    ) {
      return res.status(400).json({
        erro: "Este produto não está disponível para compra."
      });
    }

    let affiliateId = null;
    let affiliateData = null;

    if (validarTexto(affiliateCode, 80)) {
      const afiliadoConsulta = await db
        .collection("affiliates")
        .where("codigoAfiliado", "==", affiliateCode.trim().toUpperCase())
        .where("status", "==", "approved")
        .limit(1)
        .get();

      if (!afiliadoConsulta.empty) {
        const documentoAfiliado = afiliadoConsulta.docs[0];

        affiliateId = documentoAfiliado.id;
        affiliateData = documentoAfiliado.data();
      }
    }

    const orderId = crypto.randomUUID();

    const pedido = {
      orderId,
      status: "pending",
      criadoEm: new Date(),
      atualizadoEm: new Date(),

      productId,
      productName: produto.name || produto.nome || "Produto",
      productType: produto.tipo || "produto",
      unitPrice: produto.price,
      currency: "BRL",

      buyer: {
        nome: validarTexto(buyer.nome, 120) ? buyer.nome.trim() : null,
        email: validarTexto(buyer.email, 160)
          ? buyer.email.trim().toLowerCase()
          : null
      },

      affiliateId,
      affiliateCode: affiliateData?.codigoAfiliado || null,

      commissionEligible: Boolean(
        affiliateId &&
        produto.affiliateEnabled === true &&
        typeof produto.commissionRate === "number" &&
        produto.commissionRate > 0
      ),

      commissionRate: affiliateId && produto.affiliateEnabled === true
        ? produto.commissionRate
        : 0
    };

    await db.collection("orders").doc(orderId).set(pedido);

    const frontendUrl = process.env.FRONTEND_URL;

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: productId,
            title: pedido.productName,
            quantity: 1,
            unit_price: produto.price,
            currency_id: "BRL"
          }
        ],
        external_reference: orderId,
        payer: pedido.buyer.email
          ? { email: pedido.buyer.email }
          : undefined,
        back_urls: {
          success: `${frontendUrl}/checkout.html?status=success`,
          failure: `${frontendUrl}/checkout.html?status=failure`,
          pending: `${frontendUrl}/checkout.html?status=pending`
        },
        auto_return: "approved",
        notification_url: `${process.env.API_URL}/api/webhook/mercadopago`,
        metadata: {
          orderId,
          productId,
          affiliateCode: pedido.affiliateCode || ""
        }
      }
    });

    await db.collection("orders").doc(orderId).update({
      mercadoPagoPreferenceId: preference.id,
      atualizadoEm: new Date()
    });

    return res.status(201).json({
      orderId,
      preferenceId: preference.id,
      checkoutUrl: preference.init_point,
      sandboxCheckoutUrl: preference.sandbox_init_point || null
    });
  } catch (erro) {
    console.error("Erro ao criar preferência:", erro);

    return res.status(500).json({
      erro: "Não foi possível iniciar o pagamento."
    });
  }
});

export default router;
