import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import pagamentosRouter from "./routes/pagamentos.js";
import webhookRouter from "./routes/webhook.js";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);

const originsPermitidas = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || originsPermitidas.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origem não autorizada pelo CORS."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({
  limit: "1mb"
}));

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "L&A Royal Advisory API"
  });
});

app.use("/api/pagamentos", pagamentosRouter);
app.use("/api/webhook", webhookRouter);

app.use((req, res) => {
  res.status(404).json({
    erro: "Rota não encontrada."
  });
});

app.use((erro, req, res, next) => {
  console.error(erro);

  res.status(500).json({
    erro: "Erro interno no servidor."
  });
});

app.listen(PORT, () => {
  console.log(`API iniciada na porta ${PORT}`);
});
