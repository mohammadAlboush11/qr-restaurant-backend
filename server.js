/**
 * QR Restaurant Backend Server – VOLLSTÄNDIG MIT DATENBANK
 * Datei: backend/server.js
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");

// WICHTIG: Datenbank-Models
const { sequelize, User, Restaurant, Table } = require("./src/models");

// Services
const emailService = require("./src/services/email.service");
const keepAlive = safeRequire("./src/services/keep-alive.service");
const reviewMonitor = safeRequire("./src/services/review-monitor.service");

// Routen
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

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://lt-express.de',
      'https://lt-express.de',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(null, true); // In Production trotzdem erlauben
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['X-New-Token']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Statische Dateien
const uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));

// ———————————————————————————————————————————————————————————————————————
// API Routes

// Health Check
app.get("/api/health", async (req, res) => {
  try {
    // Teste Datenbankverbindung
    await sequelize.authenticate();
    
    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      database: "connected",
      email: emailService.getStatus(),
      services: {
        keepAlive: keepAlive ? "active" : "inactive",
        reviewMonitor: reviewMonitor ? "active" : "inactive"
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: "unhealthy",
      error: error.message
    });
  }
});

// Root
app.get("/", (req, res) => {
  res.json({
    message: "QR Restaurant Backend API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      admin: "/api/admin",
      restaurant: "/api/restaurant", 
      public: "/api/public"
    }
  });
});

// Mount Routes
if (adminRoutes) {
  app.use("/api/admin", adminRoutes);
  console.log("✅ Admin Routes mounted at /api/admin");
}

if (publicRoutes) {
  app.use("/api/public", publicRoutes);
  console.log("✅ Public Routes mounted at /api/public");
}

if (restaurantRoutes) {
  app.use("/api/restaurant", restaurantRoutes);
  console.log("✅ Restaurant Routes mounted at /api/restaurant");
}

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint nicht gefunden",
    path: req.originalUrl
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Interner Serverfehler",
    ...(process.env.NODE_ENV === "development" && { 
      stack: err.stack,
      error: err 
    })
  });
});

// ———————————————————————————————————————————————————————————————————————
// Initialisierung

async function initializeDatabase() {
  try {
    console.log("📊 Teste Datenbankverbindung...");
    await sequelize.authenticate();
    console.log("✅ Datenbankverbindung erfolgreich!");

    // Datenbank synchronisieren
    console.log("🔄 Synchronisiere Datenbank-Schema...");
    await sequelize.sync({ alter: false }); // WICHTIG: alter: true nur in Dev!
    console.log("✅ Datenbank-Schema synchronisiert");

    // Admin-Account erstellen/prüfen
    await createAdminAccount();

    // Statistiken
    const userCount = await User.count();
    const restaurantCount = await Restaurant.count();
    const tableCount = await Table.count();
    
    console.log("📊 Datenbank-Statistiken:");
    console.log(`   Benutzer: ${userCount}`);
    console.log(`   Restaurants: ${restaurantCount}`);
    console.log(`   Tische: ${tableCount}`);

  } catch (error) {
    console.error("❌ Datenbankfehler:", error);
    throw error;
  }
}

async function createAdminAccount() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@lt-express.de";
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin123!@#";

    // Prüfe ob Admin existiert
    let admin = await User.findOne({
      where: { 
        email: adminEmail,
        role: "admin"
      }
    });

    if (!admin) {
      console.log("📌 Erstelle Admin-Account...");
      
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      admin = await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: "Super Admin",
        role: "admin",
        is_active: true
      });

      console.log(`✅ Admin-Account erstellt:`);
      console.log(`   E-Mail: ${adminEmail}`);
      console.log(`   Passwort: ${adminPassword}`);
      console.log(`   ⚠️  WICHTIG: Ändern Sie das Passwort nach dem ersten Login!`);
    } else {
      console.log(`✅ Admin-Account vorhanden: ${adminEmail}`);
      
      // Optional: Passwort zurücksetzen wenn in ENV angegeben
      if (process.env.RESET_ADMIN_PASSWORD === "true") {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await admin.update({ password: hashedPassword });
        console.log(`   ⚠️  Admin-Passwort wurde zurückgesetzt auf: ${adminPassword}`);
      }
    }

    // Prüfe ob mindestens ein Restaurant-User existiert
    const restaurantUserCount = await User.count({ where: { role: "restaurant" } });
    
    if (restaurantUserCount === 0) {
      console.log("📌 Erstelle Test-Restaurant...");
      
      // Erstelle Test-User
      const testPassword = "Test123!";
      const hashedTestPassword = await bcrypt.hash(testPassword, 10);
      
      const testUser = await User.create({
        email: "test@restaurant.de",
        password: hashedTestPassword,
        name: "Test Restaurant Owner",
        role: "restaurant",
        is_active: true
      });

      // Erstelle Test-Restaurant
      const testRestaurant = await Restaurant.create({
        name: "Test Restaurant",
        slug: "test-restaurant",
        email: "test@restaurant.de",
        phone: "+49 123 456789",
        address: "Teststraße 1, 12345 Teststadt",
        user_id: testUser.id,
        is_active: true,
        subscription_status: "active",
        subscription_plan: "basic",
        google_place_id: "ChIJqQ3vX8nDuEcR96H5Zv-bHHQ", // Beispiel Place ID
        google_review_url: "https://g.page/r/example",
        last_review_count: 0,
        current_rating: 0
      });

      // Update User mit Restaurant ID
      await testUser.update({ restaurant_id: testRestaurant.id });

      // Erstelle ein paar Test-Tische
      for (let i = 1; i <= 5; i++) {
        await Table.create({
          restaurant_id: testRestaurant.id,
          table_number: i.toString(),
          tracking_token: `test-token-${i}-${Date.now()}`,
          is_active: true,
          scan_count: 0
        });
      }

      console.log(`✅ Test-Restaurant erstellt:`);
      console.log(`   Name: Test Restaurant`);
      console.log(`   E-Mail: test@restaurant.de`);
      console.log(`   Passwort: ${testPassword}`);
      console.log(`   Tische: 5`);
    }

  } catch (error) {
    console.error("❌ Fehler beim Erstellen des Admin-Accounts:", error);
    throw error;
  }
}

async function initializeServer() {
  logHeader("🚀 QR Restaurant Backend - Initialisierung");
  console.log("📅", new Date().toLocaleString("de-DE"));
  console.log("🌍 Environment:", process.env.NODE_ENV || "development");
  console.log("🔧 Node Version:", process.version);
  logHeader("");

  // SCHRITT 1: Datenbank initialisieren
  await initializeDatabase();
  logHeader("");

  // SCHRITT 2: E-Mail Service prüfen
  const emailOk = await emailService.verify();
  console.log("📧 E-Mail Service Status:", {
    ...emailService.getStatus(),
    verified: emailOk
  });

  if (!emailOk) {
    console.log("⚠️  E-Mail-Verifikation fehlgeschlagen - Service läuft trotzdem");
  }

  // SCHRITT 3: Hintergrund-Services starten
  if (keepAlive && keepAlive.start) {
    keepAlive.start();
    console.log("✅ Keep-Alive Service gestartet");
  }

  if (reviewMonitor && reviewMonitor.startMonitoring) {
    reviewMonitor.startMonitoring();
    console.log("✅ Review-Monitor Service gestartet");
  }

  // SCHRITT 4: Server starten
  const PORT = Number(process.env.PORT) || 5000;
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
    console.log(`   Lokal: http://localhost:${PORT}`);
    
    if (process.env.BACKEND_URL) {
      console.log(`   Public: ${process.env.BACKEND_URL}`);
    }
    
    logHeader("🎉 System bereit!");
    console.log("📌 Login-Credentials:");
    console.log(`   Admin: ${process.env.ADMIN_EMAIL || "admin@lt-express.de"}`);
    console.log(`   Pass: ${process.env.ADMIN_PASSWORD || "Admin123!@#"}`);
    console.log("");
    console.log("   Test-Restaurant: test@restaurant.de / Test123!");
    logHeader("");
  });
}

// Graceful Shutdown
process.on("SIGTERM", async () => {
  console.log("📛 SIGTERM Signal erhalten. Fahre Server herunter...");
  
  if (reviewMonitor && reviewMonitor.stopMonitoring) {
    reviewMonitor.stopMonitoring();
  }
  
  if (keepAlive && keepAlive.stop) {
    keepAlive.stop();
  }
  
  if (sequelize) {
    await sequelize.close();
    console.log("✅ Datenbankverbindung geschlossen");
  }
  
  process.exit(0);
});

// ———————————————————————————————————————————————————————————————————————
// START

initializeServer().catch((err) => {
  console.error("❌ Server-Initialisierung fehlgeschlagen:", err);
  console.error(err.stack);
  process.exit(1);
});
