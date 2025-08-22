/**
 * Subscription Admin Controller
 * Speichern als: backend/src/controllers/admin/subscription.admin.controller.js
 */

const { 
    Subscription, 
    Restaurant, 
    Plan, 
    Payment,
    User,
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// Get all subscriptions
const getAllSubscriptions = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 20,
        status,
        plan_id,
        expiring_soon,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    
    if (status) {
        where.status = status;
    }
    
    if (plan_id) {
        where.plan_id = plan_id;
    }
    
    if (expiring_soon === 'true') {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);
        
        where.end_date = {
            [sequelize.Op.between]: [new Date(), futureDate]
        };
    }

    const { count, rows } = await Subscription.findAndCountAll({
        where,
        include: [
            {
                model: Restaurant,
                as: 'restaurant',
                include: [{
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'email', 'first_name', 'last_name']
                }]
            },
            {
                model: Plan,
                as: 'plan'
            }
        ],
        order: [[sort_by, sort_order]],
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

// Get subscription details
const getSubscriptionDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subscription = await Subscription.findByPk(id, {
        include: [
            {
                model: Restaurant,
                as: 'restaurant',
                include: ['owner']
            },
            {
                model: Plan,
                as: 'plan'
            },
            {
                model: Payment,
                as: 'payments',
                order: [['created_at', 'DESC']],
                limit: 10
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

// Create subscription
const createSubscription = asyncHandler(async (req, res) => {
    const {
        restaurant_id,
        plan_id,
        status = 'pending',
        billing_cycle = 'monthly',
        is_trial = false,
        trial_days = 0,
        notes
    } = req.body;

    // Check if restaurant exists
    const restaurant = await Restaurant.findByPk(restaurant_id);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Check if restaurant already has active subscription
    const existingSubscription = await Subscription.findOne({
        where: {
            restaurant_id,
            status: ['active', 'pending']
        }
    });

    if (existingSubscription) {
        throw new AppError('Restaurant hat bereits ein aktives Abonnement', 400);
    }

    // Check if plan exists
    const plan = await Plan.findByPk(plan_id);
    if (!plan) {
        throw new AppError('Plan nicht gefunden', 404);
    }

    // Calculate dates
    const now = new Date();
    let endDate = null;
    let trialEndsAt = null;

    if (is_trial && trial_days > 0) {
        trialEndsAt = new Date(now);
        trialEndsAt.setDate(trialEndsAt.getDate() + trial_days);
    }

    if (billing_cycle === 'monthly') {
        endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
    } else if (billing_cycle === 'yearly') {
        endDate = new Date(now);
        endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Create subscription
    const subscription = await Subscription.create({
        restaurant_id,
        plan_id,
        status,
        billing_cycle,
        is_trial,
        trial_ends_at: trialEndsAt,
        start_date: now,
        end_date: endDate,
        notes,
        created_by: req.user.id
    });

    // Activate if status is active
    if (status === 'active') {
        await subscription.activate(req.user.id);
        await restaurant.update({ is_active: true });
    }

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id,
        action: 'subscription_created',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        metadata: { plan_name: plan.name, status }
    });

    res.status(201).json({
        success: true,
        message: 'Subscription erfolgreich erstellt',
        data: subscription
    });
});

// Update subscription
const updateSubscription = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const subscription = await Subscription.findByPk(id, {
        include: ['restaurant', 'plan']
    });

    if (!subscription) {
        throw new AppError('Subscription nicht gefunden', 404);
    }

    const oldValues = subscription.toJSON();

    // Handle status changes
    if (updates.status && updates.status !== subscription.status) {
        switch (updates.status) {
            case 'active':
                await subscription.activate(req.user.id);
                break;
            case 'cancelled':
                await subscription.cancel(updates.cancellation_reason, req.user.id);
                break;
            case 'expired':
                await subscription.expire();
                break;
            default:
                subscription.status = updates.status;
                await subscription.save();
        }
    }

    // Update other fields
    const allowedFields = [
        'plan_id', 'end_date', 'auto_renew', 'billing_cycle',
        'notes', 'admin_notes', 'limits_override'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
        if (updates[field] !== undefined && field !== 'status') {
            filteredUpdates[field] = updates[field];
        }
    });

    if (Object.keys(filteredUpdates).length > 0) {
        await subscription.update({
            ...filteredUpdates,
            updated_by: req.user.id
        });
    }

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: subscription.restaurant_id,
        action: 'subscription_updated',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        old_values: oldValues,
        new_values: updates
    });

    res.json({
        success: true,
        message: 'Subscription erfolgreich aktualisiert',
        data: subscription
    });
});

// Cancel subscription
const cancelSubscription = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const subscription = await Subscription.findByPk(id, {
        include: ['restaurant']
    });

    if (!subscription) {
        throw new AppError('Subscription nicht gefunden', 404);
    }

    await subscription.cancel(reason, req.user.id);

    // Deactivate restaurant
    await subscription.restaurant.update({ 
        is_active: false,
        deactivation_reason: 'Subscription cancelled'
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: subscription.restaurant_id,
        action: 'subscription_cancelled',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        metadata: { reason }
    });

    res.json({
        success: true,
        message: 'Subscription erfolgreich storniert'
    });
});

// Extend subscription
const extendSubscription = asyncHandler(async (req, res) => {
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

    const oldEndDate = subscription.end_date;
    subscription.end_date = newEndDate;
    subscription.updated_by = req.user.id;
    await subscription.save();

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: subscription.restaurant_id,
        action: 'subscription_extended',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        metadata: {
            old_end_date: oldEndDate,
            new_end_date: newEndDate,
            extension_days
        }
    });

    res.json({
        success: true,
        message: 'Subscription erfolgreich verlängert',
        data: subscription
    });
});

// Change subscription plan
const changePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_plan_id, immediate = false } = req.body;

    const subscription = await Subscription.findByPk(id, {
        include: ['plan']
    });

    if (!subscription) {
        throw new AppError('Subscription nicht gefunden', 404);
    }

    const newPlan = await Plan.findByPk(new_plan_id);
    if (!newPlan) {
        throw new AppError('Neuer Plan nicht gefunden', 404);
    }

    const oldPlanId = subscription.plan_id;
    const oldPlanName = subscription.plan.name;

    if (immediate) {
        // Change plan immediately
        subscription.plan_id = new_plan_id;
        subscription.updated_by = req.user.id;
        await subscription.save();
    } else {
        // Schedule plan change for next billing cycle
        subscription.metadata = {
            ...subscription.metadata,
            scheduled_plan_change: {
                plan_id: new_plan_id,
                effective_date: subscription.end_date
            }
        };
        subscription.updated_by = req.user.id;
        await subscription.save();
    }

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: subscription.restaurant_id,
        action: 'subscription_plan_changed',
        category: 'subscription',
        entity_type: 'Subscription',
        entity_id: subscription.id,
        metadata: {
            old_plan: oldPlanName,
            new_plan: newPlan.name,
            immediate
        }
    });

    res.json({
        success: true,
        message: `Plan ${immediate ? 'sofort' : 'zum nächsten Abrechnungszyklus'} geändert`,
        data: subscription
    });
});

// Get expiring subscriptions
const getExpiringSubscriptions = asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;

    const subscriptions = await Subscription.getExpiringSubscriptions(parseInt(days));

    res.json({
        success: true,
        data: {
            count: subscriptions.length,
            subscriptions
        }
    });
});

// Bulk update subscriptions
const bulkUpdateSubscriptions = asyncHandler(async (req, res) => {
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
                    await subscription.activate(req.user.id);
                    break;
                case 'cancel':
                    await subscription.cancel(data?.reason, req.user.id);
                    break;
                case 'extend':
                    if (data?.days) {
                        const newEndDate = new Date(subscription.end_date);
                        newEndDate.setDate(newEndDate.getDate() + data.days);
                        subscription.end_date = newEndDate;
                        await subscription.save();
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

module.exports = {
    getAllSubscriptions,
    getSubscriptionDetails,
    createSubscription,
    updateSubscription,
    cancelSubscription,
    extendSubscription,
    changePlan,
    getExpiringSubscriptions,
    bulkUpdateSubscriptions
};