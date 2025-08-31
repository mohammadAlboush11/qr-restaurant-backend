const { Restaurant, Subscription, Plan } = require('../models');
const { Op } = require('sequelize');

// Simple logger fallback
const logger = {
  error: (msg, error) => console.error(`[ERROR] ${msg}`, error),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`)
};

// Check if restaurant has active subscription
const checkActiveSubscription = async (req, res, next) => {
  try {
    const restaurantId = req.params.restaurantId || 
                        req.body.restaurant_id || 
                        req.user?.restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID fehlt'
      });
    }

    const restaurant = await Restaurant.findByPk(restaurantId, {
      include: [{
        model: Subscription,
        as: 'subscription',
        include: [{
          model: Plan,
          as: 'plan'
        }]
      }]
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    if (!restaurant.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant ist deaktiviert',
        code: 'RESTAURANT_INACTIVE'
      });
    }

    const subscription = restaurant.subscription;
    if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trial')) {
      return res.status(403).json({
        success: false,
        message: 'Kein aktives Abonnement',
        code: 'NO_ACTIVE_SUBSCRIPTION'
      });
    }

    // Check expiration
    const now = new Date();
    if (subscription.end_date && new Date(subscription.end_date) < now) {
      await subscription.update({ status: 'expired' });
      return res.status(403).json({
        success: false,
        message: 'Abonnement ist abgelaufen',
        code: 'SUBSCRIPTION_EXPIRED'
      });
    }

    req.subscription = subscription;
    req.restaurant = restaurant;
    next();

  } catch (error) {
    logger.error('Subscription check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler bei der Überprüfung des Abonnements'
    });
  }
};

// Check specific feature access
const checkFeatureAccess = (feature) => {
  return async (req, res, next) => {
    try {
      if (!req.subscription) {
        const restaurantId = req.user?.restaurant_id;
        if (!restaurantId) {
          return res.status(403).json({
            success: false,
            message: 'Kein Restaurant zugeordnet'
          });
        }

        const subscription = await Subscription.findOne({
          where: {
            restaurant_id: restaurantId,
            status: { [Op.in]: ['active', 'trial'] }
          }
        });
        
        if (!subscription) {
          return res.status(403).json({
            success: false,
            message: 'Kein aktives Abonnement gefunden'
          });
        }
        
        req.subscription = subscription;
      }

      const plan = await Plan.findByPk(req.subscription.plan_id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan nicht gefunden'
        });
      }

      const features = typeof plan.features === 'string' 
        ? JSON.parse(plan.features) 
        : plan.features || [];
        
      if (!features.includes(feature)) {
        return res.status(403).json({
          success: false,
          message: `Diese Funktion (${feature}) ist in Ihrem Plan nicht verfügbar`,
          code: 'FEATURE_NOT_AVAILABLE',
          required_feature: feature
        });
      }

      next();
    } catch (error) {
      logger.error('Feature access check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Fehler bei der Überprüfung der Funktionsberechtigung'
      });
    }
  };
};

// Check usage limits
const checkUsageLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      if (!req.subscription) {
        return res.status(403).json({
          success: false,
          message: 'Kein aktives Abonnement gefunden'
        });
      }

      const plan = await Plan.findByPk(req.subscription.plan_id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan nicht gefunden'
        });
      }

      let limit, currentUsage;
      
      switch(limitType) {
        case 'tables':
          const { Table } = require('../models');
          limit = plan.max_tables || 999;
          currentUsage = await Table.count({ 
            where: { restaurant_id: req.subscription.restaurant_id } 
          });
          break;
          
        case 'scans':
          limit = plan.max_scans || 999999;
          currentUsage = req.subscription.usage_stats?.scans || 0;
          break;
          
        case 'users':
          const { User } = require('../models');
          limit = plan.max_users || 1;
          currentUsage = await User.count({ 
            where: { restaurant_id: req.subscription.restaurant_id } 
          });
          break;
          
        default:
          return next();
      }

      if (currentUsage >= limit) {
        return res.status(403).json({
          success: false,
          message: `Limit erreicht für ${limitType}. Aktuelles Limit: ${limit}`,
          code: 'LIMIT_EXCEEDED',
          limit_type: limitType,
          current_limit: limit,
          current_usage: currentUsage
        });
      }

      req.usageInfo = { limit, currentUsage, remaining: limit - currentUsage };
      next();

    } catch (error) {
      logger.error('Usage limit check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Fehler bei der Überprüfung der Nutzungslimits'
      });
    }
  };
};

// Track API usage for billing
const trackApiUsage = async (req, res, next) => {
  try {
    if (req.subscription && req.method !== 'GET') {
      const stats = req.subscription.usage_stats || {};
      stats.api_calls = (stats.api_calls || 0) + 1;
      stats.last_api_call = new Date();
      
      await req.subscription.update({ usage_stats: stats });
    }
    next();
  } catch (error) {
    logger.error('API usage tracking error:', error);
    next(); // Don't block on tracking errors
  }
};

module.exports = {
  checkActiveSubscription,
  checkFeatureAccess,
  checkUsageLimit,
  trackApiUsage
};