import express from 'express';
import mercadopago from 'mercadopago';

const router = express.Router();

const mp = new mercadopago.MercadoPago(process.env.MP_ACCESS_TOKEN, {
  timeout: 5000
});

router.post('/criar-pagamento', async (req, res) => {
  try {
    const { itens, cliente, formaPagamento } = req.body;

    if (!itens || !cliente || !formaPagamento) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const preference = {
      items: itens.map(i => ({
        title: i.nome,
        unit_price: Number(i.preco),
        quantity: i.quantidade || 1,
        currency_id: 'BRL'
      })),
      payer: {
        name: cliente.nome,
        email: cliente.email,
        identification: {
          type: 'CPF',
          number: cliente.cpf
        },
        phone: {
          area_code: cliente.ddd,
          number: cliente.telefone
        }
      },
      notification_url: `${process.env.BASE_URL}/api/webhook`,
      external_reference: `PEDIDO_${Date.now()}`,
      payment_methods: {
        excluded_payment_types: formaPagamento === 'pix' ? [{ id: 'credit_card' }] : []
      },
      back_urls: {
        success: `${process.env.BASE_URL}/sucesso.html`,
        failure: `${process.env.BASE_URL}/falha.html`,
        pending: `${process.env.BASE_URL}/pendente.html`
      },
      auto_return: formaPagamento === 'cartao' ? 'approved' : undefined
    };

    const result = await mp.preferences.create(preference);

    res.json({
      preferenceId: result.body.id,
      initPoint: result.body.init_point,
      external_reference: preference.external_reference,
      pix: result.body.point_of_interaction?.transaction_details?.qr_code_base64
        ? {
            qrCodeBase64: result.body.point_of_interaction.transaction_details.qr_code_base64,
            qrCode: result.body.point_of_interaction.transaction_details.qr_code
          }
        : undefined
    });
  } catch (err) {
    console.error('Erro ao criar pagamento:', err);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

export default router;
