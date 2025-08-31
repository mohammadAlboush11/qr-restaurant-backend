const express = require('express');
const router = express.Router();
const { User, Restaurant, Payment, Table, QRCode, Subscription, Plan, Scan } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

const JWT_SECRET = process.env.JWT_SECRET ;

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

// GET CURRENT USER - FEHLTE!
router.get('/auth/me', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Benutzer nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Get Current User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Benutzerdaten'
    });
  }
});

// LOGOUT - FEHLTE!
router.post('/auth/logout', [authenticateToken], async (req, res) => {
  try {
    // Here you could blacklist the token if using a token blacklist
    // For now, just return success
    res.json({
      success: true,
      message: 'Erfolgreich abgemeldet'
    });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abmelden'
    });
  }
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
      totalScans,
      totalPayments,
      totalRevenue
    ] = await Promise.all([
      Restaurant.count(),
      Restaurant.count({ where: { is_active: true } }),
      User.count(),
      Table.count(),
      Scan.count(),
      Payment.count(),
      Payment.sum('amount') || 0
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalRestaurants,
          activeRestaurants,
          inactiveRestaurants: totalRestaurants - activeRestaurants,
          totalUsers,
          totalTables,
          totalScans,
          totalPayments,
          totalRevenue
        }
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
// SYSTEM HEALTH
// ============================
router.get('/system/health', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    let dbStatus = 'healthy';
    try {
      await sequelize.authenticate();
    } catch (error) {
      dbStatus = 'unhealthy';
    }

    res.json({
      success: true,
      data: {
        status: { 
          database: dbStatus, 
          overall: dbStatus 
        },
        server: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        }
      }
    });
  } catch (error) {
    console.error('Health Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Health Check fehlgeschlagen'
    });
  }
});

router.get('/health', [authenticateToken, requireAdmin], async (req, res) => {
  res.json({
    success: true,
    data: {
      status: {
        database: 'healthy',
        overall: 'healthy'
      }
    }
  });
});

// ============================
// RESTAURANTS
// ============================
router.get('/restaurants', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const restaurants = await Restaurant.findAll({
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: restaurants
    });
  } catch (error) {
    console.error('Get Restaurants Error:', error);
    res.status(500).json({
      success: false,
      message: 'Restaurants konnten nicht geladen werden'
    });
  }
});

// Ersetze die POST /restaurants Route (Zeile ~240-320) mit dieser Version:

router.post('/restaurants', [authenticateToken, requireAdmin], async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      name, email, phone, address,
      google_review_url, google_business_url,
      owner_email, owner_password, owner_name,
      notification_email
    } = req.body;

    // VALIDATION: Required fields
    if (!name || name.trim() === '') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Restaurant-Name ist erforderlich'
      });
    }

    // Determine email to use
    const loginEmail = owner_email || email;
    const loginPassword = owner_password;
    
    // VALIDATION: Email required and valid
    if (!loginEmail || loginEmail.trim() === '') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'E-Mail-Adresse ist erforderlich'
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Ungültiges E-Mail-Format'
      });
    }

    // VALIDATION: Password if provided
    if (loginPassword && loginPassword.length < 6) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Passwort muss mindestens 6 Zeichen lang sein'
      });
    }

    // Generate unique slug with timestamp to avoid conflicts
    const baseSlug = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Add timestamp for uniqueness if needed
    let slug = baseSlug;
    let slugExists = await Restaurant.findOne({ where: { slug } });
    let counter = 1;
    
    while (slugExists) {
      slug = `${baseSlug}-${Date.now()}-${counter}`;
      slugExists = await Restaurant.findOne({ where: { slug } });
      counter++;
    }

    // Check for duplicate email
    const existingRestaurant = await Restaurant.findOne({
      where: { email: loginEmail }
    });
    
    if (existingRestaurant) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'E-Mail bereits vergeben'
      });
    }

    // Check for duplicate user email
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
    }

    // Create restaurant with validated data
    const restaurant = await Restaurant.create({
      name: name.trim(),
      slug: slug,
      email: loginEmail.toLowerCase().trim(),
      phone: phone || null,
      address: address || null,
      google_review_url: google_review_url || google_business_url || null,
      notification_email: notification_email || loginEmail.toLowerCase().trim(),
      is_active: true,
      subscription_status: 'trial'
    }, { transaction });

    // Create user if credentials provided
    if (loginEmail && loginPassword) {
      const hashedPassword = await bcrypt.hash(loginPassword, 10);
      
      const user = await User.create({
        email: loginEmail.toLowerCase().trim(),
        password: hashedPassword,
        name: owner_name || name.trim(),
        role: 'restaurant_owner',
        restaurant_id: restaurant.id,
        is_active: true
      }, { transaction });

      await restaurant.update({ owner_id: user.id }, { transaction });
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: {
        restaurant: restaurant.toJSON(),
        id: restaurant.id
      },
      message: `Restaurant "${name}" wurde erfolgreich erstellt`,
      credentials: loginEmail && loginPassword ? {
        email: loginEmail,
        password: loginPassword
      } : null
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create Restaurant Error:', error);
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validierungsfehler: ' + error.errors.map(e => e.message).join(', ')
      });
    }
    
    // Handle unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Ein Restaurant mit diesen Daten existiert bereits'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Restaurant konnte nicht erstellt werden'
    });
  }
});
// Fortsetzung...

router.get('/restaurants/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'email', 'name', 'phone']
      }]
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    // Format response to include owner data
    const responseData = {
      ...restaurant.toJSON(),
      owner_name: restaurant.owner?.name || restaurant.owner_name,
      owner_email: restaurant.owner?.email || restaurant.email,
      owner_phone: restaurant.owner?.phone || ''
    };

    res.json({
      success: true,
      data: responseData
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

// STATUS TOGGLE - Both methods
router.patch('/restaurants/:id/status', [authenticateToken, requireAdmin], async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const restaurant = await Restaurant.findByPk(id);
    
    if (!restaurant) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }
    
    await restaurant.update({ is_active: !!is_active }, { transaction });
    
    // Handle related entities
    const tables = await Table.findAll({
      where: { restaurant_id: id },
      attributes: ['id'],
      transaction
    });
    
    const tableIds = tables.map(t => t.id);
    
    if (tableIds.length > 0) {
      await QRCode.update(
        { is_active: !!is_active },
        { where: { table_id: tableIds }, transaction }
      );
    }
    
    await User.update(
      { is_active: !!is_active },
      { where: { restaurant_id: id }, transaction }
    );
    
    await transaction.commit();
    
    res.json({
      success: true,
      message: `Restaurant ${is_active ? 'aktiviert' : 'deaktiviert'}`,
      data: restaurant
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Status Toggle Error:', error);
    res.status(500).json({
      success: false,
      message: 'Status konnte nicht geändert werden'
    });
  }
});

router.post('/restaurants/:id/status', [authenticateToken, requireAdmin], async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const restaurant = await Restaurant.findByPk(id);
    
    if (!restaurant) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }
    
    await restaurant.update({ is_active: !!is_active }, { transaction });
    
    const tables = await Table.findAll({
      where: { restaurant_id: id },
      attributes: ['id'],
      transaction
    });
    
    const tableIds = tables.map(t => t.id);
    
    if (tableIds.length > 0) {
      await QRCode.update(
        { is_active: !!is_active },
        { where: { table_id: tableIds }, transaction }
      );
    }
    
    await User.update(
      { is_active: !!is_active },
      { where: { restaurant_id: id }, transaction }
    );
    
    await transaction.commit();
    
    res.json({
      success: true,
      message: `Restaurant ${is_active ? 'aktiviert' : 'deaktiviert'}`,
      data: restaurant
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Status Toggle Error:', error);
    res.status(500).json({
      success: false,
      message: 'Status konnte nicht geändert werden'
    });
  }
});

// DELETE Restaurant
router.delete('/restaurants/:id', [authenticateToken, requireAdmin], async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const restaurant = await Restaurant.findByPk(id);
    
    if (!restaurant) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }
    
    // Delete in correct order
    const tables = await Table.findAll({
      where: { restaurant_id: id },
      attributes: ['id'],
      transaction
    });
    
    const tableIds = tables.map(t => t.id);
    
    if (tableIds.length > 0) {
      await Scan.destroy({ where: { table_id: tableIds }, transaction });
      await QRCode.destroy({ where: { table_id: tableIds }, transaction });
    }
    
    await Table.destroy({ where: { restaurant_id: id }, transaction });
    await Payment.destroy({ where: { restaurant_id: id }, transaction });
    await Subscription.destroy({ where: { restaurant_id: id }, transaction });
    await User.destroy({ where: { restaurant_id: id }, transaction });
    await restaurant.destroy({ transaction });
    
    await transaction.commit();
    
    res.json({
      success: true,
      message: 'Restaurant erfolgreich gelöscht'
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
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        payments,
        summary: {
          total_amount: payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2)
        }
      }
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

// ============================
// PLANS (Optional Feature)
// ============================
router.get('/plans', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const plans = await Plan.findAll({
      where: { is_active: true },
      order: [['price', 'ASC']]
    });
    
    res.json({
      success: true,
      data: plans || []
    });
  } catch (error) {
    console.error('Get Plans Error:', error);
    res.status(500).json({
      success: false,
      message: 'Plans konnten nicht geladen werden'
    });
  }
});

router.post('/plans', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const { name, slug, price, duration_months, max_tables, features } = req.body;
    
    // Generate unique slug if not provided
    const planSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    const plan = await Plan.create({
      name,
      slug: planSlug,
      price: price || 0,
      duration_months: duration_months || 1,
      max_tables: max_tables || 10,
      features: features || [],
      is_active: true
    });
    
    res.status(201).json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Create Plan Error:', error);
    res.status(500).json({
      success: false,
      message: 'Plan konnte nicht erstellt werden'
    });
  }
});

module.exports = router;