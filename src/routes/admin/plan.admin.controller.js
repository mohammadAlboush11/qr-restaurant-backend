/**
 * Plan Admin Controller
 * Speichern als: backend/src/controllers/admin/plan.admin.controller.js
 */

const { Plan, Subscription, ActivityLog } = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// Get all plans
const getAllPlans = asyncHandler(async (req, res) => {
    const { include_inactive = false } = req.query;

    const where = {};
    if (!include_inactive || include_inactive === 'false') {
        where.is_active = true;
    }

    const plans = await Plan.findAll({
        where,
        order: [['display_order', 'ASC']]
    });

    // Get subscription count for each plan
    const plansWithStats = await Promise.all(
        plans.map(async (plan) => {
            const subscriptionCount = await Subscription.count({
                where: { 
                    plan_id: plan.id,
                    status: 'active'
                }
            });

            return {
                ...plan.toJSON(),
                active_subscriptions: subscriptionCount
            };
        })
    );

    res.json({
        success: true,
        data: plansWithStats
    });
});

// Get plan details
const getPlanDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const plan = await Plan.findByPk(id);

    if (!plan) {
        throw new AppError('Plan nicht gefunden', 404);
    }

    // Get statistics
    const [
        totalSubscriptions,
        activeSubscriptions,
        revenue
    ] = await Promise.all([
        Subscription.count({ where: { plan_id: id } }),
        
        Subscription.count({ 
            where: { 
                plan_id: id,
                status: 'active'
            } 
        }),
        
        sequelize.query(`
            SELECT SUM(p.total_amount) as total
            FROM payments p
            JOIN subscriptions s ON p.subscription_id = s.id
            WHERE s.plan_id = :planId
            AND p.status = 'completed'
        `, {
            replacements: { planId: id },
            type: sequelize.QueryTypes.SELECT
        })
    ]);

    res.json({
        success: true,
        data: {
            plan,
            statistics: {
                totalSubscriptions,
                activeSubscriptions,
                totalRevenue: parseFloat(revenue[0]?.total || 0)
            }
        }
    });
});

// Create plan
const createPlan = asyncHandler(async (req, res) => {
    const {
        name,
        slug,
        description,
        price_monthly,
        price_yearly,
        currency = 'EUR',
        trial_days = 0,
        limits,
        features,
        display_order = 0,
        is_popular = false,
        badge_text,
        badge_color
    } = req.body;

    // Check if slug already exists
    const existingPlan = await Plan.findBySlug(slug);
    if (existingPlan) {
        throw new AppError('Ein Plan mit diesem Slug existiert bereits', 400);
    }

    const plan = await Plan.create({
        name,
        slug,
        description,
        price_monthly,
        price_yearly,
        currency,
        trial_days,
        limits,
        features,
        display_order,
        is_popular,
        badge_text,
        badge_color
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'plan_created',
        category: 'system',
        entity_type: 'Plan',
        entity_id: plan.id,
        metadata: { name, slug }
    });

    res.status(201).json({
        success: true,
        message: 'Plan erfolgreich erstellt',
        data: plan
    });
});

// Update plan
const updatePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const plan = await Plan.findByPk(id);
    if (!plan) {
        throw new AppError('Plan nicht gefunden', 404);
    }

    const oldValues = plan.toJSON();

    // Check if new slug already exists
    if (updates.slug && updates.slug !== plan.slug) {
        const existingPlan = await Plan.findBySlug(updates.slug);
        if (existingPlan) {
            throw new AppError('Ein Plan mit diesem Slug existiert bereits', 400);
        }
    }

    // Update plan
    await plan.update(updates);

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'plan_updated',
        category: 'system',
        entity_type: 'Plan',
        entity_id: plan.id,
        old_values: oldValues,
        new_values: updates
    });

    res.json({
        success: true,
        message: 'Plan erfolgreich aktualisiert',
        data: plan
    });
});

// Delete plan
const deletePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const plan = await Plan.findByPk(id);
    if (!plan) {
        throw new AppError('Plan nicht gefunden', 404);
    }

    // Check if plan has active subscriptions
    const activeSubscriptions = await Subscription.count({
        where: {
            plan_id: id,
            status: 'active'
        }
    });

    if (activeSubscriptions > 0) {
        throw new AppError(`Plan hat ${activeSubscriptions} aktive Abonnements und kann nicht gelöscht werden`, 400);
    }

    // Soft delete
    await plan.update({
        is_active: false,
        is_visible: false
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'plan_deleted',
        category: 'system',
        entity_type: 'Plan',
        entity_id: plan.id
    });

    res.json({
        success: true,
        message: 'Plan erfolgreich gelöscht'
    });
});

// Toggle plan status
const togglePlanStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { is_active, is_visible } = req.body;

    const plan = await Plan.findByPk(id);
    if (!plan) {
        throw new AppError('Plan nicht gefunden', 404);
    }

    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active;
    if (is_visible !== undefined) updates.is_visible = is_visible;

    await plan.update(updates);

    res.json({
        success: true,
        message: 'Plan Status erfolgreich aktualisiert',
        data: plan
    });
});

module.exports = {
    getAllPlans,
    getPlanDetails,
    createPlan,
    updatePlan,
    deletePlan,
    togglePlanStatus
};