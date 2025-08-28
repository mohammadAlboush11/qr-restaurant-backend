/**
 * Main Server File - Mit robuster Datenbank-Initialisierung
 * Speichern als: backend/server.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===========================
// MIDDLEWARE
// ===========================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://lt-express.de',
    'https://lt-express.de',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ===========================
// HEALTH CHECK
// ===========================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: 'sqlite'
  });
});

// ===========================
// DATABASE INITIALIZATION
// ===========================
const initializeDatabase = async () => {
  try {
    // Import models AFTER ensuring database exists
    const { sequelize, User, Restaurant, Table, QRCode, Payment, Subscription, Plan } = require('./src/models');
    const bcrypt = require('bcryptjs');
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Check if database needs migration or sync
    const dbPath = path.join(__dirname, 'database.sqlite');
    const dbExists = fs.existsSync(dbPath);
    
    if (!dbExists) {
      console.log('📦 Creating new database...');
      await sequelize.sync({ force: true });
    } else {
      console.log('🔄 Updating existing database structure...');
      // Use alter to update schema without data loss
      try {
        await sequelize.sync({ alter: true });
      } catch (alterError) {
        console.error('⚠️ Alter failed, trying force sync...', alterError.message);
        
        // If alter fails, ask user or force in development
        if (process.env.NODE_ENV === 'development' || process.env.FORCE_DB_RESET === 'true') {
          console.log('🔄 Force syncing database (data will be lost)...');
          await sequelize.sync({ force: true });
        } else {
          console.error('❌ Database schema update failed. Please run: npm run reset-db');
          throw alterError;
        }
      }
    }
    
    console.log('✅ Database models synchronized');

    // Create default admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@lt-express.de';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    
    try {
      const existingAdmin = await User.findOne({
        where: { email: adminEmail }
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await User.create({
          email: adminEmail,
          password: hashedPassword,
          name: 'Super Admin',
          role: 'super_admin',
          is_active: true,
          is_email_verified: true,
          email_verified_at: new Date()
        });
        console.log(`✅ Default admin created: ${adminEmail}`);
      } else {
        console.log(`ℹ️ Admin already exists: ${adminEmail}`);
      }
    } catch (userError) {
      console.error('⚠️ Could not create/check admin user:', userError.message);
    }



    // Nach dem Admin-User erstellen, füge Test-Restaurant hinzu
  try {
    const { Restaurant, User } = require('./src/models');
    
    // Erstelle Test-Restaurant wenn nicht vorhanden
    let testRestaurant = await Restaurant.findByPk(1);
    
    if (!testRestaurant) {
      testRestaurant = await Restaurant.create({
        id: 1,
        name: 'Demo Restaurant',
        slug: 'demo-restaurant',
        email: 'qmnachhilfe@gmail.com',
        phone: '+49 123 456789',
        address: 'Musterstraße 1, 12345 Berlin',
        is_active: true,
        subscription_status: 'trial',
        google_review_url: '',
        notification_email: 'qmnachhilfe@gmail.com'
      });
      console.log('✅ Test Restaurant erstellt');
    }
    
    // Verknüpfe User mit Restaurant
    const restaurantUser = await User.findOne({
      where: { email: 'qmnachhilfe@gmail.com' }
    });
    
    if (restaurantUser && !restaurantUser.restaurant_id) {
      await restaurantUser.update({ 
        restaurant_id: testRestaurant.id,
        role: 'restaurant_owner'
      });
      console.log('✅ User mit Restaurant verknüpft');
    }
    
  } catch (error) {
    console.error('⚠️ Restaurant-Setup fehlgeschlagen:', error.message);
  }

    // Create default plans if they don't exist
    try {
      const planCount = await Plan.count();
      if (planCount === 0) {
        const defaultPlans = [
          {
            name: 'Basic',
            price: 29.99,
            duration_months: 1,
            max_tables: 10,
            features: ['QR-Code Generation', 'Email Notifications', 'Basic Analytics'],
            is_active: true,
            display_order: 1
          },
          {
            name: 'Professional',
            price: 59.99,
            duration_months: 1,
            max_tables: 50,
            features: ['QR-Code Generation', 'Email Notifications', 'Advanced Analytics', 'Custom Branding', 'Priority Support'],
            is_active: true,
            display_order: 2
          },
          {
            name: 'Enterprise',
            price: 99.99,
            duration_months: 1,
            max_tables: 999,
            features: ['Unlimited QR-Codes', 'Email Notifications', 'Full Analytics Suite', 'Custom Branding', 'API Access', 'Dedicated Support'],
            is_active: true,
            display_order: 3
          }
        ];
        
        for (const planData of defaultPlans) {
          await Plan.create(planData);
          console.log(`✅ Plan "${planData.name}" created`);
        }
      }
    } catch (planError) {
      console.error('⚠️ Could not create plans:', planError.message);
    }

    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
};

// ===========================
// START SERVER
// ===========================
const startServer = async () => {
  try {
    // Initialize database
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      console.error('Failed to initialize database.');
      console.error('Please try one of the following:');
      console.error('1. Delete database.sqlite and restart');
      console.error('2. Run: npm run reset-db');
      console.error('3. Set FORCE_DB_RESET=true in .env');
      process.exit(1);
    }

    // ===========================
    // API ROUTES (After DB Init)
    // ===========================
    
    // Admin Routes
    const adminRoutes = require('./src/routes/admin');
    app.use('/api/admin', adminRoutes);

    // Restaurant Routes
    const restaurantRoutes = require('./src/routes/restaurant');
    app.use('/api/restaurant', restaurantRoutes);

    // Public Routes
    const publicRoutes = require('./src/routes/public');
    app.use('/api/public', publicRoutes);

    // ===========================
    // ERROR HANDLING
    // ===========================

    // 404 Handler
    app.use((req, res, next) => {
      console.error(`404 - Route not found: ${req.method} ${req.path}`);
      res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.path}`
      });
    });

    // Global Error Handler
    app.use((error, req, res, next) => {
      console.error('Global Error Handler:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });

    // Start listening
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
      console.log(`🎨 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log('='.repeat(50));
      console.log('\n📧 Default Admin Credentials:');
      console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@lt-express.de'}`);
      console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'Admin123!'}`);
      console.log('='.repeat(50) + '\n');
    });

    // Initialize services
    const emailService = require('./src/services/email.service');
    if (emailService.isConfigured) {
      console.log('✅ Email service initialized');
    } else {
      console.log('⚠️ Email service not configured (SMTP credentials missing)');
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();