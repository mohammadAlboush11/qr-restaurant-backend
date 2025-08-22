const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./src/models');
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const restaurantRoutes = require('./src/routes/restaurant.routes');
const publicRoutes = require('./src/routes/public.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Konfiguration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://lt-express.de',
      'https://www.lt-express.de',
      'http://localhost:3000'
    ];
    // Allow requests with no origin (mobile apps, postman, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Temporär für Tests
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
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
    features: {
      googleApi: 'NOT_REQUIRED',
      emailNotifications: 'ACTIVE',
      qrCodeTracking: 'ACTIVE'
    }
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ 
    message: 'Etwas ist schief gelaufen!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Server starten
async function startServer() {
  try {
    console.log('🚀 Starte QR Restaurant System...');
    console.log('================================');
    
    // Datenbankverbindung
    await sequelize.authenticate();
    console.log('✅ Datenbank verbunden (SQLite)');
    
    // Tabellen erstellen/aktualisieren
    await sequelize.sync({ alter: true });
    console.log('✅ Datenbank-Tabellen synchronisiert');
    
    // Admin-Account prüfen/erstellen
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
      console.log('✅ Admin-Account erstellt');
      console.log(`   E-Mail: ${adminEmail}`);
      console.log(`   Passwort: ${adminPassword}`);
      console.log('⚠️  WICHTIG: Passwort nach erstem Login ändern!');
    } else {
      console.log('✅ Admin-Account vorhanden');
    }
    
    // E-Mail-Konfiguration prüfen
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      console.log('✅ E-Mail-Service konfiguriert');
      console.log(`   SMTP-Host: ${process.env.SMTP_HOST}`);
      console.log(`   SMTP-User: ${process.env.SMTP_USER}`);
    } else {
      console.log('⚠️  E-Mail-Service nicht konfiguriert!');
      console.log('   Bitte SMTP_USER und SMTP_PASS in .env setzen');
    }
    
    // Server starten
    app.listen(PORT, '0.0.0.0', () => {
      console.log('================================');
      console.log('✅ Server läuft!');
      console.log(`   Lokal: http://localhost:${PORT}`);
      console.log(`   API: https://api.lt-express.de`);
      console.log('================================');
      console.log('📌 Funktionen OHNE Google API:');
      console.log('   • QR-Code Scans werden getrackt');
      console.log('   • E-Mail bei jedem Scan (mit 5 Min Spam-Schutz)');
      console.log('   • Weiterleitung zu Google Reviews');
      console.log('================================');
    });
  } catch (error) {
    console.error('❌ Server Start Fehler:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('⏹️  SIGTERM empfangen, fahre herunter...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⏹️  SIGINT empfangen, fahre herunter...');
  await sequelize.close();
  process.exit(0);
});

// Server starten
startServer();