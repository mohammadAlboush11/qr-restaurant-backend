const { Restaurant, Table, Subscription, Plan } = require('../models');

// Default middleware function für Restaurant Routes
const restaurantMiddleware = async (req, res, next) => {
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

    req.restaurant = restaurant;
    next();

  } catch (error) {
    console.error('Restaurant Middleware Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler bei der Restaurant-Überprüfung'
    });
  }
};

// Zusätzliche spezifische Middleware-Funktionen
const checkRestaurantActive = restaurantMiddleware;

const checkSubscription = async (req, res, next) => {
  try {
    const restaurantId = req.user?.restaurant_id || req.restaurant?.id;
    
    if (!restaurantId) {
      return res.status(403).json({
        success: false,
        message: 'Kein Restaurant zugeordnet'
      });
    }

    const restaurant = req.restaurant || await Restaurant.findByPk(restaurantId);
    
    // Prüfe Subscription Status
    if (restaurant.subscription_status !== 'active' && restaurant.subscription_status !== 'trial') {
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

    next();
  } catch (error) {
    console.error('Subscription Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler bei der Subscription-Überprüfung'
    });
  }
};

const checkTableLimit = async (req, res, next) => {
  try {
    const restaurantId = req.user?.restaurant_id;
    const restaurant = req.restaurant || await Restaurant.findByPk(restaurantId);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    // Plan-basierte Limits
    const limits = {
      'trial': 5,
      'basic': 20,
      'premium': 50,
      'enterprise': 999
    };
    
    const tableLimit = limits[restaurant.subscription_status] || 5;
    const currentTableCount = await Table.count({ 
      where: { restaurant_id: restaurant.id } 
    });
    
    if (currentTableCount >= tableLimit) {
      return res.status(403).json({
        success: false,
        message: `Tisch-Limit erreicht (${tableLimit} Tische für ${restaurant.subscription_status} Plan)`,
        current_count: currentTableCount,
        limit: tableLimit,
        plan: restaurant.subscription_status
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
};

// Default export für Kompatibilität
module.exports = restaurantMiddleware;

// Named exports für spezifische Funktionen
module.exports.checkRestaurantActive = checkRestaurantActive;
module.exports.checkSubscription = checkSubscription;
module.exports.checkTableLimit = checkTableLimit;