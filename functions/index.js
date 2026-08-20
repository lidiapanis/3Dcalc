/**
 * Firebase Cloud Functions Gen 2 — 3DCalc Monitoramento de Preços ML
 *
 * Gen 2 usa Cloud Run por baixo, com acesso à internet sem restrições de VPC.
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();

// ─── App Express ─────────────────────────────────────────────────────────────

const app = express();

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

const crawlerRoutes  = require("./src/routes/crawler.routes");
const shippingRoutes = require("./src/routes/shipping.routes");
const adminRoutes    = require("./src/routes/admin.routes");
const publicRoutes   = require("./src/routes/public.routes");
const hueforgeRoutes = require("./src/routes/hueforge.routes");

// Rotas públicas (landing de evento) — montadas primeiro nos dois prefixos.
// Paths exclusivos (/landing-info, /cadastro-publico) → não colidem com as demais.
app.use("/api", publicRoutes);
app.use("/",    publicRoutes);

// Firebase Hosting repassa o path completo → monta nos dois prefixos
app.use("/api/monitor", crawlerRoutes);
app.use("/",            crawlerRoutes);

app.use("/api/frete",   shippingRoutes);
app.use("/frete",       shippingRoutes);

app.use("/api/admin",   adminRoutes);
app.use("/admin",       adminRoutes);

app.use("/api/hueforge", hueforgeRoutes);
app.use("/hueforge",     hueforgeRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Rota não encontrada. Path: " + req.path });
});

// ─── HTTP Function (Gen 2) ───────────────────────────────────────────────────

exports.monitorApiV2 = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: false, // gerenciado pelo middleware Express acima
  },
  app
);

// ─── Scheduled Function (Gen 2) ─────────────────────────────────────────────

// ─── Verificação diária de licenças expiradas ────────────────────────────────

exports.verificarLicencasJob = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "America/Sao_Paulo",
    region:   "us-central1",
    memory:   "256MiB",
    timeoutSeconds: 60,
  },
  async () => {
    const { verificarLicencasExpiradas } = require("./src/services/admin.service");
    try {
      const expiradas = await verificarLicencasExpiradas();
      console.log(`Licenças expiradas desativadas: ${expiradas.length}`);
    } catch (err) {
      console.error("Erro na verificação de licenças:", err);
    }
  }
);

exports.priceMonitorJobV2 = onSchedule(
  {
    schedule: "every 1 hours",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    const { runPriceMonitor } = require("./src/jobs/price-monitor.job");
    try {
      const result = await runPriceMonitor();
      console.log("Job concluído:", result.message);
      console.log(result.log.join("\n"));
    } catch (err) {
      console.error("Erro no job de monitoramento:", err);
    }
  }
);
