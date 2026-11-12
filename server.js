const express = require("express");
const path = require("path");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

app.disable("x-powered-by");

// Limit excessive HTTP requests without trusting arbitrary forwarded IP headers.
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Muitas solicitações. Tente novamente em instantes."
}));

// Do not serve repository root or any server-side configuration files.
const options = { dotfiles: "deny", index: false, fallthrough: false };
app.use("/icons", express.static(path.join(ROOT, "icons"), options));
app.use("/js", express.static(path.join(ROOT, "js"), options));

const publicPages = Object.freeze({
  "/": "index.html",
  "/index.html": "index.html",
  "/privacidade.html": "privacidade.html",
  "/manifest.json": "manifest.json",
  "/sw.js": "sw.js",
  "/royal-ai-loader.js": "royal-ai-loader.js",
  "/affiliate-communication.js": "affiliate-communication.js"
});

for (const [url, file] of Object.entries(publicPages)) {
  app.get(url, (_req, res) => {
    res.sendFile(path.join(ROOT, file));
  });
}

app.use((_req, res) => res.sendStatus(404));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`L&A Royal Advisory online on port ${PORT}`);
});
