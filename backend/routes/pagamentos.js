import express from "express";
import { MercadoPagoConfig, Preference } from "mercadopago";

const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.APP_USR-6882404397259889-092216-405146a05bc990dcc32461497f4f06fc-3706125345,
  options: {
    timeout: 5000
  }
});

const preferenceClient = new Preference(client);

router.post("/criar-pagamento", async (req, res) => {
  try {
    const { itens, cliente, formaPagamento, codigoAfiliado } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({
        error: "O carrinho está vazio."
      });
    }

    if (!cliente?.nome || !cliente?.email || !cliente?.cpf) {
      return res.status(400).json({
        error: "Dados do cliente incompletos."
      });
    }

    if (!formaPagamento) {
      return res.status(400).json({
        error: "Selecione uma forma de pagamento."
      });
    }

    const externalReference = `PEDIDO_${Date.now()}`;

    const preferenceData = {
      items: itens.map((item) => ({
        id: String(item.id),
        title: item.nome,
        quantity: Number(item.quantidade) || 1,
        unit_price: Number(item.preco),
        currency_id: "BRL"
      })),

      payer: {
        name: cliente.nome,
        email: cliente.email,
        identification: {
          type: "CPF",
          number: String(cliente.cpf).replace(/\D/g, "")
        },
        phone: {
          area_code: String(cliente.ddd || "").replace(/\D/g, ""),
          number: String(cliente.telefone || "").replace(/\D/g, "")
        }
      },

      external_reference: externalReference,

      notification_url: `${process.env.BASE_URL}/api/webhook`,

      back_urls: {
        success: `${process.env.BASE_URL}/sucesso.html`,
        failure: `${process.env.BASE_URL}/falha.html`,
        pending: `${process.env.BASE_URL}/pendente.html`
      },

      auto_return: "approved",

      metadata: {
        codigoAfiliado: codigoAfiliado || null
      }
    };

    const resultado = await preferenceClient.create({
      body: preferenceData
    });

    return res.status(201).json({
      preferenceId: resultado.id,
      initPoint: resultado.init_point,
      sandboxInitPoint: resultado.sandbox_init_point,
      externalReference
    });

  } catch (erro) {
    console.error("Erro ao criar pagamento:", erro);

    return res.status(500).json({
      error: "Não foi possível criar o pagamento.",
      detalhes: erro.message
    });
  }
});

export default router;
