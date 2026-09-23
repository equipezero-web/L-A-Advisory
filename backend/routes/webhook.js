import express from 'express';
import crypto from 'crypto';
import mercadopago from 'mercadopago';
import { enviarEmailNotificacao } from '../utils/email.js';

const router = express.Router();

const mp = new mercadopago.MercadoPago(process.env.MP_ACCESS_TOKEN, {
  timeout: 5000
});

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

function verifySignature(headers, rawBody) {
  const sigHeader = headers['x-signature'];
  if (!sigHeader || !WEBHOOK_SECRET) return false;

  // formato: ts=..., v1=...
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => {
      const [k, v] = p.split('=');
      return [k.trim(), v.trim()];
    })
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `${ts}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(v1, 'hex')
    );
  } catch {
    return false;
  }
}

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body;

    if (!verifySignature(req.headers, rawBody)) {
      return res.status(401).send('Assinatura inválida');
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('JSON inválido');
    }

    const paymentId = event.data?.id;
    if (!paymentId) {
      return res.status(400).send('ID do pagamento não encontrado');
    }

    try {
      const paymentResp = await mp.payment.findById(paymentId);
      const payment = paymentResp.body;

      const status = payment.status; // approved, pending, rejected...
      const externalRef = payment.external_reference; // PEDIDO_...

      // Aqui você poderia salvar em banco de dados, se quiser
      // await salvarPedidoNoBanco(externalRef, payment);

      await enviarEmailNotificacao(externalRef, payment);

      res.status(200).send('OK');
    } catch (err) {
      console.error('Erro ao processar webhook:', err);
      res.status(500).send('Erro ao processar webhook');
    }
  }
);

export default router;
