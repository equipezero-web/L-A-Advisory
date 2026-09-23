import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function mascararCPF(cpf) {
  const numeros = String(cpf || "").replace(/\D/g, "");

  if (numeros.length !== 11) {
    return "Não informado";
  }

  return `***.***.${numeros.slice(6, 9)}-**`;
}

export async function enviarEmailNotificacao(externalRef, payment) {
  const cliente = payment.payer || {};

  const itens = payment.additional_info?.items || [];

  const total = payment.transaction_details?.total_paid_amount || 0;

  const dataPedido = payment.date_approved || payment.date_created;

  const assunto = `Nova venda — L&A Advisory | ${externalRef}`;

  const listaItens = itens.length
    ? itens.map((item) => {
        return `
          <li>
            ${item.title || "Produto"}
            — Quantidade: ${item.quantity || 1}
            — ${formatarMoeda(item.unit_price)}
          </li>
        `;
      }).join("")
    : "<li>Itens não informados pelo pagamento.</li>";

  const corpo = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
      <h2 style="color: #0c1933;">
        Nova venda — L&A Royal Advisory
      </h2>

      <hr>

      <p>
        <strong>Pedido:</strong> ${externalRef}<br>
        <strong>Status:</strong> ${payment.status || "Não informado"}<br>
        <strong>Forma de pagamento:</strong> ${payment.payment_method_id || "Não informado"}<br>
        <strong>Valor total:</strong> ${formatarMoeda(total)}<br>
        <strong>Data:</strong>
        ${dataPedido
          ? new Date(dataPedido).toLocaleString("pt-BR")
          : "Não informada"
        }
      </p>

      <h3 style="color: #0c1933;">Cliente</h3>

      <p>
        <strong>Nome:</strong> ${cliente.first_name || cliente.name || "Não informado"}<br>
        <strong>E-mail:</strong> ${cliente.email || "Não informado"}<br>
        <strong>CPF:</strong>
        ${mascararCPF(cliente.identification?.number)}
      </p>

      <h3 style="color: #0c1933;">Itens do pedido</h3>

      <ul>
        ${listaItens}
      </ul>
    </div>
  `.trim();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: assunto,
    html: corpo
  });
}
