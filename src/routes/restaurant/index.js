const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth.middleware');

// Debug Helper
const debug = (message, data = null) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[RESTAURANT] ${new Date().toISOString()} - ${message}`, data || '');
  }
};

// Load Controllers with fallbacks
let authController, restaurantController, tableController, qrcodeController;

try {
  authController = require('../../controllers/restaurant/auth.controller');
  debug('Auth controller loaded');
} catch(e) {
  debug('Auth controller not found - using fallback');
  authController = {
    login: (req, res) => res.status(501).json({ success: false, message: 'Not implemented' }),
    register: (req, res) => res.status(501).json({ success: false, message: 'Not implemented' }),
    logout: (req, res) => res.json({ success: true, message: 'Logged out' }),
    getCurrentUser: (req, res) => res.json({ success: true, data: { user: req.user } }),
    changePassword: (req, res) => res.status(501).json({ success: false, message: 'Not implemented' })
  };
}

try {
  restaurantController = require('../../controllers/restaurant/restaurant.controller');
  debug('Restaurant controller loaded');
} catch(e) {
  debug('Restaurant controller not found - using fallback');
  restaurantController = {
    getDashboard: (req, res) => res.json({ success: true, data: {} }),
    getProfile: (req, res) => res.json({ success: true, data: {} }),
    updateProfile: (req, res) => res.json({ success: true, message: 'Updated' }),
    getStatistics: (req, res) => res.json({ success: true, data: {} })
  };
}

try {
  tableController = require('../../controllers/restaurant/table.controller');
  debug('Table controller loaded');
} catch(e) {
  debug('Table controller not found - using fallback');
  tableController = {
    getAllTables: (req, res) => res.json({ success: true, data: [] }),
    getTable: (req, res) => res.json({ success: true, data: null }),
    createTable: (req, res) => res.status(201).json({ success: true, data: {} }),
    updateTable: (req, res) => res.json({ success: true, message: 'Updated' }),
    deleteTable: (req, res) => res.json({ success: true, message: 'Deleted' }),
    createMultipleTables: (req, res) => res.json({ success: true, data: [] }),
    deleteMultipleTables: (req, res) => res.json({ success: true, message: 'Deleted' })
  };
}

try {
  qrcodeController = require('../../controllers/restaurant/qrcode.controller');
  debug('QRCode controller loaded');
} catch(e) {
  debug('QRCode controller not found - using fallback');
  qrcodeController = {
    generateQRCode: (req, res) => res.json({ success: true, data: {} }),
    generateAllQRCodes: (req, res) => res.json({ success: true, data: [] }),
    downloadQRCode: (req, res) => res.status(501).json({ success: false, message: 'Not implemented' }),
    downloadAllQRCodes: (req, res) => res.status(501).json({ success: false, message: 'Not implemented' }),
    toggleQRCodeStatus: (req, res) => res.json({ success: true, message: 'Toggled' })
  };
}

// Request logging middleware for debugging
router.use((req, res, next) => {
  debug(`${req.method} ${req.path}`, { 
    body: req.body,
    params: req.params,
    query: req.query 
  });
  next();
});

// Public Auth Routes (no authentication required)
router.post('/auth/login', (req, res, next) => {
  debug('Login attempt', { email: req.body.email });
  authController.login(req, res, next);
});

router.post('/auth/register', (req, res, next) => {
  debug('Register attempt');
  authController.register(req, res, next);
});

// Protected Routes (authentication required)
router.post('/auth/logout', authenticateToken, (req, res, next) => {
  debug('Logout', { userId: req.user?.id });
  authController.logout(req, res, next);
});

router.get('/auth/me', authenticateToken, (req, res, next) => {
  debug('Get current user', { userId: req.user?.id });
  authController.getCurrentUser(req, res, next);
});

router.post('/auth/change-password', authenticateToken, (req, res, next) => {
  debug('Change password', { userId: req.user?.id });
  authController.changePassword(req, res, next);
});

// Dashboard & Profile
router.get('/dashboard', authenticateToken, (req, res, next) => {
  debug('Dashboard request', { userId: req.user?.id });
  restaurantController.getDashboard(req, res, next);
});

router.get('/profile', authenticateToken, (req, res, next) => {
  debug('Get profile', { userId: req.user?.id });
  restaurantController.getProfile(req, res, next);
});

router.put('/profile', authenticateToken, (req, res, next) => {
  debug('Update profile', { userId: req.user?.id });
  restaurantController.updateProfile(req, res, next);
});

router.get('/statistics', authenticateToken, (req, res, next) => {
  debug('Get statistics', { userId: req.user?.id });
  restaurantController.getStatistics(req, res, next);
});

// Table Management
router.get('/tables', authenticateToken, (req, res, next) => {
  debug('Get all tables', { restaurantId: req.user?.restaurant_id });
  tableController.getAllTables(req, res, next);
});

router.get('/tables/:id', authenticateToken, (req, res, next) => {
  debug('Get table', { tableId: req.params.id });
  tableController.getTable(req, res, next);
});

router.post('/tables', authenticateToken, (req, res, next) => {
  debug('Create table', req.body);
  tableController.createTable(req, res, next);
});

router.put('/tables/:id', authenticateToken, (req, res, next) => {
  debug('Update table', { tableId: req.params.id, data: req.body });
  tableController.updateTable(req, res, next);
});

router.delete('/tables/:id', authenticateToken, (req, res, next) => {
  debug('Delete table', { tableId: req.params.id });
  tableController.deleteTable(req, res, next);
});

router.post('/tables/multiple', authenticateToken, (req, res, next) => {
  debug('Create multiple tables', req.body);
  tableController.createMultipleTables(req, res, next);
});

router.post('/tables/delete-multiple', authenticateToken, (req, res, next) => {
  debug('Delete multiple tables', req.body);
  tableController.deleteMultipleTables(req, res, next);
});

// QR Code Management
router.post('/qrcode/generate/:table_id', authenticateToken, (req, res, next) => {
  debug('Generate QR code', { tableId: req.params.table_id });
  qrcodeController.generateQRCode(req, res, next);
});

router.post('/qrcode/generate-all', authenticateToken, (req, res, next) => {
  debug('Generate all QR codes');
  qrcodeController.generateAllQRCodes(req, res, next);
});

router.get('/qrcode/download/:table_id', authenticateToken, (req, res, next) => {
  debug('Download QR code', { tableId: req.params.table_id });
  qrcodeController.downloadQRCode(req, res, next);
});

router.get('/qrcode/download-all', authenticateToken, (req, res, next) => {
  debug('Download all QR codes');
  qrcodeController.downloadAllQRCodes(req, res, next);
});

router.patch('/qrcode/:qr_id/toggle', authenticateToken, (req, res, next) => {
  debug('Toggle QR code status', { qrId: req.params.qr_id });
  qrcodeController.toggleQRCodeStatus(req, res, next);
});

// Add notifications route
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    // For now, return empty notifications
    // You can implement actual notification logic later
    res.json({
      success: true,
      data: {
        notifications: [],
        unreadCount: 0
      }
    });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Benachrichtigungen'
    });
  }
});

// Add auth/me route
router.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }]
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
          role: user.role,
          restaurant_id: user.restaurant_id,
          restaurant: user.restaurant
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

// Add logout route
router.post('/auth/logout', authenticateToken, async (req, res) => {
  try {
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

// Error handler
router.use((error, req, res, next) => {
  debug('Route error', { 
    path: req.path,
    error: error.message,
    stack: error.stack 
  });
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal Server Error'
  });
});

module.exports = router;