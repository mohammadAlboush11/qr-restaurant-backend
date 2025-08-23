/**
 * QR Restaurant Backend Server – vollständig & robust
 * Datei: backend/server.js
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Services (lokal)
const emailService = require("./src/services/email.service");
const keepAlive = safeRequire("./src/services/keep-alive.service");
const reviewMonitor = safeRequire("./src/services/review-monitor.service");

// Routen (Index-Dateien der Ordner)
const adminRoutes = safeRequire("./src/routes/admin");
const publicRoutes = safeRequire("./src/routes/public");
const restaurantRoutes = safeRequire("./src/routes/restaurant");

// ———————————————————————————————————————————————————————————————————————
// Helpers
function safeRequire(p) {
  try {
    const mod = require(p);
    console.log(`✅ Modul geladen: ${p}`);
    return mod;
  } catch (err) {
    console.warn(`⚠️  Konnte Modul nicht laden: ${p}`);
    console.warn("   ", err?.message || err);
    return null;
  }
}

function logHeader(title) {
  console.log("========================================");
  console.log(title);
  console.log("========================================");
}

// ———————————————————————————————————————————————————————————————————————
// App-Grundkonfiguration
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Statische Dateien (falls benötigt)
const staticDir = path.join(__dirname, "public");
app.use("/public", express.static(staticDir));

// Health-/Status-Endpunkte
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    node: process.version,
    email: emailService.getStatus(),
    time: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.send("QR Restaurant Backend läuft.");
});

// Routen mounten – nur wenn vorhanden
if (adminRoutes) app.use("/api/admin", adminRoutes);
if (publicRoutes) app.use("/api/public", publicRoutes);
if (restaurantRoutes) app.use("/api/restaurant", restaurantRoutes);

// ———————————————————————————————————————————————————————————————————————
// Start-Sequenz
async function initializeServer() {
  logHeader("🚀 QR Restaurant Backend - Initialisierung");

  console.log("📅", new Date().toLocaleString("de-DE"));
  console.log("🌍 Environment:", process.env.NODE_ENV || "development");
  console.log("🔧 Node Version:", process.version);
  logHeader("");

  // E-Mail Service: KEIN initializeTransporter() – die Methode heißt initTransporter()
  // und wird bereits im Konstruktor ausgeführt. Optional: verify()
  const emailOk = await emailService.verify();
  console.log("📧 E-Mail Service Status:", {
    ...emailService.getStatus(),
    verified: emailOk,
  });

  // Optionale Hintergrund-Jobs
  if (keepAlive?.start) {
    keepAlive.start();
    console.log("✅ Keep-Alive Service gestartet");
  }
  if (reviewMonitor?.start) {
    reviewMonitor.start();
    console.log("✅ Review-Monitor Service gestartet");
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
    logHeader("Bereit");
  });
}

// ———————————————————————————————————————————————————————————————————————
initializeServer().catch((err) => {
  console.error("❌ Server-Initialisierung fehlgeschlagen:", err);
  process.exit(1);
});
