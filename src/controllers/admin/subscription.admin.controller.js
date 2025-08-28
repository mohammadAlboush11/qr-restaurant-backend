const { 
  Subscription, 
  Restaurant, 
  Plan, 
  Payment,
  User,
  ActivityLog 
} = require('../../models');
const { Op } = require('sequelize');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

class SubscriptionAdminController {
  // Alle Subscriptions abrufen
  getAllSubscriptions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Subscription.findAndCountAll({
      include: [
        {
          model: Restaurant,
          as: 'restaurant',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'email', 'name']
          }]
        },
        {
          model: Plan,
          as: 'plan'
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: {
        subscriptions: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  });

  // Subscription Details
  getSubscriptionDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subscription = await Subscription.findByPk(id, {
      include: [
        {
          model: Restaurant,
          as: 'restaurant',
          include: [{
            model: User,
            as: 'user'
          }]
        },
        {
          model: Plan,
          as: 'plan'
        }
      ]
    });

    if (!subscription) {
      throw new AppError('Subscription nicht gefunden', 404);
    }

    res.json({
      success: true,
      data: subscription
    });
  });

  // Subscription erstellen
  createSubscription = asyncHandler(async (req, res) => {
    const {
      restaurant_id,
      plan_id,
      status = 'active',
      start_date,
      end_date,
      price,
      notes
    } = req.body;

    // Prüfungen
    const restaurant = await Restaurant.findByPk(restaurant_id);
    if (!restaurant) {
      throw new AppError('Restaurant nicht gefunden', 404);
    }

    const plan = await Plan.findByPk(plan_id);
    if (!plan) {
      throw new AppError('Plan nicht gefunden', 404);
    }

    // Aktive Subscription prüfen
    const existingSubscription = await Subscription.findOne({
      where: {
        restaurant_id,
        status: 'active'
      }
    });

    if (existingSubscription) {
      throw new AppError('Restaurant hat bereits ein aktives Abonnement', 400);
    }

    // Daten vorbereiten
    const now = new Date();
    const subscriptionData = {
      restaurant_id,
      plan_id,
      status,
      start_date: start_date || now,
      end_date: end_date || new Date(now.setMonth(now.getMonth() + 1)),
      price: price || plan.price,
      auto_renew: true,
      notes
    };

    const subscription = await Subscription.create(subscriptionData);

    // Restaurant aktivieren wenn Subscription aktiv
    if (status === 'active') {
      await restaurant.update({ 
        is_active: true,
        subscription_status: 'active',
        subscription_end_date: subscription.end_date
      });
    }

    // Activity Log
    if (ActivityLog && ActivityLog.logActivity) {
      await ActivityLog.logActivity({
        user_id: req.user?.id,
        restaurant_id,
        action: 'subscription_created',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        metadata: { plan_name: plan.name, status }
      });
    }

    logger.info(`Subscription created for restaurant ${restaurant_id}`);

    res.status(201).json({
      success: true,
      message: 'Subscription erfolgreich erstellt',
      data: subscription
    });
  });

  // Subscription aktualisieren
  updateSubscription = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const subscription = await Subscription.findByPk(id, {
      include: ['restaurant', 'plan']
    });

    if (!subscription) {
      throw new AppError('Subscription nicht gefunden', 404);
    }

    // Status-Änderungen behandeln
    if (updates.status && updates.status !== subscription.status) {
      // Restaurant-Status synchronisieren
      if (updates.status === 'active') {
        await subscription.restaurant.update({ 
          is_active: true,
          subscription_status: 'active'
        });
      } else if (updates.status === 'cancelled' || updates.status === 'expired') {
        await subscription.restaurant.update({ 
          is_active: false,
          subscription_status: updates.status
        });
      }
    }

    await subscription.update(updates);

    // Activity Log
    if (ActivityLog && ActivityLog.logActivity) {
      await ActivityLog.logActivity({
        user_id: req.user?.id,
        restaurant_id: subscription.restaurant_id,
        action: 'subscription_updated',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        new_values: updates
      });
    }

    res.json({
      success: true,
      message: 'Subscription erfolgreich aktualisiert',
      data: subscription
    });
  });

  // Subscription stornieren
  cancelSubscription = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const subscription = await Subscription.findByPk(id, {
      include: ['restaurant']
    });

    if (!subscription) {
      throw new AppError('Subscription nicht gefunden', 404);
    }

    // Subscription als cancelled markieren
    await subscription.update({
      status: 'cancelled',
      cancelled_at: new Date(),
      cancellation_reason: reason
    });

    // Restaurant deaktivieren
    await subscription.restaurant.update({ 
      is_active: false,
      subscription_status: 'cancelled'
    });

    // Activity Log
    if (ActivityLog && ActivityLog.logActivity) {
      await ActivityLog.logActivity({
        user_id: req.user?.id,
        restaurant_id: subscription.restaurant_id,
        action: 'subscription_cancelled',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        metadata: { reason }
      });
    }

    logger.info(`Subscription ${id} cancelled`);

    res.json({
      success: true,
      message: 'Subscription erfolgreich storniert'
    });
  });

  // Subscription verlängern
  extendSubscription = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { extension_days, new_end_date } = req.body;

    const subscription = await Subscription.findByPk(id);
    
    if (!subscription) {
      throw new AppError('Subscription nicht gefunden', 404);
    }

    let newEndDate;
    if (new_end_date) {
      newEndDate = new Date(new_end_date);
    } else if (extension_days) {
      newEndDate = new Date(subscription.end_date || new Date());
      newEndDate.setDate(newEndDate.getDate() + extension_days);
    } else {
      throw new AppError('Extension days oder new end date erforderlich', 400);
    }

    await subscription.update({ end_date: newEndDate });

    res.json({
      success: true,
      message: 'Subscription erfolgreich verlängert',
      data: subscription
    });
  });

  // Plan wechseln
  changePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_plan_id } = req.body;

    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      throw new AppError('Subscription nicht gefunden', 404);
    }

    const newPlan = await Plan.findByPk(new_plan_id);
    if (!newPlan) {
      throw new AppError('Neuer Plan nicht gefunden', 404);
    }

    await subscription.update({ 
      plan_id: new_plan_id,
      price: newPlan.price
    });

    res.json({
      success: true,
      message: 'Plan erfolgreich geändert',
      data: subscription
    });
  });

  // Ablaufende Subscriptions
  getExpiringSubscriptions = asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));
    
    const subscriptions = await Subscription.findAll({
      where: {
        status: 'active',
        end_date: {
          [Op.between]: [new Date(), futureDate]
        }
      },
      include: ['restaurant', 'plan']
    });

    res.json({
      success: true,
      data: {
        count: subscriptions.length,
        subscriptions
      }
    });
  });

  // Bulk Update
  bulkUpdateSubscriptions = asyncHandler(async (req, res) => {
    const { subscription_ids, action, data } = req.body;

    if (!subscription_ids || !Array.isArray(subscription_ids)) {
      throw new AppError('Subscription IDs erforderlich', 400);
    }

    const results = {
      success: [],
      failed: []
    };

    for (const id of subscription_ids) {
      try {
        const subscription = await Subscription.findByPk(id);
        
        if (!subscription) {
          results.failed.push({ id, reason: 'Nicht gefunden' });
          continue;
        }

        switch (action) {
          case 'activate':
            await subscription.update({ status: 'active' });
            break;
          case 'cancel':
            await subscription.update({ 
              status: 'cancelled',
              cancellation_reason: data?.reason
            });
            break;
          case 'extend':
            if (data?.days) {
              const newEndDate = new Date(subscription.end_date);
              newEndDate.setDate(newEndDate.getDate() + data.days);
              await subscription.update({ end_date: newEndDate });
            }
            break;
          default:
            results.failed.push({ id, reason: 'Ungültige Aktion' });
            continue;
        }

        results.success.push(id);
      } catch (error) {
        results.failed.push({ id, reason: error.message });
      }
    }

    res.json({
      success: true,
      message: `${results.success.length} erfolgreich, ${results.failed.length} fehlgeschlagen`,
      data: results
    });
  });
}

module.exports = new SubscriptionAdminController();