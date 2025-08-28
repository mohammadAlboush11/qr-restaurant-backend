/**
 * Auth Middleware with Restaurant Check
 * Speichern als: backend/src/middleware/auth.middleware.js
 */

const jwt = require('jsonwebtoken');
const { User, Restaurant } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

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

      // User mit Restaurant laden
      const user = await User.findByPk(decoded.id, {
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

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurant_id: user.restaurant_id,
        restaurant: user.restaurant
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

const requireRestaurant = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Nicht authentifiziert'
      });
    }

    // Check if user has restaurant role
    if (req.user.role !== 'restaurant' && req.user.role !== 'restaurant_owner') {
      return res.status(403).json({
        success: false,
        message: 'Keine Restaurant-Berechtigung'
      });
    }

    // Check if restaurant exists
    if (!req.user.restaurant_id) {
      return res.status(403).json({
        success: false,
        message: 'Kein Restaurant zugeordnet'
      });
    }

    // Verify restaurant exists and is active
    let restaurant = req.user.restaurant;
    
    if (!restaurant) {
      restaurant = await Restaurant.findByPk(req.user.restaurant_id);
      
      if (!restaurant) {
        // Restaurant existiert nicht - erstelle es automatisch
        console.log(`Restaurant mit ID ${req.user.restaurant_id} existiert nicht - wird erstellt`);
        
        restaurant = await Restaurant.create({
          id: req.user.restaurant_id,
          name: 'Mein Restaurant',
          email: req.user.email,
          slug: `restaurant-${req.user.restaurant_id}`,
          is_active: true,
          subscription_status: 'trial'
        });
        
        console.log('Restaurant automatisch erstellt:', restaurant.id);
      }
      
      req.user.restaurant = restaurant;
    }

    if (!restaurant.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant ist deaktiviert'
      });
    }

    next();
  } catch (error) {
    console.error('Restaurant Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler bei Restaurant-Überprüfung'
    });
  }
};

module.exports = {
  authenticateToken,
  requireRestaurant
};