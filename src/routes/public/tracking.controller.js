/**
 * Authentication Routes
 * Speichern als: backend/src/routes/auth.routes.js
 */

const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { 
    verifyToken,
    requireAdmin,
    requireRestaurantOwner 
} = require('../middleware/auth.middleware');
const { 
    validateLogin,
    validateRegister,
    validateUUID
} = require('../middleware/validation.middleware');
const { 
    authRateLimiter,
    passwordResetRateLimiter 
} = require('../middleware/rateLimiter');

// Public routes
router.post('/login', authRateLimiter, validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', passwordResetRateLimiter, authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.use(verifyToken);

router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentUser);
router.put('/profile', authController.updateProfile);
router.post('/change-password', authController.changePassword);

module.exports = router;