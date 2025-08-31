const jwt = require('jsonwebtoken');
const { User, Restaurant } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET; // Kein Leerzeichen vor ;

// Sicherheitscheck
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET nicht gesetzt!');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1); // App beenden in Production
  }
}

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

      try {
        const user = await User.findByPk(decoded.id, {
          include: [{
            model: Restaurant,
            as: 'restaurant',
            required: false
          }]
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'Benutzer nicht gefunden'
          });
        }

        if (!user.is_active) {
          return res.status(403).json({
            success: false,
            message: 'Benutzer-Account ist deaktiviert'
          });
        }

        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          restaurant_id: user.restaurant_id,
          restaurant: user.restaurant
        };
        
        next();
      } catch (dbError) {
        console.error('Database error in auth middleware:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Datenbankfehler'
        });
      }
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
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Nicht authentifiziert'
    });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin-Rechte erforderlich'
    });
  }
  
  next();
};

const requireRestaurant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Nicht authentifiziert'
    });
  }
  
  if (req.user.role !== 'restaurant' && req.user.role !== 'restaurant_owner') {
    return res.status(403).json({
      success: false,
      message: 'Restaurant-Rechte erforderlich'
    });
  }

  if (!req.user.restaurant_id) {
    return res.status(403).json({
      success: false,
      message: 'Kein Restaurant zugeordnet'
    });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRestaurant
};