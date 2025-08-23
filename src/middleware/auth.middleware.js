/**
 * Auth Middleware - KORRIGIERTE VERSION
 * Speichern als: backend/src/middleware/auth.middleware.js
 */

const jwt = require('jsonwebtoken');
const { User, Restaurant } = require('../models');

class AuthMiddleware {
  // Haupt-Authentifizierungs-Middleware
  async authenticate(req, res, next) {
    try {
      // Token aus verschiedenen Quellen extrahieren
      const token = this.extractToken(req);
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Keine Authentifizierung vorhanden'
        });
      }

      // Token verifizieren
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
      
      // Benutzer aus DB laden mit Restaurant-Daten
      const user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ['password'] },
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: ['id', 'name', 'is_active', 'subscription_status', 'subscription_end_date']
        }]
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account ist deaktiviert'
        });
      }

      // User-Objekt an Request anhängen
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant_id: user.restaurant_id,
        restaurant: user.restaurant
      };

      // Token-Refresh wenn nötig (verlängert Session)
      if (this.shouldRefreshToken(decoded)) {
        const newToken = this.generateToken(user);
        res.setHeader('X-New-Token', newToken);
      }

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token ist abgelaufen',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Ungültiger Token',
          code: 'INVALID_TOKEN'
        });
      }
      
      console.error('Auth Middleware Fehler:', error);
      return res.status(500).json({
        success: false,
        message: 'Authentifizierungsfehler'
      });
    }
  }

  // Token aus Request extrahieren
  extractToken(req) {
    // 1. Check Authorization Header (Bearer Token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 2. Check x-auth-token Header
    if (req.headers['x-auth-token']) {
      return req.headers['x-auth-token'];
    }

    // 3. Check Query Parameter (für Downloads etc.)
    if (req.query.token) {
      return req.query.token;
    }

    // 4. Check Cookies (falls verwendet)
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }

    return null;
  }

  // Prüfen ob Token erneuert werden sollte
  shouldRefreshToken(decoded) {
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const halfTime = (decoded.exp - decoded.iat) / 2;
    
    // Erneuere Token wenn mehr als die Hälfte der Zeit abgelaufen ist
    return timeUntilExpiry < halfTime;
  }

  // Token generieren
  generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        restaurant_id: user.restaurant_id
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      {
        expiresIn: '7d' // Token gilt 7 Tage
      }
    );
  }

  // Restaurant Owner Middleware
  async requireRestaurantOwner(req, res, next) {
    try {
      await this.authenticate(req, res, async () => {
        if (req.user.role !== 'restaurant') {
          return res.status(403).json({
            success: false,
            message: 'Zugriff nur für Restaurant-Inhaber'
          });
        }

        // Prüfe ob Restaurant aktiv ist
        if (req.user.restaurant && !req.user.restaurant.is_active) {
          return res.status(403).json({
            success: false,
            message: 'Restaurant ist deaktiviert'
          });
        }

        next();
      });
    } catch (error) {
      console.error('Restaurant Owner Middleware Fehler:', error);
      return res.status(500).json({
        success: false,
        message: 'Autorisierungsfehler'
      });
    }
  }

  // Admin Middleware
  async requireAdmin(req, res, next) {
    try {
      await this.authenticate(req, res, async () => {
        if (req.user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Zugriff nur für Administratoren'
          });
        }
        next();
      });
    } catch (error) {
      console.error('Admin Middleware Fehler:', error);
      return res.status(500).json({
        success: false,
        message: 'Autorisierungsfehler'
      });
    }
  }

  // Optional Authentication (für öffentliche Endpoints mit optionaler Auth)
  async optionalAuth(req, res, next) {
    try {
      const token = this.extractToken(req);
      
      if (!token) {
        req.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
      
      const user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ['password'] },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      req.user = user ? {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant_id: user.restaurant_id,
        restaurant: user.restaurant
      } : null;

      next();
    } catch (error) {
      // Bei Fehler einfach ohne User weitermachen
      req.user = null;
      next();
    }
  }
}

module.exports = new AuthMiddleware();