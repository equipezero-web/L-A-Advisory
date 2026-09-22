import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pagamentosRouter from './pagamentos.js';
import webhookRouter from './webhook.js';
import { enviarEmailNotificacao } from './email.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/pagamentos', pagamentosRouter);
app.use('/api/webhook', webhookRouter);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'L&A Advisory API' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
