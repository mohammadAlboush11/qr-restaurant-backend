/**
 * Restaurant Routes - KORRIGIERTE VERSION
 * Speichern als: backend/src/routes/restaurant/index.js
 */

const router = require('express').Router();
const authMiddleware = require('../../middleware/auth.middleware');
const restaurantMiddleware = require('../../middleware/restaurant.middleware');
const validationMiddleware = require('../../middleware/validation.middleware');

// Controllers
const authController = require('../../controllers/restaurant/auth.controller');
const restaurantController = require('../../controllers/restaurant/restaurant.controller');
const tableController = require('../../controllers/restaurant/table.controller');
const qrcodeController = require('../../controllers/restaurant/qrcode.controller');

// ============================
// Auth Routes (Öffentlich)
// ============================
router.post('/auth/login', 
  validationMiddleware.validateLogin(),
  authController.login
);

router.post('/auth/validate', 
  authMiddleware.authenticate,
  authController.validateToken
);

router.post('/auth/logout',
  authMiddleware.authenticate,
  authController.logout
);

router.post('/auth/forgot-password',
  authController.requestPasswordReset
);

router.post('/auth/reset-password',
  authController.resetPassword
);

// ============================
// Restaurant Routes (Authentifiziert)
// ============================

// Dashboard
router.get('/dashboard',
  authMiddleware.requireRestaurantOwner,
  restaurantController.getDashboard
);

// Profil
router.get('/profile',
  authMiddleware.requireRestaurantOwner,
  restaurantController.getProfile
);

router.put('/profile',
  authMiddleware.requireRestaurantOwner,
  restaurantController.updateProfile
);

// Passwort ändern
router.post('/change-password',
  authMiddleware.requireRestaurantOwner,
  validationMiddleware.validatePasswordChange(),
  restaurantController.changePassword
);

// Statistiken
router.get('/statistics',
  authMiddleware.requireRestaurantOwner,
  restaurantController.getStatistics
);

// Google Places ID
router.post('/google-place',
  authMiddleware.requireRestaurantOwner,
  restaurantController.updateGooglePlaceId
);

// ============================
// Table Management Routes
// ============================
router.get('/tables',
  authMiddleware.requireRestaurantOwner,
  tableController.getAllTables
);

router.get('/tables/:id',
  authMiddleware.requireRestaurantOwner,
  validationMiddleware.validateIdParam(),
  tableController.getTable
);

router.post('/tables',
  authMiddleware.requireRestaurantOwner,
  validationMiddleware.validateTableCreation(),
  tableController.createTable
);

router.put('/tables/:id',
  authMiddleware.requireRestaurantOwner,
  validationMiddleware.validateIdParam(),
  tableController.updateTable
);

router.delete('/tables/:id',
  authMiddleware.requireRestaurantOwner,
  validationMiddleware.validateIdParam(),
  tableController.deleteTable
);

// Batch-Operationen
router.post('/tables/batch',
  authMiddleware.requireRestaurantOwner,
  tableController.createMultipleTables
);

router.delete('/tables/batch',
  authMiddleware.requireRestaurantOwner,
  tableController.deleteMultipleTables
);

// ============================
// QR Code Routes
// ============================
router.post('/qrcode/:tableId/generate',
  authMiddleware.requireRestaurantOwner,
  qrcodeController.generateQRCode
);

router.post('/qrcode/generate-all',
  authMiddleware.requireRestaurantOwner,
  qrcodeController.generateAllQRCodes
);

router.get('/qrcode/:tableId/download',
  authMiddleware.requireRestaurantOwner,
  qrcodeController.downloadQRCode
);

router.get('/qrcode/download-all',
  authMiddleware.requireRestaurantOwner,
  qrcodeController.downloadAllQRCodesPDF
);

router.get('/qrcode/:tableId/preview',
  authMiddleware.requireRestaurantOwner,
  qrcodeController.previewQRCode
);

// ============================
// Export
// ============================
module.exports = router;