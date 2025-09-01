// backend/server.js
// AKTUALISIERTE VERSION MIT SMART REVIEW SERVICE

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;

// Logger
const logger = {
  info: (msg, data = {}) => console.log(`ℹ️ INFO: ${msg}`, data),
  warn: (msg, data = {}) => console.log(`⚠️ WARN: ${msg}`, data),
  error: (msg, data = {}) => console.error(`❌ ERROR: ${msg}`, data),
  debug: (msg, data = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🛠 DEBUG: ${msg}`, data);
    }
  }
};

// Security Configuration
function validateSecurityConfig() {
  const warnings = [];
  const errors = [];

  // JWT Secret Check
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET ist nicht gesetzt');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET muss mindestens 32 Zeichen lang sein');
  }

  // Admin Credentials Check
  if (!process.env.ADMIN_EMAIL) {
    errors.push('ADMIN_EMAIL ist nicht gesetzt');
  }
  
  if (!process.env.ADMIN_PASSWORD) {
    errors.push('ADMIN_PASSWORD ist nicht gesetzt');
  }

  // SMTP Config Check
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    warnings.push('E-Mail-Service nicht konfiguriert - Review-Benachrichtigungen eingeschränkt');
  }
  
  // Google API Check
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    warnings.push('Google Places API Key fehlt - Automatische Review-Erkennung deaktiviert');
  }

  return { warnings, errors };
}

// Start Server
async function startServer() {
  try {
    // Security validation
    const { warnings, errors } = validateSecurityConfig();
    
    warnings.forEach(w => logger.warn(w));
    
    if (errors.length > 0 && process.env.NODE_ENV === 'production') {
      logger.error('Kritische Konfigurationsfehler:', errors);
      app.get('*', (req, res) => {
        res.status(503).json({
          success: false,
          message: 'Server im Wartungsmodus - Konfiguration erforderlich',
          errors: process.env.NODE_ENV === 'development' ? errors : undefined
        });
      });
      
      app.listen(PORT, () => {
        logger.warn(`Server im WARTUNGSMODUS auf Port ${PORT}`);
      });
      return;
    }

    // Security Headers
    try {
      app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
      }));
      logger.info('Security headers aktiviert');
    } catch (e) {
      logger.warn('Helmet nicht installiert - Security Headers deaktiviert');
    }

    // CORS Configuration
    const corsOptions = {
      origin: function (origin, callback) {
        const allowedOrigins = [
          'https://lt-express.de',
          'http://lt-express.de',
          process.env.FRONTEND_URL,
          'http://localhost:3000',
          'http://localhost:5173'
        ].filter(Boolean);
        
        // Allow requests with no origin (mobile apps, Postman)
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          callback(new Error('CORS nicht erlaubt'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition']
    };

    app.use(cors(corsOptions));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging for development
    if (process.env.NODE_ENV === 'development') {
      app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
          const duration = Date.now() - start;
          logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        });
        next();
      });
    }

    // Health Check mit Database Info
    app.get('/health', (req, res) => {
      const { sequelize } = require('./src/models');
      const dbPath = sequelize.databasePath || sequelize.config.storage;
      const dbExists = fs.existsSync(dbPath);
      const dbStats = dbExists ? fs.statSync(dbPath) : null;
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        database: {
          exists: dbExists,
          path: dbPath,
          size: dbStats ? `${(dbStats.size / 1024 / 1024).toFixed(2)} MB` : 'N/A',
          lastModified: dbStats ? dbStats.mtime.toISOString() : 'N/A'
        },
        services: {
          email: !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
          googleApi: !!process.env.GOOGLE_PLACES_API_KEY,
          smartReview: 'active'
        },
        warnings: warnings.length > 0 ? warnings : undefined
      });
    });

    // Database Initialization
    try {
      const { sequelize, User, Restaurant, Table, Plan, QRCode, Scan } = require('./src/models');
      
      await sequelize.authenticate();
      logger.info('✅ Database connection established');
      
      // Get database path from sequelize config
      const dbPath = sequelize.databasePath || sequelize.config.storage;
      logger.info(`📁 Database path: ${dbPath}`);
      
      const dbExists = fs.existsSync(dbPath);
      
      if (!dbExists) {
        logger.info('🆕 Creating new database...');
        await sequelize.sync({ force: true });
      } else {
        logger.info('✅ Using existing database');
        const stats = fs.statSync(dbPath);
        logger.info(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        logger.info(`   Last modified: ${stats.mtime.toISOString()}`);
        
        // Schema-Updates ohne Datenverlust
        await sequelize.sync({ alter: true });
      }
      
      // Füge neue Felder zum Scan Model hinzu (falls noch nicht vorhanden)
      try {
        await sequelize.query(`
          ALTER TABLE scans ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;
        `).catch(() => {});
        
        await sequelize.query(`
          ALTER TABLE scans ADD COLUMN IF NOT EXISTS processed_at DATETIME;
        `).catch(() => {});
        
        await sequelize.query(`
          ALTER TABLE scans ADD COLUMN IF NOT EXISTS resulted_in_review BOOLEAN DEFAULT FALSE;
        `).catch(() => {});
        
        await sequelize.query(`
          ALTER TABLE scans ADD COLUMN IF NOT EXISTS review_details TEXT;
        `).catch(() => {});
        
        await sequelize.query(`
          ALTER TABLE scans ADD COLUMN IF NOT EXISTS review_reaction_time INTEGER;
        `).catch(() => {});
        
        logger.info('✅ Scan table schema updated');
      } catch (e) {
        // SQLite wirft Fehler wenn Spalten bereits existieren - das ist OK
      }

      // Create default admin user
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (adminEmail && adminPassword) {
        try {
          const existingAdmin = await User.findOne({
            where: { email: adminEmail.toLowerCase().trim() }
          });

          if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            const admin = await User.create({
              email: adminEmail.toLowerCase().trim(),
              password: hashedPassword,
              name: 'Super Admin',
              role: 'super_admin',
              is_active: true,
              is_email_verified: true,
              email_verified_at: new Date()
            });
            logger.info(`✅ Admin created: ${adminEmail}`);
            
            if (process.env.NODE_ENV === 'development') {
              logger.info(`🔑 Admin password: ${adminPassword}`);
            }
          } else {
            logger.info(`ℹ️ Admin user already exists: ${adminEmail}`);
          }
        } catch (adminError) {
          logger.error('Admin creation error:', adminError);
        }
      } else {
        logger.warn('⚠️ Admin credentials nicht gesetzt - Admin wurde nicht erstellt');
        if (process.env.NODE_ENV === 'production') {
          logger.error('❌ KRITISCH: Admin muss in Production erstellt werden!');
        }
      }

      // Create default plans if they don't exist
      const planCount = await Plan.count();
      if (planCount === 0) {
        await Plan.bulkCreate([
          {
            name: 'Trial',
            slug: 'trial',
            price: 0,
            duration_months: 1,
            max_tables: 5,
            features: JSON.stringify(['Basic QR-Codes', 'Email Support']),
            is_active: true
          },
          {
            name: 'Basic',
            slug: 'basic',
            price: 29.99,
            duration_months: 1,
            max_tables: 20,
            features: JSON.stringify(['QR-Codes', 'Email Notifications', 'Basic Analytics']),
            is_active: true
          },
          {
            name: 'Premium',
            slug: 'premium',
            price: 59.99,
            duration_months: 1,
            max_tables: 50,
            features: JSON.stringify(['All Features', 'Priority Support', 'Advanced Analytics']),
            is_active: true
          }
        ]);
        logger.info('✅ Default plans created');
      }
      
    } catch (dbError) {
      logger.error('Database initialization failed:', dbError);
      
      if (process.env.NODE_ENV === 'production') {
        logger.error('❌ KRITISCH: Datenbank konnte nicht initialisiert werden!');
        process.exit(1);
      } else {
        throw dbError;
      }
    }

    // API Routes with logging
    app.use('/api/admin', (req, res, next) => {
      logger.debug(`[ADMIN] ${req.method} ${req.path}`);
      next();
    }, require('./src/routes/admin'));

    app.use('/api/restaurant', (req, res, next) => {
      logger.debug(`[RESTAURANT] ${req.method} ${req.path}`);
      next();
    }, require('./src/routes/restaurant'));

    app.use('/api/public', (req, res, next) => {
      logger.debug(`[PUBLIC] ${req.method} ${req.path}`);
      next();
    }, require('./src/routes/public'));

    // Static files (if needed for uploaded files)
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    // ===== START BACKGROUND SERVICES =====
    
    // 1. Smart Review Notification Service (NEUER SERVICE!)
    try {
      const smartReviewService = require('./src/services/smart-review-notification.service');
      
      if (process.env.GOOGLE_PLACES_API_KEY) {
        smartReviewService.start();
        logger.info('✅ Smart Review Monitoring gestartet (3 Min Verzögerung)');
        logger.info('   ⏱️ E-Mails werden nur bei echten Reviews gesendet');
      } else {
        logger.warn('⚠️ Smart Review Monitoring deaktiviert - Google API Key fehlt');
        logger.warn('   Setzen Sie GOOGLE_PLACES_API_KEY in den Environment Variables');
      }
    } catch (serviceError) {
      logger.error('Smart Review Service Error:', serviceError.message);
      // Service optional - weiter mit Server-Start
    }
    
    // 2. Keep-Alive Service (für Render Free Tier)
    if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
      try {
        const keepAliveService = require('./src/services/keep-alive.service');
        keepAliveService.start();
        logger.info('✅ Keep-Alive service started');
      } catch (serviceError) {
        logger.warn('Keep-Alive service not available');
      }
    }
    
    // 3. Legacy Review Monitor (falls noch vorhanden - DEAKTIVIERT)
    // Wir verwenden jetzt den Smart Review Service stattdessen
    /*
    try {
      const reviewMonitor = require('./src/services/review-monitor.service');
      if (reviewMonitor && reviewMonitor.stop) {
        reviewMonitor.stop(); // Stoppe alten Service
        logger.info('⛔ Legacy Review Monitor gestoppt');
      }
    } catch (e) {
      // Ignorieren wenn nicht vorhanden
    }
    */

    // 404 Handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.path}`,
        path: req.path,
        method: req.method
      });
    });

    // Global Error Handler
    app.use((error, req, res, next) => {
      logger.error('Unhandled Error:', {
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
      
      res.status(error.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
          ? 'Internal Server Error' 
          : error.message,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error
        })
      });
    });

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('='.repeat(60));
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
      logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      
      // Zeige Service-Status
      logger.info('📊 Active Services:');
      if (process.env.GOOGLE_PLACES_API_KEY) {
        logger.info('   ✅ Smart Review Monitoring (3 Min delay)');
      } else {
        logger.info('   ❌ Smart Review Monitoring (API Key missing)');
      }
      
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        logger.info('   ✅ Email Service');
      } else {
        logger.info('   ❌ Email Service (SMTP not configured)');
      }
      
      if (warnings.length > 0) {
        logger.warn(`⚠️ Warnings: ${warnings.length}`);
        warnings.forEach(w => logger.warn(`   - ${w}`));
      }
      
      logger.info('='.repeat(60));
    });

    // Graceful Shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`\n${signal} received, shutting down gracefully...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      try {
        // Stop Smart Review Service
        const smartReviewService = require('./src/services/smart-review-notification.service');
        if (smartReviewService && smartReviewService.stop) {
          smartReviewService.stop();
          logger.info('Smart Review Service stopped');
        }
        
        // Stop other services
        const services = ['keep-alive.service', 'review-monitor.service'];
        for (const serviceName of services) {
          try {
            const service = require(`./src/services/${serviceName}`);
            if (service && service.stop) {
              service.stop();
              logger.info(`${serviceName} stopped`);
            }
          } catch (e) {
            // Service not available
          }
        }
        
        // Close database connection
        const { sequelize } = require('./src/models');
        await sequelize.close();
        logger.info('Database connections closed');
        
      } catch (error) {
        logger.error('Shutdown error:', error);
      }
      
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    
    if (process.env.NODE_ENV === 'production') {
      // Minimal fallback server
      app.get('*', (req, res) => {
        res.status(500).json({ 
          success: false, 
          message: 'Server initialization failed' 
        });
      });
      
      app.listen(PORT, () => {
        logger.error(`Fallback server on port ${PORT}`);
      });
    } else {
      process.exit(1);
    }
  }
}

// Start the server
startServer().catch(error => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});