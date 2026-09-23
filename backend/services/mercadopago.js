import {
  MercadoPagoConfig,
  Payment,
  Preference
} from "mercadopago";

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("MERCADOPAGO_ACCESS_TOKEN não foi definido.");
}

const client = new MercadoPagoConfig({
  accessToken
});

const preferenceClient = new Preference(client);
const paymentClient = new Payment(client);

export {
  client,
  preferenceClient,
  paymentClient
};
