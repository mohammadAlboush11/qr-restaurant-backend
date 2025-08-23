const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./src/models');
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const restaurantRoutes = require('./src/routes/restaurant.routes');
const publicRoutes = require('./src/routes/public.routes');

// WICHTIG: Review Monitor Service importieren
const reviewMonitor = require('./src/services/review-monitor.service');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Konfiguration
const corsOptions = {
  origin: function (origin, callback) {
    // Erlaubt Requests ohne Origin (z.B. Postman, lokale Tests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://lt-express.de',
      'http://www.lt-express.de',
      'https://qr-restaurant-managment.onrender.com',
      'https://qr-restaurant-backend.onrender.com',
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
    timestamp: new Date(),
    services: {
      database: 'connected',
      email: process.env.SMTP_USER ? 'configured' : 'not configured',
      googleAPI: process.env.GOOGLE_PLACES_API_KEY ? 'configured' : 'not configured',
      reviewMonitor: reviewMonitor.isRunning ? 'running' : 'stopped',
      backendUrl: process.env.BACKEND_URL || 'not set',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// API Status endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'API is running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      restaurant: '/api/restaurant',
      public: '/api/public'
    }
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
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
    
    // Environment Check
    console.log('📋 Environment Check:');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   PORT: ${PORT}`);
    console.log(`   BACKEND_URL: ${process.env.BACKEND_URL || 'nicht gesetzt'}`);
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
      console.log('⚠️  WICHTIG: Bitte ändern Sie das Admin-Passwort nach dem ersten Login!');
    } else {
      console.log('✅ Admin-Account vorhanden');
    }
    
    // E-Mail Service Status
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      console.log('✅ E-Mail-Service konfiguriert');
      console.log(`   SMTP-Host: ${process.env.SMTP_HOST || 'smtp.strato.de'}`);
      console.log(`   SMTP-User: ${process.env.SMTP_USER}`);
    } else {
      console.log('⚠️  E-Mail-Service NICHT konfiguriert');
      console.log('   SMTP_USER oder SMTP_PASS fehlt in .env');
    }
    
    console.log('================================');
    
    // WICHTIG: Review Monitor starten (nur wenn Google API Key vorhanden)
    if (process.env.GOOGLE_PLACES_API_KEY) {
      reviewMonitor.startMonitoring();
      console.log('✅ Google Review Monitoring AKTIV');
      console.log('   ✅ E-Mails NUR bei neuen Bewertungen');
      console.log('   ❌ KEINE E-Mails bei QR-Scans');
      console.log('   ⏱️  Prüfintervall: 60 Sekunden');
      console.log('   🔍 Überwacht alle Restaurants mit Place ID');
    } else {
      console.log('⚠️  Google Review Monitoring DEAKTIVIERT');
      console.log('   ❌ Grund: GOOGLE_PLACES_API_KEY fehlt in .env');
      console.log('   ❌ KEINE automatischen E-Mails möglich');
      console.log('   ℹ️  Fügen Sie Google API Key hinzu für Review-Erkennung');
    }
    
    console.log('================================');
    
    // Server starten
    app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server läuft!');
      console.log(`   Lokal: http://localhost:${PORT}`);
      console.log(`   API: ${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}`);
      console.log('================================');
      
      if (process.env.GOOGLE_PLACES_API_KEY) {
        console.log('📌 System-Verhalten MIT Google API:');
        console.log('   1. QR-Code Scan → Tracking (keine E-Mail)');
        console.log('   2. Google prüft alle 60 Sekunden auf neue Reviews');
        console.log('   3. Neue Review gefunden → E-Mail an Restaurant');
        console.log('   4. E-Mail enthält: Autor, Rating, Text der Review');
      } else {
        console.log('📌 System-Verhalten OHNE Google API:');
        console.log('   1. QR-Code Scan → nur Weiterleitung');
        console.log('   2. Keine Review-Erkennung möglich');
        console.log('   3. Keine automatischen E-Mails');
      }
      console.log('================================');
      
      // Statistiken anzeigen
      showStartupStats();
    });
  } catch (error) {
    console.error('❌ Server Start Fehler:', error);
    process.exit(1);
  }
}

// Startup Statistiken
async function showStartupStats() {
  try {
    const { User, Restaurant, Table } = require('./src/models');
    
    const userCount = await User.count();
    const restaurantCount = await Restaurant.count();
    const tableCount = await Table.count();
    const activeRestaurants = await Restaurant.count({ where: { is_active: true } });
    
    console.log('📊 System-Statistiken:');
    console.log(`   Benutzer: ${userCount}`);
    console.log(`   Restaurants: ${restaurantCount} (${activeRestaurants} aktiv)`);
    console.log(`   Tische/QR-Codes: ${tableCount}`);
    console.log('================================');
  } catch (error) {
    console.error('Statistik-Fehler:', error.message);
  }
}

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('⏹️  SIGTERM empfangen, fahre herunter...');
  
  // Review Monitor stoppen
  if (reviewMonitor.isRunning) {
    reviewMonitor.stopMonitoring();
    console.log('   Review Monitor gestoppt');
  }
  
  // Datenbankverbindung schließen
  await sequelize.close();
  console.log('   Datenbank geschlossen');
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⏹️  SIGINT empfangen, fahre herunter...');
  
  // Review Monitor stoppen
  if (reviewMonitor.isRunning) {
    reviewMonitor.stopMonitoring();
    console.log('   Review Monitor gestoppt');
  }
  
  // Datenbankverbindung schließen
  await sequelize.close();
  console.log('   Datenbank geschlossen');
  
  process.exit(0);
});

// Unhandled Rejection Handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught Exception Handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Server starten
startServer();