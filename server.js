/**
 * Server.js - Korrigierte Version
 * Speichern als: backend/server.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./src/models');
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const restaurantRoutes = require('./src/routes/restaurant.routes');
const publicRoutes = require('./src/routes/public.routes');

// WICHTIG: NUR Review Monitor Service importieren (NICHT scan-notification!)
const reviewMonitor = require('./src/services/review-monitor.service');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Konfiguration
const corsOptions = {
  origin: function (origin, callback) {
    // Erlaubt Requests ohne Origin (z.B. Postman, lokale Tests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://lt-express.de',
      'https://www.lt-express.de',
      'https://qr-restaurant-managment.onrender.com',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked:', origin);
      callback(null, true); // Temporär alle erlauben für Debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/public', publicRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'QR Restaurant API', 
    version: '1.0.0',
    status: 'running',
    services: {
      database: 'connected',
      email: process.env.SMTP_USER ? 'configured' : 'not configured',
      googleAPI: process.env.GOOGLE_PLACES_API_KEY ? 'configured' : 'not configured',
      reviewMonitor: reviewMonitor.isRunning ? 'running' : 'stopped'
    }
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Etwas ist schief gelaufen!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Datenbank initialisieren und Server starten
async function startServer() {
  try {
    console.log('🚀 Starte QR Restaurant System...');
    console.log('================================');
    
    // Datenbankverbindung testen
    await sequelize.authenticate();
    console.log('✅ Datenbank verbunden (SQLite)');
    
    // Datenbank-Tabellen erstellen/aktualisieren
    await sequelize.sync({ alter: true });
    console.log('✅ Datenbank-Tabellen synchronisiert');
    
    // Super-Admin erstellen falls nicht vorhanden
    const { User } = require('./src/models');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@lt-express.de';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    
    const adminExists = await User.findOne({ where: { role: 'admin' } });
    
    if (!adminExists) {
      await User.create({
        email: adminEmail,
        password: adminPassword,
        name: 'Super Admin',
        role: 'admin',
        is_active: true
      });
      console.log(`✅ Super-Admin erstellt: ${adminEmail}`);
    } else {
      console.log('✅ Admin-Account vorhanden');
    }
    
    // E-Mail Service Status
    console.log('✅ E-Mail-Service konfiguriert');
    console.log(`   SMTP-Host: ${process.env.SMTP_HOST || 'nicht konfiguriert'}`);
    console.log(`   SMTP-User: ${process.env.SMTP_USER || 'nicht konfiguriert'}`);
    
    // WICHTIG: Review Monitor starten
    if (process.env.GOOGLE_PLACES_API_KEY) {
      reviewMonitor.startMonitoring();
      console.log('✅ Google Review Monitoring gestartet');
      console.log('   Prüfintervall: 2 Minuten');
      console.log('   ⚠️  E-Mails NUR bei echten Google-Bewertungen');
      console.log('   ❌ KEINE E-Mails bei QR-Code Scans');
    } else {
      console.log('❌ KRITISCHER FEHLER: Google Review Monitoring NICHT aktiv!');
      console.log('   Grund: GOOGLE_PLACES_API_KEY fehlt in .env');
      console.log('   LÖSUNG: Google Places API Key hier erstellen:');
      console.log('   https://developers.google.com/maps/documentation/places/web-service/get-api-key');
      console.log('');
      console.log('   OHNE API KEY:');
      console.log('   ❌ Keine Erkennung echter Bewertungen');
      console.log('   ❌ Keine E-Mail-Benachrichtigungen');
      console.log('   ✅ QR-Codes funktionieren weiterhin');
      console.log('   ✅ Weiterleitung zu Google Reviews funktioniert');
    }
    
    console.log('================================');
    
    // Server starten
    app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server läuft!');
      console.log(`   Lokal: http://localhost:${PORT}`);
      console.log(`   API: ${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}`);
      console.log('================================');
      
      if (process.env.GOOGLE_PLACES_API_KEY) {
        console.log('📌 AKTIVE FUNKTIONEN:');
        console.log('   ✅ Erkennung echter Google-Bewertungen');
        console.log('   ✅ E-Mail NUR bei neuen Bewertungen');
        console.log('   ✅ Autor und Bewertungstext in E-Mail');
        console.log('   ✅ Vermutete Tisch-Zuordnung');
      } else {
        console.log('📌 EINGESCHRÄNKTER MODUS (ohne Google API):');
        console.log('   ✅ QR-Code Scans werden getrackt');
        console.log('   ❌ KEINE E-Mails bei Scans');
        console.log('   ❌ KEINE Erkennung echter Bewertungen');
        console.log('   ✅ Weiterleitung zu Google Reviews funktioniert');
      }
      console.log('================================');
    });
  } catch (error) {
    console.error('❌ Server Start Fehler:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('⏹️ SIGTERM empfangen, fahre herunter...');
  reviewMonitor.stopMonitoring();
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⏹️ SIGINT empfangen, fahre herunter...');
  reviewMonitor.stopMonitoring();
  await sequelize.close();
  process.exit(0);
});

// Server starten
startServer();