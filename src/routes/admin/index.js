/**
 * Admin Routes - KOMPLETT
 * Speichern als: backend/src/routes/admin/index.js
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Restaurant, Table, Payment } = require('../../models');
const emailService = require('../../services/email.service');

// Middleware
let authMiddleware = {
  requireAdmin: (req, res, next) => {
    // Fallback für Testing
    req.user = { id: 1, role: 'admin' };
    next();
  }
};

try {
  authMiddleware = require('../../middleware/auth.middleware');
} catch (error) {
  console.log('⚠️ Auth Middleware nicht gefunden - verwende Fallback');
}

// ============================
// TEST ROUTE
// ============================
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Admin Routes funktionieren!',
    timestamp: new Date().toISOString()
  });
});

// ============================
// AUTH ROUTES
// ============================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'E-Mail und Passwort erforderlich'
      });
    }

    const user = await User.findOne({
      where: { 
        email: email.toLowerCase().trim(),
        role: 'admin'
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Ungültige Anmeldedaten'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Ungültige Anmeldedaten'
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Admin Login erfolgreich',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Admin Login Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Login fehlgeschlagen'
    });
  }
});

// ============================
// EMAIL TEST ROUTES
// ============================
router.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    const testEmail = to || process.env.ADMIN_EMAIL || 'qmnachhilfe@gmail.com';
    
    console.log(`📧 Test-E-Mail angefordert für: ${testEmail}`);
    
    const status = emailService.getStatus ? emailService.getStatus() : { isConfigured: false };
    console.log('📊 E-Mail Service Status:', status);
    
    if (!status.isConfigured) {
      return res.status(503).json({
        success: false,
        message: 'E-Mail Service nicht konfiguriert',
        status: status,
        hint: 'Prüfen Sie SMTP_USER und SMTP_PASS in den Environment Variables'
      });
    }
    
    const result = await emailService.sendTestEmail(testEmail);
    
    if (result) {
      res.json({
        success: true,
        message: `Test-E-Mail erfolgreich gesendet an ${testEmail}`,
        status: status
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'E-Mail konnte nicht gesendet werden',
        status: status,
        hint: 'Prüfen Sie die Logs für Details'
      });
    }
    
  } catch (error) {
    console.error('❌ Test-E-Mail Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Senden der Test-E-Mail',
      error: error.message
    });
  }
});

router.get('/email-status', (req, res) => {
  try {
    const status = emailService.getStatus ? emailService.getStatus() : {
      isConfigured: false,
      message: 'E-Mail Service nicht verfügbar'
    };
    
    res.json({
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen des E-Mail Status',
      error: error.message
    });
  }
});

// ============================
// DASHBOARD
// ============================
router.get('/dashboard', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const userCount = await User.count();
    const restaurantCount = await Restaurant.count();
    const activeRestaurants = await Restaurant.count({ where: { is_active: true } });
    const tableCount = await Table.count();
    
    res.json({
      success: true,
      data: {
        statistics: {
          total_users: userCount,
          total_restaurants: restaurantCount,
          active_restaurants: activeRestaurants,
          total_tables: tableCount
        }
      }
    });
  } catch (error) {
    console.error('Dashboard Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden des Dashboards'
    });
  }
});

// ============================
// RESTAURANT MANAGEMENT
// ============================
router.get('/restaurants', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const restaurants = await Restaurant.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'name'] },
        { model: Table, as: 'tables' }
      ]
    });

    res.json({
      success: true,
      data: restaurants.map(r => ({
        ...r.toJSON(),
        tables_count: r.tables ? r.tables.length : 0
      }))
    });
  } catch (error) {
    console.error('Get Restaurants Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Restaurants'
    });
  }
});

router.put('/restaurants/:id/activate', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findByPk(id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    await restaurant.update({ is_active: true });
    
    res.json({
      success: true,
      message: 'Restaurant aktiviert',
      data: restaurant
    });
  } catch (error) {
    console.error('Activate Restaurant Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Aktivieren des Restaurants'
    });
  }
});

router.put('/restaurants/:id/deactivate', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findByPk(id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    await restaurant.update({ is_active: false });
    
    res.json({
      success: true,
      message: 'Restaurant deaktiviert',
      data: restaurant
    });
  } catch (error) {
    console.error('Deactivate Restaurant Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Deaktivieren des Restaurants'
    });
  }
});

// ============================
// USER MANAGEMENT
// ============================
router.get('/users', authMiddleware.requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }]
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get Users Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Benutzer'
    });
  }
});

// ============================
// 404 HANDLER
// ============================
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Admin Route nicht gefunden',
    path: req.originalUrl
  });
});

console.log('✅ Admin Routes Modul geladen');
module.exports = router;