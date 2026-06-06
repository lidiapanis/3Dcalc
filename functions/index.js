/**
 * Firebase Cloud Functions — 3DCalc Monitoramento de Preços ML
 *
 * Exporta:
 *   api            — HTTP Function (Express) em /api/monitor/...
 *   priceMonitorJob — Scheduled Function (todo hora)
 *
 * ⚠️  Requer plano BLAZE para:
 *   - Chamadas externas (API do Mercado Livre)
 *   - Scheduled Functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Inicializar Firebase Admin (usa as credenciais do ambiente Cloud Functions)
admin.initializeApp();

// ─── App Express ─────────────────────────────────────────────────────────────

const app = express();

// CORS: permite chamadas do domínio do Firebase Hosting e localhost para dev
const allowedOrigins = [
  "https://calculo3d.web.app",
  "https://calculo3d.firebaseapp.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ─── Rotas ───────────────────────────────────────────────────────────────────

const crawlerRoutes = require("./src/routes/crawler.routes");
app.use("/", crawlerRoutes);

// Rota raiz de health-check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Handler 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Rota não encontrada." });
});

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * HTTP Function — acessível via Firebase Hosting rewrite em /api/monitor/*
 * URL em prod: https://calculo3d.web.app/api/monitor/...
 */
exports.monitorApi = functions
  .region("us-central1")
  .https.onRequest(app);

/**
 * Scheduled Function — executa o job de monitoramento toda hora.
 * Para alterar a frequência, mude a expressão cron:
 *   "every 1 hours"       → a cada hora
 *   "every 30 minutes"    → a cada 30 minutos
 *   "0 8,20 * * *"        → às 8h e 20h (cron padrão)
 *
 * ⚠️  Requer plano Blaze para funcionar.
 */
exports.priceMonitorJob = functions
  .region("us-central1")
  .pubsub.schedule("every 1 hours")
  .timeZone("America/Sao_Paulo")
  .onRun(async (context) => {
    const { runPriceMonitor } = require("./src/jobs/price-monitor.job");
    try {
      const result = await runPriceMonitor();
      console.log("Job concluído:", result.message);
      console.log(result.log.join("\n"));
    } catch (err) {
      console.error("Erro no job de monitoramento:", err);
    }
    return null;
  });
