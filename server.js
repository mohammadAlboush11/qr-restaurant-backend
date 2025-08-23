/**
 * QR Restaurant Backend Server - VOLLSTÄNDIG KORRIGIERT
 * Speichern als: backend/server.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Services
const reviewMonitor = require('./src/services/review-monitor.service');
const keepAliveService = require('./src/services/keep-alive.service');
const emailService = require('./src/services/email.service');

// Database
const { sequelize, User, Restaurant } = require('./src/models');

const app = express();
const PORT = process.env.PORT || 5000;

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

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(null, true); // In Production trotzdem erlauben für Flexibilität
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['X-New-Token'] // Für Token-Refresh
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health Check Endpoint (für Keep-Alive und Monitoring)
app.get('/api/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: sequelize.authenticate().then(() => true).catch(() => false),
      email: emailService.isConfigured,
      reviewMonitor: reviewMonitor.getStatus().isMonitoring,
      keepAlive: keepAliveService.getStatus().isRunning
    }
  };
  
  res.status(200).json(health);
});

// Keep-Alive Status Endpoint
app.get('/api/keep-alive/status', (req, res) => {
  res.json(keepAliveService.getStatus());
});

// Routes
app.use('/api/restaurant', require('./src/routes/restaurant'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/public', require('./src/routes/public'));

// Static files (QR codes, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint nicht gefunden',
    path: req.path
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Unbehandelter Fehler:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Interner Serverfehler',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('📛 SIGTERM Signal erhalten. Fahre Server herunter...');
  
  // Stoppe Services
  reviewMonitor.stopMonitoring();
  keepAliveService.stop();
  
  // Schließe Datenbankverbindung
  await sequelize.close();
  
  process.exit(0);
});

// Server Initialization
async function initializeServer() {
  try {
    console.log('========================================');
    console.log('🚀 QR Restaurant Backend - Initialisierung');
    console.log('========================================');
    console.log(`📅 ${new Date().toLocaleString('de-DE')}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Node Version: ${process.version}`);
    console.log('========================================');

    // Datenbankverbindung testen
    console.log('📊 Teste Datenbankverbindung...');
    await sequelize.authenticate();
    console.log('✅ Datenbankverbindung erfolgreich!');

    // Datenbank synchronisieren
    console.log('🔄 Synchronisiere Datenbank-Schema...');
    await sequelize.sync({ alter: false }); // alter: true nur in Dev!
    console.log('✅ Datenbank-Schema aktuell');

    // Admin-Account prüfen/erstellen
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@lt-express.de';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!@#';
    
    const adminExists = await User.findOne({ 
      where: { 
        role: 'admin',
        email: adminEmail 
      } 
    });
    
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: 'Super Admin',
        role: 'admin',
        is_active: true
      });
      
      console.log(`✅ Admin-Account erstellt: ${adminEmail}`);
      console.log('⚠️  WICHTIG: Ändern Sie das Admin-Passwort nach dem ersten Login!');
    } else {
      console.log(`✅ Admin-Account vorhanden: ${adminEmail}`);
    }

    console.log('========================================');
    
    // E-Mail Service initialisieren
    console.log('📧 E-Mail Service Status:');
    await emailService.initializeTransporter();
    
    if (emailService.isConfigured) {
      console.log('✅ E-Mail-Service bereit');
      console.log(`   SMTP-Host: ${process.env.SMTP_HOST}`);
      console.log(`   SMTP-User: ${process.env.SMTP_USER}`);
      
      // Optional: Test-E-Mail senden
      if (process.env.SEND_TEST_EMAIL === 'true') {
        const testResult = await emailService.sendTestEmail(process.env.ADMIN_EMAIL);
        if (testResult) {
          console.log('✅ Test-E-Mail erfolgreich gesendet');
        }
      }
    } else {
      console.log('⚠️  E-Mail-Service NICHT konfiguriert');
      console.log('   Prüfen Sie SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }

    console.log('========================================');
    
    // Review Monitor starten
    if (process.env.GOOGLE_PLACES_API_KEY) {
      reviewMonitor.startMonitoring();
      console.log('✅ Google Review Monitoring AKTIV');
      console.log('   ⏱️  Check-Intervall: 30 Sekunden');
      console.log('   📧 E-Mails nur bei neuen Bewertungen');
    } else {
      console.log('⚠️  Google Review Monitoring INAKTIV');
      console.log('   Grund: GOOGLE_PLACES_API_KEY fehlt');
    }

    console.log('========================================');
    
    // Keep-Alive Service starten (nur in Production)
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      keepAliveService.start();
      console.log('✅ Keep-Alive Service AKTIV');
      console.log('   🔄 Server bleibt aktiv (Render Free Plan)');
      console.log('   ⏱️  Aktivität alle 10 Minuten');
    } else {
      console.log('ℹ️  Keep-Alive Service INAKTIV (nur in Production)');
    }

    console.log('========================================');
    
    // Server starten
    app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server erfolgreich gestartet!');
      console.log(`   🌐 Port: ${PORT}`);
      console.log(`   📍 Lokal: http://localhost:${PORT}`);
      
      if (process.env.BACKEND_URL) {
        console.log(`   🌍 Public: ${process.env.BACKEND_URL}`);
      }
      
      if (process.env.RENDER) {
        console.log(`   ☁️  Render: ${process.env.RENDER_EXTERNAL_URL}`);
      }
      
      console.log('========================================');
      console.log('📋 Verfügbare Endpoints:');
      console.log('   GET  /api/health - System Health Check');
      console.log('   POST /api/restaurant/auth/login - Restaurant Login');
      console.log('   POST /api/admin/auth/login - Admin Login');
      console.log('   GET  /api/public/track/:token - QR Code Tracking');
      console.log('========================================');
      console.log('🎉 System bereit für Anfragen!');
      console.log('========================================');
    });

  } catch (error) {
    console.error('❌ Server-Initialisierung fehlgeschlagen:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Server starten
initializeServer().catch(error => {
  console.error('❌ Kritischer Fehler beim Serverstart:', error);
  process.exit(1);
});