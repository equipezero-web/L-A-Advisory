import { enviarEmailNotificacao } from './email.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export async function enviarEmailNotificacao(externalRef, payment) {
  const cliente = payment.payer;
  const itens = payment.additional_info?.items || [];
  const total = payment.transaction_details?.total_paid_amount || 0;

  const assunto = `🛒 Nova venda — L&A Advisory | ${externalRef}`;

  const corpo = `
<strong>Nova venda — L&A Advisory</strong><br><br>
<strong>Pedido:</strong> ${externalRef}<br>
<strong>Status:</strong> ${payment.status}<br>
<strong>Forma de pagamento:</strong> ${payment.payment_method_id || 'N/A'}<br>
<strong>Valor total:</strong> R$ ${Number(total).toFixed(2)}<br>
<strong>Data:</strong> ${new Date(payment.date_approved || payment.date_created).toLocaleString('pt-BR')}<br><br>
<strong>Cliente:</strong> ${cliente?.name || 'N/A'}<br>
<strong>E-mail:</strong> ${cliente?.email || 'N/A'}<br>
<strong>CPF:</strong> ${payment.payer?.identification?.number || 'N/A'}<br><br>
<strong>Itens:</strong><br>
${itens.map(i => `- ${i.title} (x${i.quantity}) — R$ ${Number(i.unit_price).toFixed(2)}`).join('<br>')}
`.trim();

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: assunto,
    html: corpo
  };

  await transporter.sendMail(mailOptions);
}
