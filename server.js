const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// Publish only explicitly approved website assets. Never expose .env, SQL,
// server files, Supabase functions, deployment configuration or Git metadata.
const publicFiles = new Set([
  "index.html", "privacidade.html", "manifest.json", "sw.js",
  "royal-ai-loader.js", "affiliate-communication.js"
]);
const publicDirectories = new Set(["icons", "js"]);
const windowMs = 60_000;
const limit = 240;
const visits = new Map();

app.disable("x-powered-by");
app.use((req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  if (visits.size > 10000) {
    for (const [ip, item] of visits) {
      if (now >= item.resetAt) visits.delete(ip);
    }
  }
  const item = visits.get(key);
  if (!item || now >= item.resetAt) {
    visits.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  item.count += 1;
  if (item.count > limit) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((item.resetAt - now) / 1000))));
    return res.status(429).send("Muitas solicitações. Tente novamente em instantes.");
  }
  next();
});

app.use((req, res, next) => {
  const pathname = (() => {
    try { return decodeURIComponent(new URL(req.originalUrl, "http://localhost").pathname); }
    catch { return ""; }
  })();
  if (!pathname || pathname.includes("\\") || pathname.includes("\0") ||
      pathname.split("/").includes("..")) return res.sendStatus(403);

  const relative = pathname.replace(/^\/+/, "");
  if (!relative) return res.sendFile(path.join(ROOT, "index.html"));
  const segments = relative.split("/");
  const permitted = publicFiles.has(relative) ||
    (segments.length >= 2 && publicDirectories.has(segments[0]) &&
     segments.every(part => part !== "" && !part.startsWith(".")) &&
     /\.(?:js|css|png|jpe?g|webp|svg|ico|woff2?|ttf)$/i.test(relative));
  if (!permitted) return res.sendStatus(404);
  return res.sendFile(path.resolve(ROOT, relative), { dotfiles: "deny" }, err => {
    if (err && !res.headersSent) res.sendStatus(err.status || 404);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`L&A Royal Advisory online on port ${PORT}`);
});
