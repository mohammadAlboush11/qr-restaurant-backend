/**
 * Public Routes
 * Speichern als: backend/src/routes/public/index.js
 */

const router = require('express').Router();
const trackingController = require('../../controllers/public/tracking.controller');
const publicController = require('../../controllers/public/public.controller');
const { publicRateLimiter } = require('../../middleware/rateLimiter');
const { Plan } = require('../../models');

// Apply rate limiting to all public routes
router.use(publicRateLimiter);

// QR Code tracking (moved to main server.js for simpler URL)
// router.get('/track/:token', trackingController.trackQRCode);

// Short URL redirect
router.get('/s/:code', trackingController.shortUrlRedirect);

// QR Code info (for preview/testing)
router.get('/qr/:token/info', trackingController.getQRCodeInfo);

// Public plan information
router.get('/plans', async (req, res) => {
    try {
        const plans = await Plan.getActivePlans();
        res.json({
            success: true,
            data: plans.map(plan => plan.toPublicJSON())
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Fehler beim Abrufen der Pläne'
        });
    }
});

// Public restaurant info (for QR landing page)
router.get('/restaurant/:slug', publicController.getRestaurantInfo);

// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;