import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import pagamentosRouter from "./routes/pagamentos.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/pagamentos", pagamentosRouter);

app.listen(process.env.PORT || 3000, () => {
  console.log("Backend iniciado.");
});
