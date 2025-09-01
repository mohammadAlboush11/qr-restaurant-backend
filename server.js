// backend/server.js
// VOLLSTÄNDIGE VERSION MIT AUSFÜHRLICHEM LOGGING

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;

// ===== STARTUP LOGGING =====
console.log('='.repeat(60));
console.log('🚀 STARTING QR RESTAURANT BACKEND');
console.log('='.repeat(60));
console.log(`📅 Time: ${new Date().toISOString()}`);
console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔧 Node Version: ${process.version}`);
console.log(`📁 Working Directory: ${process.cwd()}`);
console.log('='.repeat(60));

// ===== ENVIRONMENT CHECK =====
console.log('\n📋 ENVIRONMENT VARIABLES CHECK:');
console.log(`   DATABASE_PATH: ${process.env.DATABASE_PATH || '❌ NOT SET'}`);
console.log(`   GOOGLE_PLACES_API_KEY: ${process.env.GOOGLE_PLACES_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`   ADMIN_EMAIL: ${process.env.ADMIN_EMAIL || '❌ NOT SET'}`);
console.log(`   SMTP_USER: ${process.env.SMTP_USER ? '✅ Set' : '❌ Missing'}`);
console.log(`   RENDER: ${process.env.RENDER || 'false'}`);
console.log('='.repeat(60));

// Logger
const logger = {
  info: (msg, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️ INFO: ${msg}`, data);
  },
  warn: (msg, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ⚠️ WARN: ${msg}`, data);
  },
  error: (msg, data = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ERROR: ${msg}`, data);
  },
  debug: (msg, data = {}) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🛠 DEBUG: ${msg}`, data);
    }
  }
};

// Security Configuration
function validateSecurityConfig() {
  logger.info('Validating security configuration...');
  
  const warnings = [];
  const errors = [];

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET ist nicht gesetzt');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET muss mindestens 32 Zeichen lang sein');
  }

  if (!process.env.ADMIN_EMAIL) {
    errors.push('ADMIN_EMAIL ist nicht gesetzt');
  }
  
  if (!process.env.ADMIN_PASSWORD) {
    errors.push('ADMIN_PASSWORD ist nicht gesetzt');
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    warnings.push('E-Mail-Service nicht konfiguriert - Review-Benachrichtigungen eingeschränkt');
  }
  
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    warnings.push('Google Places API Key fehlt - Review-Monitoring deaktiviert');
  }

  return { warnings, errors };
}

// Start Server
async function startServer() {
  try {
    logger.info('Server initialization starting...');
    
    // Security validation
    const { warnings, errors } = validateSecurityConfig();
    
    if (warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      warnings.forEach(w => console.log(`   - ${w}`));
    }
    
    if (errors.length > 0 && process.env.NODE_ENV === 'production') {
      console.log('\n❌ CRITICAL ERRORS:');
      errors.forEach(e => console.log(`   - ${e}`));
      
      app.get('*', (req, res) => {
        res.status(503).json({
          success: false,
          message: 'Server im Wartungsmodus - Konfiguration erforderlich',
          errors: process.env.NODE_ENV === 'development' ? errors : undefined
        });
      });
      
      app.listen(PORT, () => {
        logger.error(`Server im WARTUNGSMODUS auf Port ${PORT}`);
      });
      return;
    }

    // Security Headers
    logger.info('Setting up security headers...');
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    // CORS Configuration
    logger.info('Configuring CORS...');
    const corsOptions = {
      origin: function (origin, callback) {
        const allowedOrigins = [
          'https://lt-express.de',
          'http://lt-express.de',
          process.env.FRONTEND_URL,
          'http://localhost:3000',
          'http://localhost:5173'
        ].filter(Boolean);
        
        logger.debug(`CORS check for origin: ${origin}`);
        
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

    // Request logging
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      app.use((req, res, next) => {
        const start = Date.now();
        logger.debug(`Incoming: ${req.method} ${req.path}`);
        res.on('finish', () => {
          const duration = Date.now() - start;
          logger.debug(`Completed: ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        });
        next();
      });
    }

    // Health Check
    app.get('/health', async (req, res) => {
      logger.info('Health check requested');
      
      try {
        const { sequelize } = require('./src/models');
        const dbPath = sequelize.databasePath || sequelize.config.storage || 'unknown';
        const dbExists = fs.existsSync(dbPath);
        const dbStats = dbExists ? fs.statSync(dbPath) : null;
        
        const healthData = {
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
            reviewMonitor: 'checking...'
          }
        };
        
        logger.info('Health check data:', healthData);
        res.json(healthData);
      } catch (error) {
        logger.error('Health check error:', error);
        res.status(500).json({ status: 'error', message: error.message });
      }
    });

    // ===== DATABASE INITIALIZATION =====
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATABASE INITIALIZATION');
    console.log('='.repeat(60));
    
    try {
      logger.info('Loading database models...');
      
      // WICHTIG: Models laden löst database.js aus
      const { sequelize, User, Restaurant, Table, Plan, QRCode, Scan, ReviewNotification } = require('./src/models');
      
      logger.info('Models loaded successfully');
      logger.info('Testing database connection...');
      
      await sequelize.authenticate();
      logger.info('✅ Database connection established');
      
      // Database Info
      const dbPath = sequelize.databasePath || sequelize.config.storage || 'unknown';
      logger.info(`📁 Database path: ${dbPath}`);
      
      const dbExists = fs.existsSync(dbPath);
      
      if (!dbExists) {
        logger.warn('🆕 Database does not exist - creating new database...');
        await sequelize.sync({ force: true });
        logger.info('✅ New database created');
      } else {
        logger.info('✅ Using existing database');
        const stats = fs.statSync(dbPath);
        logger.info(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        logger.info(`   Last modified: ${stats.mtime.toISOString()}`);
        
        // Schema update without data loss
        logger.info('Updating database schema...');
        await sequelize.sync({ alter: true });
        logger.info('✅ Database schema updated');
      }

      // Create Admin User
      logger.info('Checking admin user...');
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (adminEmail && adminPassword) {
        try {
          const existingAdmin = await User.findOne({
            where: { email: adminEmail.toLowerCase().trim() }
          });

          if (!existingAdmin) {
            logger.info('Creating new admin user...');
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
          } else {
            logger.info(`✅ Admin already exists: ${adminEmail}`);
            
            // Update last_review_count falls nötig
            const restaurantCount = await Restaurant.count();
            logger.info(`   Found ${restaurantCount} restaurants in database`);
          }
        } catch (adminError) {
          logger.error('Admin user error:', adminError);
        }
      } else {
        logger.warn('⚠️ Admin credentials not set - skipping admin creation');
      }

      // Create Default Plans
      logger.info('Checking default plans...');
      const planCount = await Plan.count();
      
      if (planCount === 0) {
        logger.info('Creating default plans...');
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
      } else {
        logger.info(`✅ ${planCount} plans already exist`);
      }
      
      // Database Statistics
      const stats = {
        users: await User.count(),
        restaurants: await Restaurant.count(),
        tables: await Table.count(),
        qrcodes: await QRCode.count(),
        scans: await Scan.count()
      };
      
      console.log('\n📊 DATABASE STATISTICS:');
      Object.entries(stats).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
      
    } catch (dbError) {
      logger.error('❌ Database initialization failed:', dbError);
      logger.error('Stack trace:', dbError.stack);
      
      if (process.env.NODE_ENV === 'production') {
        logger.error('❌ CRITICAL: Cannot continue without database!');
        process.exit(1);
      }
    }

    // ===== API ROUTES =====
    console.log('\n' + '='.repeat(60));
    console.log('🔌 LOADING API ROUTES');
    console.log('='.repeat(60));
    
    logger.info('Loading API routes...');
    
    app.use('/api/admin', (req, res, next) => {
      logger.debug(`[ADMIN] ${req.method} ${req.path}`);
      next();
    }, require('./src/routes/admin'));
    logger.info('   ✅ Admin routes loaded');

    app.use('/api/restaurant', (req, res, next) => {
      logger.debug(`[RESTAURANT] ${req.method} ${req.path}`);
      next();
    }, require('./src/routes/restaurant'));
    logger.info('   ✅ Restaurant routes loaded');

    app.use('/api/public', (req, res, next) => {
      logger.debug(`[PUBLIC] ${req.method} ${req.path}`);
      next();
    }, require('./src/routes/public'));
    logger.info('   ✅ Public routes loaded');

    // Static files
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    logger.info('   ✅ Static files configured');

    // ===== BACKGROUND SERVICES =====
    console.log('\n' + '='.repeat(60));
    console.log('🔧 STARTING BACKGROUND SERVICES');
    console.log('='.repeat(60));
    
    // NUR Review Monitor Service - KEINE anderen Services!
    try {
      logger.info('Loading Review Monitor Service...');
      const reviewMonitor = require('./src/services/review-monitor.service');
      
      if (process.env.GOOGLE_PLACES_API_KEY) {
        await reviewMonitor.start();
        logger.info('✅ Review Monitor Service started');
        logger.info('   Check interval: 2 minutes');
        logger.info('   E-Mails: NUR bei neuen Google-Bewertungen');
        logger.info('   KEINE E-Mails bei QR-Code Scans!');
      } else {
        logger.warn('⚠️ Review Monitor disabled - Google API Key missing');
        logger.warn('   Set GOOGLE_PLACES_API_KEY to enable');
      }
    } catch (serviceError) {
      logger.error('Review Monitor Error:', serviceError.message);
      logger.error('   Service will be disabled');
    }
    
    // DEAKTIVIERT: Andere Services die E-Mails beim Scan senden
    console.log('\n🚫 DEAKTIVIERTE SERVICES:');
    console.log('   ❌ QR Code Service (sendete E-Mails beim Scan)');
    console.log('   ❌ Scan Notification Service (sendete E-Mails beim Scan)');
    console.log('   ❌ Smart Review Service (alternativer Service)');
    
    // Keep-Alive Service (für Render) - sendet KEINE E-Mails
    if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
      try {
        logger.info('Loading Keep-Alive Service...');
        const keepAliveService = require('./src/services/keep-alive.service');
        keepAliveService.start();
        logger.info('✅ Keep-Alive service started (14 min interval)');
      } catch (serviceError) {
        logger.warn('Keep-Alive service not available:', serviceError.message);
      }
    }

    // Email Service Check (nur für Status)
    try {
      logger.info('Checking Email Service...');
      const emailService = require('./src/services/email.service');
      if (emailService.isConfigured) {
        logger.info('✅ Email Service configured (nur für Review-Benachrichtigungen)');
      } else {
        logger.warn('⚠️ Email Service not configured - check SMTP settings');
      }
    } catch (e) {
      logger.error('Email Service error:', e.message);
    }
    // ===== ERROR HANDLERS =====
    
    // 404 Handler
    app.use((req, res) => {
      logger.warn(`404 Not Found: ${req.method} ${req.path}`);
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

    // ===== START SERVER =====
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ SERVER SUCCESSFULLY STARTED');
      console.log('='.repeat(60));
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log('='.repeat(60));
      
      console.log('\n📊 SERVICE STATUS:');
      console.log(`   Review Monitor: ${process.env.GOOGLE_PLACES_API_KEY ? '✅ Active' : '❌ Disabled'}`);
      console.log(`   Email Service: ${process.env.SMTP_USER ? '✅ Configured' : '❌ Not configured'}`);
      console.log(`   Keep-Alive: ${process.env.RENDER ? '✅ Active' : '⭕ Not needed'}`);
      
      console.log('\n🔍 MONITORING:');
      console.log(`   Health Check: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}/health`);
      console.log(`   Logs: Check console output`);
      console.log('='.repeat(60));
      console.log('\n✅ READY TO ACCEPT REQUESTS\n');
    });

    // ===== GRACEFUL SHUTDOWN =====
    const gracefulShutdown = async (signal) => {
      console.log('\n' + '='.repeat(60));
      logger.info(`${signal} received, shutting down gracefully...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      try {
        // Stop services
        logger.info('Stopping background services...');
        
        const reviewMonitor = require('./src/services/review-monitor.service');
        if (reviewMonitor && reviewMonitor.stop) {
          reviewMonitor.stop();
          logger.info('   Review Monitor stopped');
        }
        
        const keepAliveService = require('./src/services/keep-alive.service');
        if (keepAliveService && keepAliveService.stop) {
          keepAliveService.stop();
          logger.info('   Keep-Alive stopped');
        }
        
        // Close database
        logger.info('Closing database connection...');
        const { sequelize } = require('./src/models');
        await sequelize.close();
        logger.info('   Database connection closed');
        
        console.log('='.repeat(60));
        console.log('👋 SHUTDOWN COMPLETE');
        console.log('='.repeat(60));
        
      } catch (error) {
        logger.error('Shutdown error:', error);
      }
      
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('❌ UNCAUGHT EXCEPTION:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    });

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    logger.error('❌ FATAL: Server startup failed:', error);
    logger.error('Stack trace:', error.stack);
    console.log('='.repeat(60));
    process.exit(1);
  }
}

// ===== START THE SERVER =====
console.log('🚀 Initiating server startup...\n');
startServer().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});