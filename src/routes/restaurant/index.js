/**
 * Restaurant Routes Index
 * Speichern als: backend/src/routes/restaurant/index.js
 */

const router = require('express').Router();
const { 
    verifyToken, 
    requireRestaurantOwner,
    requireRestaurantAccess 
} = require('../../middleware/auth.middleware');
const { 
    checkActiveSubscription,
    checkFeatureAccess,
    checkUsageLimit 
} = require('../../middleware/subscription.middleware');

// Import controllers
const restaurantController = require('../../controllers/restaurant/restaurant.controller');
const tableController = require('../../controllers/restaurant/table.controller');
const qrcodeController = require('../../controllers/restaurant/qrcode.controller');

// Import validation middleware
const {
    validateCreateTable,
    validateUUID,
    validatePagination,
    validateDateRange,
    validateQRCodeStyle
} = require('../../middleware/validation.middleware');

// Apply authentication to all routes
router.use(verifyToken, requireRestaurantOwner);

// Restaurant management (owner's restaurant)
router.get('/:restaurantId/dashboard', 
    requireRestaurantAccess, 
    checkActiveSubscription,
    restaurantController.getDashboard
);

router.get('/:restaurantId/details', 
    requireRestaurantAccess,
    restaurantController.getRestaurantDetails
);

router.put('/:restaurantId', 
    requireRestaurantAccess,
    restaurantController.updateRestaurant
);

router.get('/:restaurantId/analytics', 
    requireRestaurantAccess,
    checkActiveSubscription,
    validateDateRange,
    restaurantController.getAnalytics
);

router.get('/:restaurantId/analytics/export', 
    requireRestaurantAccess,
    checkActiveSubscription,
    checkFeatureAccess('export_data'),
    restaurantController.exportAnalytics
);

router.get('/:restaurantId/subscription', 
    requireRestaurantAccess,
    restaurantController.getSubscriptionInfo
);

// Table management
router.get('/:restaurantId/tables', 
    requireRestaurantAccess,
    checkActiveSubscription,
    tableController.getAllTables
);

router.get('/:restaurantId/tables/:tableId', 
    requireRestaurantAccess,
    validateUUID('tableId'),
    tableController.getTable
);

router.post('/:restaurantId/tables', 
    requireRestaurantAccess,
    checkActiveSubscription,
    checkUsageLimit('tables'),
    validateCreateTable,
    tableController.createTable
);

router.put('/:restaurantId/tables/:tableId', 
    requireRestaurantAccess,
    validateUUID('tableId'),
    tableController.updateTable
);

router.delete('/:restaurantId/tables/:tableId', 
    requireRestaurantAccess,
    validateUUID('tableId'),
    tableController.deleteTable
);

router.post('/:restaurantId/tables/bulk-create', 
    requireRestaurantAccess,
    checkActiveSubscription,
    tableController.bulkCreateTables
);

router.patch('/:restaurantId/tables/:tableId/status', 
    requireRestaurantAccess,
    validateUUID('tableId'),
    tableController.toggleTableStatus
);

router.get('/:restaurantId/tables/:tableId/analytics', 
    requireRestaurantAccess,
    validateUUID('tableId'),
    tableController.getTableAnalytics
);

router.post('/:restaurantId/tables/:tableId/reset-stats', 
    requireRestaurantAccess,
    validateUUID('tableId'),
    tableController.resetTableStats
);

router.post('/:restaurantId/tables/bulk-update', 
    requireRestaurantAccess,
    tableController.bulkUpdateTables
);

// QR Code management
router.get('/:restaurantId/qrcodes', 
    requireRestaurantAccess,
    checkActiveSubscription,
    qrcodeController.getAllQRCodes
);

router.get('/:restaurantId/qrcodes/statistics', 
    requireRestaurantAccess,
    qrcodeController.getQRCodeStatistics
);

router.get('/:restaurantId/qrcodes/:qrCodeId', 
    requireRestaurantAccess,
    validateUUID('qrCodeId'),
    qrcodeController.getQRCode
);

router.post('/:restaurantId/tables/:tableId/qrcode', 
    requireRestaurantAccess,
    checkActiveSubscription,
    validateUUID('tableId'),
    qrcodeController.generateQRCode
);

router.post('/:restaurantId/qrcodes/:qrCodeId/regenerate', 
    requireRestaurantAccess,
    validateUUID('qrCodeId'),
    qrcodeController.regenerateQRCode
);

router.put('/:restaurantId/qrcodes/:qrCodeId/style', 
    requireRestaurantAccess,
    validateUUID('qrCodeId'),
    checkFeatureAccess('custom_qr_design'),
    validateQRCodeStyle,
    qrcodeController.updateQRCodeStyle
);

router.get('/:restaurantId/qrcodes/:qrCodeId/download', 
    requireRestaurantAccess,
    validateUUID('qrCodeId'),
    qrcodeController.downloadQRCode
);

router.get('/:restaurantId/qrcodes/download/all', 
    requireRestaurantAccess,
    checkActiveSubscription,
    qrcodeController.downloadAllQRCodes
);

router.post('/:restaurantId/qrcodes/preview', 
    requireRestaurantAccess,
    qrcodeController.getQRCodePreview
);

router.post('/:restaurantId/qrcodes/bulk-generate', 
    requireRestaurantAccess,
    checkActiveSubscription,
    qrcodeController.bulkGenerateQRCodes
);

module.exports = router;