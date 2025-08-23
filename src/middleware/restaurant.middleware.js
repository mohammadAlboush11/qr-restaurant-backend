/**
 * Restaurant Middleware
 * Speichern als: backend/src/middleware/restaurant.middleware.js
 */

const { Restaurant } = require('../models');

class RestaurantMiddleware {
  // Prüft ob Restaurant aktiv ist
  async checkRestaurantActive(req, res, next) {
    try {
      if (!req.user || !req.user.restaurant_id) {
        return res.status(403).json({
          success: false,
          message: 'Kein Restaurant zugeordnet'
        });
      }

      const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      if (!restaurant.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Restaurant ist deaktiviert. Bitte kontaktieren Sie den Support.'
        });
      }

      // Restaurant-Daten an Request anhängen
      req.restaurant = restaurant;
      next();

    } catch (error) {
      console.error('Restaurant Middleware Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler bei der Restaurant-Überprüfung'
      });
    }
  }

  // Prüft Subscription Status
  async checkSubscription(req, res, next) {
    try {
      if (!req.user || !req.user.restaurant_id) {
        return res.status(403).json({
          success: false,
          message: 'Kein Restaurant zugeordnet'
        });
      }

      const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Prüfe Subscription Status
      if (restaurant.subscription_status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Subscription ist nicht aktiv',
          subscription_status: restaurant.subscription_status
        });
      }

      // Prüfe Ablaufdatum
      if (restaurant.subscription_end_date) {
        const endDate = new Date(restaurant.subscription_end_date);
        const now = new Date();
        
        if (endDate < now) {
          // Update Status
          await restaurant.update({ 
            subscription_status: 'expired' 
          });
          
          return res.status(403).json({
            success: false,
            message: 'Subscription ist abgelaufen',
            expired_at: restaurant.subscription_end_date
          });
        }
      }

      req.restaurant = restaurant;
      next();

    } catch (error) {
      console.error('Subscription Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler bei der Subscription-Überprüfung'
      });
    }
  }

  // Prüft Table Limit basierend auf Plan
  async checkTableLimit(req, res, next) {
    try {
      const restaurant = req.restaurant || 
        await Restaurant.findByPk(req.user.restaurant_id);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Hole aktuellen Plan
      const tableLimit = this.getTableLimit(restaurant.subscription_plan);
      
      // Zähle aktuelle Tische
      const currentTableCount = await restaurant.countTables();
      
      if (currentTableCount >= tableLimit) {
        return res.status(403).json({
          success: false,
          message: `Tisch-Limit erreicht (${tableLimit} Tische)`,
          current_count: currentTableCount,
          limit: tableLimit,
          plan: restaurant.subscription_plan
        });
      }

      req.tableLimit = tableLimit;
      req.currentTableCount = currentTableCount;
      next();

    } catch (error) {
      console.error('Table Limit Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler bei der Limit-Überprüfung'
      });
    }
  }

  // Helper: Hole Table Limit basierend auf Plan
  getTableLimit(plan) {
    const limits = {
      'free': 5,
      'basic': 10,
      'premium': 25,
      'enterprise': 100
    };
    
    return limits[plan] || 5;
  }

  // Prüft ob Restaurant-Owner
  async requireOwner(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Nicht authentifiziert'
        });
      }

      if (req.user.role !== 'restaurant') {
        return res.status(403).json({
          success: false,
          message: 'Zugriff nur für Restaurant-Inhaber'
        });
      }

      next();

    } catch (error) {
      console.error('Owner Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler bei der Berechtigungsprüfung'
      });
    }
  }
}

module.exports = new RestaurantMiddleware();