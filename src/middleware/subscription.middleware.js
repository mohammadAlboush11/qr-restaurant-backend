/**
 * Subscription Middleware
 * Speichern als: backend/src/middleware/subscription.middleware.js
 */

const { Restaurant, Subscription, Plan } = require('../models');
const logger = require('../utils/logger');

// Check if restaurant has active subscription
const checkActiveSubscription = async (req, res, next) => {
    try {
        const restaurantId = req.params.restaurantId || 
                            req.body.restaurant_id || 
                            req.user?.restaurants?.[0]?.id;

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

        // Check if restaurant is active
        if (!restaurant.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Restaurant ist deaktiviert. Bitte kontaktieren Sie den Administrator.',
                code: 'RESTAURANT_INACTIVE'
            });
        }

        // Check subscription
        const subscription = restaurant.subscription;
        if (!subscription || !subscription.isActive()) {
            return res.status(403).json({
                success: false,
                message: 'Kein aktives Abonnement. Bitte kontaktieren Sie den Administrator.',
                code: 'NO_ACTIVE_SUBSCRIPTION'
            });
        }

        // Check if subscription is expired
        if (subscription.status === 'expired') {
            return res.status(403).json({
                success: false,
                message: 'Abonnement ist abgelaufen. Bitte erneuern Sie Ihr Abonnement.',
                code: 'SUBSCRIPTION_EXPIRED'
            });
        }

        // Attach subscription to request
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
                // Try to get subscription if not already attached
                const restaurantId = req.params.restaurantId || 
                                    req.body.restaurant_id || 
                                    req.user?.restaurants?.[0]?.id;

                if (restaurantId) {
                    const subscription = await Subscription.findActiveByRestaurant(restaurantId);
                    req.subscription = subscription;
                }
            }

            if (!req.subscription) {
                return res.status(403).json({
                    success: false,
                    message: 'Kein aktives Abonnement gefunden'
                });
            }

            const plan = await Plan.findByPk(req.subscription.plan_id);
            if (!plan.checkFeature(feature)) {
                return res.status(403).json({
                    success: false,
                    message: `Diese Funktion (${feature}) ist in Ihrem aktuellen Plan nicht verfügbar`,
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

            const hasCapacity = await req.subscription.checkLimit(limitType);
            if (!hasCapacity) {
                const plan = await Plan.findByPk(req.subscription.plan_id);
                const limit = plan.getLimit(limitType);

                return res.status(403).json({
                    success: false,
                    message: `Limit erreicht für ${limitType}. Aktuelles Limit: ${limit}`,
                    code: 'LIMIT_EXCEEDED',
                    limit_type: limitType,
                    current_limit: limit,
                    current_usage: req.subscription.usage_stats[`current_${limitType}`]
                });
            }

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

// Check if in trial period
const checkTrialStatus = async (req, res, next) => {
    try {
        if (!req.subscription) {
            return next();
        }

        if (req.subscription.isInTrial()) {
            const daysRemaining = Math.ceil(
                (new Date(req.subscription.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)
            );

            req.trialInfo = {
                inTrial: true,
                daysRemaining,
                endsAt: req.subscription.trial_ends_at
            };
        }

        next();
    } catch (error) {
        logger.error('Trial status check error:', error);
        next(); // Don't block on trial check errors
    }
};

// Track API usage for billing
const trackApiUsage = async (req, res, next) => {
    try {
        if (req.subscription && req.method !== 'GET') {
            // Track write operations for API usage limits
            await req.subscription.incrementUsage('api_calls');
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
    checkTrialStatus,
    trackApiUsage
};