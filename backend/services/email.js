import nodemailer from "nodemailer";

const emailConfigurado = Boolean(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASSWORD
);

const transporter = emailConfigurado
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    })
  : null;

async function enviarEmailNotificacao({
  para,
  assunto,
  texto,
  html
}) {
  if (!transporter || !para) {
    return { enviado: false, motivo: "E-mail não configurado ou destinatário ausente." };
  }

  const resultado = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: para,
    subject: assunto,
    text: texto,
    html
  });

  return {
    enviado: true,
    messageId: resultado.messageId
  };
}

export {
  enviarEmailNotificacao
};
