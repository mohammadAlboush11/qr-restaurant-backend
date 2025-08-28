/**
 * Restaurant Routes Index
 * Speichern als: backend/src/routes/restaurant/index.js
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireRestaurant } = require('../../middleware/auth.middleware');
const { User, Restaurant, Table, QRCode, Scan, Payment } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCodeGenerator = require('qrcode');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ============================
// AUTH ROUTES (OHNE MIDDLEWARE)
// ============================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Restaurant Login Attempt:', email);

    const user = await User.findOne({
      where: { 
        email: email.toLowerCase().trim(),
        role: ['restaurant', 'restaurant_owner']
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

    // Restaurant finden
    let restaurant = null;
    if (user.restaurant_id) {
      restaurant = await Restaurant.findByPk(user.restaurant_id);
    }

    // Check if restaurant is active
    if (restaurant && !restaurant.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant ist deaktiviert. Bitte kontaktieren Sie den Administrator.'
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        restaurant_id: restaurant?.id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Restaurant Login Successful:', user.email);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          restaurant_id: restaurant?.id
        },
        restaurant: restaurant ? {
          id: restaurant.id,
          name: restaurant.name,
          is_active: restaurant.is_active,
          subscription_status: restaurant.subscription_status
        } : null
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login fehlgeschlagen'
    });
  }
});

// Validate token
router.get('/auth/me', [authenticateToken], async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'name', 'role', 'restaurant_id']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Benutzer nicht gefunden'
      });
    }

    let restaurant = null;
    if (user.restaurant_id) {
      restaurant = await Restaurant.findByPk(user.restaurant_id);
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        restaurant: restaurant
      }
    });
  } catch (error) {
    console.error('Auth Me Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Benutzerdaten'
    });
  }
});

// ============================
// PROTECTED ROUTES (MIT MIDDLEWARE)
// ============================

// Dashboard
// Dashboard Route (korrigiert)
router.get('/dashboard', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    // Restaurant ist bereits in req.user.restaurant durch Middleware
    const restaurant = req.user.restaurant || 
                      await Restaurant.findByPk(req.user.restaurant_id, {
                        include: [{
                          model: Table,
                          as: 'tables'
                        }]
                      });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    // Lade Tabellen wenn noch nicht geladen
    if (!restaurant.tables) {
      const tables = await Table.findAll({
        where: { restaurant_id: restaurant.id }
      });
      restaurant.tables = tables;
    }

    const totalTables = restaurant.tables?.length || 0;
    const activeQRCodes = restaurant.tables?.filter(t => t.qr_code).length || 0;
    
    // Scans für heute
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalScans = restaurant.tables?.reduce((sum, t) => sum + (t.scan_count || 0), 0) || 0;
    
    // Recent Scans
    const recentScans = [];
    if (restaurant.tables) {
      for (const table of restaurant.tables.slice(0, 5)) {
        if (table.scan_count > 0) {
          recentScans.push({
            table_number: table.table_number,
            created_at: table.updated_at || new Date()
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          email: restaurant.email,
          phone: restaurant.phone,
          address: restaurant.address,
          is_active: restaurant.is_active,
          subscription_status: restaurant.subscription_status,
          google_review_url: restaurant.google_review_url
        },
        statistics: {
          total_tables: totalTables,
          total_scans: totalScans,
          today_scans: 0, // Vereinfacht für jetzt
          active_qr_codes: activeQRCodes
        },
        tables: restaurant.tables?.slice(0, 5).map(t => ({
          id: t.id,
          table_number: t.table_number,
          description: t.description,
          scan_count: t.scan_count || 0,
          qr_code: t.qr_code ? true : false
        })) || [],
        recent_scans: recentScans
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
// Get Restaurant Profile
// Get Restaurant Profile (korrigiert)
router.get('/profile', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    // Restaurant ist bereits in req.user.restaurant durch Middleware
    const restaurant = req.user.restaurant || 
                      await Restaurant.findByPk(req.user.restaurant_id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: {
        id: restaurant.id,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        address: restaurant.address,
        google_review_url: restaurant.google_review_url,
        notification_email: restaurant.notification_email || restaurant.email,
        is_active: restaurant.is_active,
        subscription_status: restaurant.subscription_status
      }
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Profil konnte nicht geladen werden'
    });
  }
});

// Update Restaurant Profile
router.put('/profile', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    const allowedFields = [
      'name', 'email', 'phone', 'address', 
      'google_business_url', 'notification_email'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    await restaurant.update(updates);

    res.json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Profil konnte nicht aktualisiert werden'
    });
  }
});

// ============================
// TABLE MANAGEMENT
// ============================

// Get all tables
// Get all tables (korrigiert)
router.get('/tables', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    // Restaurant ist bereits validiert durch Middleware
    const tables = await Table.findAll({
      where: { restaurant_id: req.user.restaurant_id },
      order: [['table_number', 'ASC']]
    });

    // Füge QR-Code Daten hinzu wenn vorhanden
    const tablesWithQR = tables.map(table => {
      const tableData = table.toJSON();
      
      // Prüfe ob QR-Code existiert
      if (table.qr_code) {
        tableData.qr_code = table.qr_code;
      }
      
      return tableData;
    });

    res.json({
      success: true,
      data: tablesWithQR
    });
  } catch (error) {
    console.error('Get Tables Error:', error);
    res.status(500).json({
      success: false,
      message: 'Tische konnten nicht geladen werden'
    });
  }
});
// Create table
router.post('/tables', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    const { table_number, description } = req.body;
    const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    // Check if restaurant is active
    if (!restaurant.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant ist deaktiviert. Neue Tische können nicht erstellt werden.'
      });
    }

    // Check if table number already exists
    const existingTable = await Table.findOne({
      where: {
        restaurant_id: restaurant.id,
        table_number: table_number
      }
    });

    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: 'Tischnummer bereits vorhanden'
      });
    }

    // Check table limit (150)
    const tableCount = await Table.count({
      where: { restaurant_id: restaurant.id }
    });

    if (tableCount >= 150) {
      return res.status(400).json({
        success: false,
        message: 'Maximale Anzahl von 150 Tischen erreicht'
      });
    }

    // Create table
    const table = await Table.create({
      restaurant_id: restaurant.id,
      table_number,
      description: description || `Tisch ${table_number}`,
      is_active: true,
      scan_count: 0
    });

    res.json({
      success: true,
      data: table,
      message: `Tisch ${table_number} wurde erstellt`
    });
  } catch (error) {
    console.error('Create Table Error:', error);
    res.status(500).json({
      success: false,
      message: 'Tisch konnte nicht erstellt werden'
    });
  }
});

// Update table
router.put('/tables/:id', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    const table = await Table.findOne({
      where: {
        id: req.params.id,
        restaurant_id: req.user.restaurant_id
      }
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Tisch nicht gefunden'
      });
    }

    const allowedFields = ['table_number', 'description', 'is_active'];
    const updates = {};
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    await table.update(updates);

    res.json({
      success: true,
      data: table
    });
  } catch (error) {
    console.error('Update Table Error:', error);
    res.status(500).json({
      success: false,
      message: 'Tisch konnte nicht aktualisiert werden'
    });
  }
});

// Delete table
router.delete('/tables/:id', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    const table = await Table.findOne({
      where: {
        id: req.params.id,
        restaurant_id: req.user.restaurant_id
      }
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Tisch nicht gefunden'
      });
    }

    // Deactivate all QR codes for this table
    await QRCode.update(
      { is_active: false },
      { where: { table_id: table.id } }
    );

    await table.destroy();

    res.json({
      success: true,
      message: `Tisch ${table.table_number} wurde gelöscht`
    });
  } catch (error) {
    console.error('Delete Table Error:', error);
    res.status(500).json({
      success: false,
      message: 'Tisch konnte nicht gelöscht werden'
    });
  }
});

// ============================
// QR CODE MANAGEMENT
// ============================

// Generate QR code for table
router.post('/qrcode/:tableId/generate', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    const { tableId } = req.params;
    
    const table = await Table.findOne({
      where: {
        id: tableId,
        restaurant_id: req.user.restaurant_id
      }
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Tisch nicht gefunden'
      });
    }

    const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
    
    if (!restaurant.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant ist deaktiviert. QR-Codes können nicht generiert werden.'
      });
    }

    // Deactivate old QR codes
    await QRCode.update(
      { is_active: false },
      { where: { table_id: tableId } }
    );

    // Generate unique code
    const code = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const redirectUrl = `${backendUrl}/api/public/scan/${code}`;

    // Create QR code record
    const qrCode = await QRCode.create({
      table_id: tableId,
      code: code,
      redirect_url: redirectUrl,
      is_active: true
    });

    // Generate QR code image
    const qrCodeDataUrl = await QRCodeGenerator.toDataURL(redirectUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H'
    });

    qrCode.dataValues.qr_image = qrCodeDataUrl;

    console.log(`✅ QR-Code generiert für Tisch ${table.table_number}: ${redirectUrl}`);

    res.json({
      success: true,
      data: qrCode,
      message: `QR-Code für Tisch ${table.table_number} wurde generiert`
    });
  } catch (error) {
    console.error('Generate QR Code Error:', error);
    res.status(500).json({
      success: false,
      message: 'QR-Code konnte nicht generiert werden'
    });
  }
});

// Generate all QR codes
router.post('/qrcode/generate-all', [authenticateToken, requireRestaurant], async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
    
    if (!restaurant.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant ist deaktiviert. QR-Codes können nicht generiert werden.'
      });
    }

    const tables = await Table.findAll({
      where: { restaurant_id: req.user.restaurant_id }
    });

    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Keine Tische vorhanden'
      });
    }

    const results = [];
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

    for (const table of tables) {
      // Deactivate old QR codes
      await QRCode.update(
        { is_active: false },
        { where: { table_id: table.id } }
      );

      // Generate new QR code
      const code = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const redirectUrl = `${backendUrl}/api/public/scan/${code}`;

      const qrCode = await QRCode.create({
        table_id: table.id,
        code: code,
        redirect_url: redirectUrl,
        is_active: true
      });

      // Generate QR code image
      const qrCodeDataUrl = await QRCodeGenerator.toDataURL(redirectUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H'
      });

      results.push({
        table_id: table.id,
        table_number: table.table_number,
        qr_code_id: qrCode.id,
        qr_code_url: redirectUrl,
        qr_image: qrCodeDataUrl
      });
    }

    console.log(`✅ ${results.length} QR-Codes generiert für Restaurant ${restaurant.name}`);

    res.json({
      success: true,
      data: results,
      message: `${results.length} QR-Codes wurden generiert`
    });
  } catch (error) {
    console.error('Generate All QR Codes Error:', error);
    res.status(500).json({
      success: false,
      message: 'QR-Codes konnten nicht generiert werden'
    });
  }
});

module.exports = router;