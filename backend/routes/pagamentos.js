import express from "express";
import { MercadoPagoConfig, Preference } from "mercadopago";

const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: {
    timeout: 5000
  }
});

const preferenceClient = new Preference(client);
