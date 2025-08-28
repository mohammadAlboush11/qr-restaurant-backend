/**
 * Admin Routes Index - Vollständige Version
 * Speichern als: backend/src/routes/admin/index.js
 */

const express = require('express');
const router = express.Router();
const { User, Restaurant, Payment, Table, QRCode, Subscription, Plan, ActivityLog } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ============================
// MIDDLEWARE
// ============================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Kein Token vorhanden'
      });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'Token ungültig'
        });
      }

      const user = await User.findByPk(decoded.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role
      };
      
      next();
    });
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentifizierungsfehler'
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({
      success: false,
      message: 'Keine Admin-Berechtigung'
    });
  }
  next();
};

// ============================
// AUTH ROUTES
// ============================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Admin Login Attempt:', email);

    const user = await User.findOne({
      where: { 
        email: email.toLowerCase().trim(),
        role: { [Op.in]: ['admin', 'super_admin'] }
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
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Activity Log
    await ActivityLog.logActivity({
      user_id: user.id,
      action: 'admin_login',
      category: 'auth',
      severity: 'info',
      ip_address: req.ip
    });

    console.log('✅ Admin Login Successful:', user.email);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login fehlgeschlagen'
    });
  }
});

router.post('/auth/validate', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: { user: req.user }
  });
});

// ============================
// DASHBOARD
// ============================
router.get('/dashboard', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const [
      totalRestaurants,
      activeRestaurants,
      totalUsers,
      totalTables,
      totalPayments,
      totalRevenue
    ] = await Promise.all([
      Restaurant.count(),
      Restaurant.count({ where: { is_active: true } }),
      User.count(),
      Table.count(),
      Payment.count(),
      Payment.sum('amount') || 0
    ]);

    // Top Restaurants nach Tabellen
    const topRestaurants = await Restaurant.findAll({
      attributes: [
        'id',
        'name',
        'subscription_status',
        [sequelize.literal('(SELECT COUNT(*) FROM tables WHERE tables.restaurant_id = Restaurant.id)'), 'table_count']
      ],
      order: [[sequelize.literal('table_count'), 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalRestaurants,
          activeRestaurants,
          inactiveRestaurants: totalRestaurants - activeRestaurants,
          totalUsers,
          totalTables,
          totalPayments,
          totalRevenue,
          totalScans: 0,
          recentScans: 0
        },
        topRestaurants: topRestaurants.map(r => ({
          id: r.id,
          name: r.name,
          subscription_status: r.subscription_status,
          table_count: r.dataValues.table_count || 0
        })),
        revenueByMonth: [],
        subscriptionsByPlan: [],
        recentActivities: []
      }
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({
      success: false,
      message: 'Dashboard-Daten konnten nicht geladen werden'
    });
  }
});

// ============================
// RESTAURANTS
// ============================
router.get('/restaurants', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const restaurants = await Restaurant.findAll({
      include: [
        {
          model: Table,
          as: 'tables',
          attributes: ['id']
        },
        {
          model: User,
          as: 'users',
          attributes: ['id', 'email', 'name', 'role']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: restaurants.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        email: r.email,
        phone: r.phone,
        address: r.address,
        is_active: r.is_active,
        subscription_status: r.subscription_status,
        tables_count: r.tables?.length || 0,
        users_count: r.users?.length || 0,
        created_at: r.created_at
      }))
    });
  } catch (error) {
    console.error('Get Restaurants Error:', error);
    res.status(500).json({
      success: false,
      message: 'Restaurants konnten nicht geladen werden'
    });
  }
});

router.post('/restaurants', [authenticateToken, requireAdmin], async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      name, email, phone, address,
      google_review_url, google_business_url,
      owner_email, owner_password, owner_name,
      user_email, user_password, user_name
    } = req.body;

    const loginEmail = owner_email || user_email;
    const loginPassword = owner_password || user_password;
    const loginName = owner_name || user_name || name;

    // Restaurant erstellen
    const restaurant = await Restaurant.create({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      email,
      phone,
      address,
      google_review_url: google_review_url || google_business_url,
      notification_email: email,
      is_active: true,
      subscription_status: 'trial'
    }, { transaction });

    // User erstellen wenn Daten vorhanden
    if (loginEmail && loginPassword) {
      const existingUser = await User.findOne({
        where: { email: loginEmail.toLowerCase().trim() }
      });

      if (existingUser) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `E-Mail "${loginEmail}" ist bereits vergeben`
        });
      }

      const user = await User.create({
        email: loginEmail.toLowerCase().trim(),
        password: loginPassword,
        name: loginName,
        role: 'restaurant_owner',
        restaurant_id: restaurant.id,
        is_active: true
      }, { transaction });

      await restaurant.update({ user_id: user.id }, { transaction });
    }

    await transaction.commit();

    // Activity Log
    await ActivityLog.logActivity({
      user_id: req.user.id,
      restaurant_id: restaurant.id,
      action: 'restaurant_created',
      category: 'admin',
      details: { restaurant_name: name }
    });

    res.json({
      success: true,
      data: restaurant,
      message: `Restaurant "${name}" wurde erfolgreich erstellt`,
      credentials: loginEmail ? {
        email: loginEmail,
        password: loginPassword
      } : null
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create Restaurant Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Restaurant konnte nicht erstellt werden'
    });
  }
});

router.get('/restaurants/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id, {
      include: [
        { model: User, as: 'users' },
        { model: Table, as: 'tables' },
        { model: Payment, as: 'payments' }
      ]
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    console.error('Get Restaurant Error:', error);
    res.status(500).json({
      success: false,
      message: 'Restaurant konnte nicht geladen werden'
    });
  }
});

router.put('/restaurants/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    await restaurant.update(req.body);

    res.json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    console.error('Update Restaurant Error:', error);
    res.status(500).json({
      success: false,
      message: 'Restaurant konnte nicht aktualisiert werden'
    });
  }
});

router.post('/restaurants/:id/status', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    const newStatus = req.body.is_active !== undefined ? 
      req.body.is_active : !restaurant.is_active;

    await restaurant.update({ is_active: newStatus });

    // Activity Log
    await ActivityLog.logActivity({
      user_id: req.user.id,
      restaurant_id: restaurant.id,
      action: newStatus ? 'restaurant_activated' : 'restaurant_deactivated',
      category: 'admin'
    });

    res.json({
      success: true,
      data: restaurant,
      message: `Restaurant wurde ${newStatus ? 'aktiviert' : 'deaktiviert'}`
    });
  } catch (error) {
    console.error('Toggle Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Status konnte nicht geändert werden'
    });
  }
});

router.delete('/restaurants/:id', [authenticateToken, requireAdmin], async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const restaurant = await Restaurant.findByPk(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    const restaurantName = restaurant.name;
    
    // Lösche alle zugehörigen Daten (CASCADE sollte das meiste erledigen)
    await Promise.all([
      User.destroy({ where: { restaurant_id: restaurant.id }, transaction }),
      restaurant.destroy({ transaction })
    ]);

    await transaction.commit();

    res.json({
      success: true,
      message: `Restaurant "${restaurantName}" wurde gelöscht`
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete Restaurant Error:', error);
    res.status(500).json({
      success: false,
      message: 'Restaurant konnte nicht gelöscht werden'
    });
  }
});

// ============================
// PAYMENTS
// ============================
router.get('/payments', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [{
        model: Restaurant,
        as: 'restaurant',
        attributes: ['id', 'name']
      }],
      order: [['payment_date', 'DESC']]
    });

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Get Payments Error:', error);
    res.status(500).json({
      success: false,
      message: 'Zahlungen konnten nicht geladen werden'
    });
  }
});

router.post('/payments', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const payment = await Payment.create({
      ...req.body,
      created_by: req.user.id
    });

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Create Payment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Zahlung konnte nicht erstellt werden'
    });
  }
});

// ============================
// USERS
// ============================
router.get('/users', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      include: [{
        model: Restaurant,
        as: 'restaurant',
        attributes: ['id', 'name']
      }],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Benutzer konnten nicht geladen werden'
    });
  }
});

// ============================
// SUBSCRIPTIONS
// ============================
router.get('/subscriptions', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const subscriptions = await Subscription.findAll({
      include: [
        {
          model: Restaurant,
          as: 'restaurant',
          attributes: ['id', 'name']
        },
        {
          model: Plan,
          as: 'plan'
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: subscriptions
    });
  } catch (error) {
    console.error('Get Subscriptions Error:', error);
    res.status(500).json({
      success: false,
      message: 'Abonnements konnten nicht geladen werden'
    });
  }
});

module.exports = router;