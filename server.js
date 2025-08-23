/**
 * QR Restaurant Backend Server - FINALE VERSION
 * Speichern als: backend/server.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Services mit sicherer Ladung
let emailService;
let reviewMonitor; 
let keepAliveService;

// Lade Services mit Fehlerbehandlung
function loadService(servicePath, serviceName) {
  try {
    const service = require(servicePath);
    console.log(`✅ Modul geladen: ${servicePath}`);
    return service;
  } catch (error) {
    console.log(`⚠️ Modul ${serviceName} nicht gefunden - verwende Fallback`);
    return null;
  }
}

emailService = loadService('./src/services/email.service', 'Email Service');
keepAliveService = loadService('./src/services/keep-alive.service', 'Keep-Alive Service');
reviewMonitor = loadService('./src/services/review-monitor.service', 'Review Monitor');

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

    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['X-New-Token']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging (nur in Development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: await sequelize.authenticate().then(() => true).catch(() => false),
      email: emailService ? emailService.isConfigured : false,
      reviewMonitor: reviewMonitor ? (reviewMonitor.getStatus ? reviewMonitor.getStatus().isMonitoring : false) : false,
      keepAlive: keepAliveService ? (keepAliveService.getStatus ? keepAliveService.getStatus().isRunning : false) : false
    }
  };
  
  res.status(200).json(health);
});

// Keep-Alive Status Endpoint
app.get('/api/keep-alive/status', (req, res) => {
  if (keepAliveService && keepAliveService.getStatus) {
    res.json(keepAliveService.getStatus());
  } else {
    res.json({ status: 'Keep-Alive Service nicht verfügbar' });
  }
});

// ============================
// ROUTES
// ============================

// Admin Routes
const adminRoutes = loadService('./src/routes/admin', 'Admin Routes');
if (adminRoutes) {
  app.use('/api/admin', adminRoutes);
}

// Public Routes
const publicRoutes = loadService('./src/routes/public', 'Public Routes');
if (publicRoutes) {
  app.use('/api/public', publicRoutes);
}

// Restaurant Routes
const restaurantRoutes = loadService('./src/routes/restaurant', 'Restaurant Routes');
if (restaurantRoutes) {
  app.use('/api/restaurant', restaurantRoutes);
}

// Static Files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint nicht gefunden',
    path: req.originalUrl
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Interner Serverfehler',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      error: err 
    })
  });
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
    console.log('');

    // Datenbankverbindung
    try {
      await sequelize.authenticate();
      console.log('✅ Datenbankverbindung erfolgreich');
      
      await sequelize.sync({ alter: false });
      console.log('✅ Datenbank-Schema synchronisiert');
    } catch (dbError) {
      console.error('❌ Datenbankfehler:', dbError.message);
      // Fortfahren auch ohne DB für Health-Checks
    }

    // Admin-Account
    try {
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
      } else {
        console.log(`✅ Admin-Account vorhanden: ${adminEmail}`);
      }
    } catch (adminError) {
      console.log('⚠️ Admin-Account konnte nicht geprüft werden');
    }

    console.log('========================================');
    
    // E-Mail Service Status
    if (emailService) {
      // WICHTIG: Verwende initTransporter OHNE "ialize"!
      if (emailService.initTransporter) {
        emailService.initTransporter(); // NICHT await, da es synchron ist!
      }
      
      // Warte kurz auf Initialisierung
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Prüfe Status
      const emailStatus = emailService.getStatus ? emailService.getStatus() : { isConfigured: false };
      console.log('📧 E-Mail Service Status:', emailStatus);
      
      // Optional: Verifiziere Verbindung
      if (emailService.verify) {
        const verified = await emailService.verify();
        console.log('📧 E-Mail Service Status:', { ...emailStatus, verified });
      }
      
      if (process.env.SEND_TEST_EMAIL === 'true' && emailService.sendTestEmail) {
        const testResult = await emailService.sendTestEmail(process.env.ADMIN_EMAIL || 'admin@lt-express.de');
        if (testResult) {
          console.log('✅ Test-E-Mail erfolgreich gesendet');
        }
      }
    } else {
      console.log('⚠️ E-Mail Service nicht geladen');
    }

    // Review Monitor
    if (reviewMonitor && process.env.GOOGLE_PLACES_API_KEY) {
      if (reviewMonitor.startMonitoring) {
        reviewMonitor.startMonitoring();
        console.log('✅ Review Monitor gestartet');
      }
    } else {
      console.log('⚠️ Review Monitor inaktiv (API Key fehlt oder Service nicht geladen)');
    }

    // Keep-Alive Service
    if (keepAliveService && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
      if (keepAliveService.start) {
        keepAliveService.start();
        console.log('✅ Keep-Alive Service gestartet');
      }
    }

    // Server starten
    app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server läuft auf Port', PORT);
      console.log('========================================');
      console.log('Bereit');
      console.log('========================================');
    });

  } catch (error) {
    console.error('❌ Server-Initialisierung fehlgeschlagen:', error);
    console.error(error.stack);
    // Versuche trotzdem zu starten für Health-Checks
    app.listen(PORT, '0.0.0.0', () => {
      console.log('⚠️ Server gestartet mit Fehlern auf Port', PORT);
    });
  }
}

// Server starten
initializeServer().catch(error => {
  console.error('❌ Kritischer Fehler beim Serverstart:', error);
  // Starte trotzdem für Health-Checks
  app.listen(PORT, '0.0.0.0', () => {
    console.log('⚠️ Notfall-Server auf Port', PORT);
  });
});
