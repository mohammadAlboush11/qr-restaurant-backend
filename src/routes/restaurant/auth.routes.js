const express = require('express');
const router = express.Router();
const authController = require('../../controllers/restaurant/auth.controller');
const authMiddleware = require('../../middleware/auth.middleware');

// Public routes
router.post('/login', authController.login);

// Protected routes
router.post('/validate', authMiddleware, authController.getCurrentUser);
router.get('/me', authMiddleware, authController.getCurrentUser);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;