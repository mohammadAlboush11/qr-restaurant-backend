/**
 * Payment Admin Controller
 * Speichern als: backend/src/controllers/admin/payment.admin.controller.js
 */

const { 
    Payment, 
    Subscription, 
    Restaurant,
    Plan,
    User,
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// Get all payments
const getAllPayments = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 20,
        status,
        payment_method,
        restaurant_id,
        start_date,
        end_date,
        min_amount,
        max_amount,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    
    if (status) where.status = status;
    if (payment_method) where.payment_method = payment_method;
    if (restaurant_id) where.restaurant_id = restaurant_id;
    
    if (min_amount || max_amount) {
        where.total_amount = {};
        if (min_amount) where.total_amount[sequelize.Op.gte] = parseFloat(min_amount);
        if (max_amount) where.total_amount[sequelize.Op.lte] = parseFloat(max_amount);
    }
    
    if (start_date || end_date) {
        where.created_at = {};
        if (start_date) where.created_at[sequelize.Op.gte] = new Date(start_date);
        if (end_date) where.created_at[sequelize.Op.lte] = new Date(end_date);
    }

    const { count, rows } = await Payment.findAndCountAll({
        where,
        include: [
            {
                model: Restaurant,
                as: 'restaurant',
                attributes: ['id', 'name', 'slug']
            },
            {
                model: Subscription,
                as: 'subscription',
                include: [{
                    model: Plan,
                    as: 'plan',
                    attributes: ['name']
                }]
            }
        ],
        order: [[sort_by, sort_order]],
        limit: parseInt(limit),
        offset
    });

    // Calculate summary
    const summary = await Payment.findOne({
        where,
        attributes: [
            [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
            [sequelize.fn('COUNT', '*'), 'count'],
            [sequelize.fn('AVG', sequelize.col('total_amount')), 'average_amount']
        ]
    });

    res.json({
        success: true,
        data: {
            payments: rows,
            summary: {
                total_amount: parseFloat(summary?.dataValues?.total_amount || 0),
                count: parseInt(summary?.dataValues?.count || 0),
                average_amount: parseFloat(summary?.dataValues?.average_amount || 0)
            },
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        }
    });
});

// Get payment details
const getPaymentDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const payment = await Payment.findByPk(id, {
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
                model: Subscription,
                as: 'subscription',
                include: [{
                    model: Plan,
                    as: 'plan'
                }]
            }
        ]
    });

    if (!payment) {
        throw new AppError('Zahlung nicht gefunden', 404);
    }

    res.json({
        success: true,
        data: payment
    });
});

// Create manual payment
const createPayment = asyncHandler(async (req, res) => {
    const {
        subscription_id,
        restaurant_id,
        amount,
        payment_method = 'manual',
        status = 'pending',
        invoice_date,
        due_date,
        notes,
        items,
        tax_rate = 19,
        discount_amount = 0
    } = req.body;

    // Validate subscription
    const subscription = await Subscription.findByPk(subscription_id, {
        include: ['restaurant', 'plan']
    });

    if (!subscription) {
        throw new AppError('Subscription nicht gefunden', 404);
    }

    // Calculate amounts
    const subtotal = parseFloat(amount);
    const taxAmount = (subtotal * tax_rate) / 100;
    const totalAmount = subtotal + taxAmount - parseFloat(discount_amount);

    // Create payment
    const payment = await Payment.create({
        subscription_id,
        restaurant_id: restaurant_id || subscription.restaurant_id,
        amount: subtotal,
        currency: 'EUR',
        status,
        payment_method,
        invoice_date: invoice_date || new Date(),
        due_date,
        items: items || [{
            description: `${subscription.plan.name} Plan - ${subscription.billing_cycle}`,
            quantity: 1,
            unit_price: subtotal,
            total: subtotal
        }],
        tax_rate,
        tax_amount: taxAmount,
        discount_amount,
        total_amount: totalAmount,
        notes,
        admin_notes: `Manuell erstellt von ${req.user.email}`,
        created_by: req.user.id
    });

    // If status is completed, mark as paid
    if (status === 'completed') {
        await payment.markAsPaid(null, req.user.id);
    }

    // Log activity
    await ActivityLog.logPayment(
        req.user.id,
        subscription.restaurant_id,
        'payment_created',
        payment.id,
        { amount: totalAmount, method: payment_method }
    );

    res.status(201).json({
        success: true,
        message: 'Zahlung erfolgreich erstellt',
        data: payment
    });
});

// Update payment
const updatePayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const payment = await Payment.findByPk(id);
    if (!payment) {
        throw new AppError('Zahlung nicht gefunden', 404);
    }

    const oldValues = payment.toJSON();

    // Handle status changes
    if (updates.status && updates.status !== payment.status) {
        switch (updates.status) {
            case 'completed':
                await payment.markAsPaid(updates.transaction_id, req.user.id);
                break;
            case 'failed':
                await payment.markAsFailed(updates.failure_reason);
                break;
            case 'refunded':
                await payment.refund(
                    updates.refund_amount,
                    updates.refund_reason,
                    req.user.id
                );
                break;
            default:
                payment.status = updates.status;
                await payment.save();
        }
    }

    // Update other fields
    const allowedFields = [
        'amount', 'tax_amount', 'discount_amount', 'total_amount',
        'due_date', 'notes', 'admin_notes', 'billing_details'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
        if (updates[field] !== undefined && field !== 'status') {
            filteredUpdates[field] = updates[field];
        }
    });

    if (Object.keys(filteredUpdates).length > 0) {
        await payment.update(filteredUpdates);
    }

    // Log activity
    await ActivityLog.logPayment(
        req.user.id,
        payment.restaurant_id,
        'payment_updated',
        payment.id,
        { old: oldValues, new: updates }
    );

    res.json({
        success: true,
        message: 'Zahlung erfolgreich aktualisiert',
        data: payment
    });
});

// Mark payment as paid
const markAsPaid = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { transaction_id } = req.body;

    const payment = await Payment.findByPk(id);
    if (!payment) {
        throw new AppError('Zahlung nicht gefunden', 404);
    }

    if (payment.status === 'completed') {
        throw new AppError('Zahlung ist bereits als bezahlt markiert', 400);
    }

    await payment.markAsPaid(transaction_id, req.user.id);

    // Log activity
    await ActivityLog.logPayment(
        req.user.id,
        payment.restaurant_id,
        'payment_completed',
        payment.id,
        { transaction_id }
    );

    res.json({
        success: true,
        message: 'Zahlung erfolgreich als bezahlt markiert',
        data: payment
    });
});

// Refund payment
const refundPayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { refund_amount, reason } = req.body;

    const payment = await Payment.findByPk(id);
    if (!payment) {
        throw new AppError('Zahlung nicht gefunden', 404);
    }

    if (payment.status !== 'completed') {
        throw new AppError('Nur bezahlte Zahlungen können erstattet werden', 400);
    }

    await payment.refund(refund_amount, reason, req.user.id);

    // Log activity
    await ActivityLog.logPayment(
        req.user.id,
        payment.restaurant_id,
        'payment_refunded',
        payment.id,
        { refund_amount, reason }
    );

    res.json({
        success: true,
        message: 'Zahlung erfolgreich erstattet',
        data: payment
    });
});

// Delete payment
const deletePayment = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const payment = await Payment.findByPk(id);
    if (!payment) {
        throw new AppError('Zahlung nicht gefunden', 404);
    }

    if (payment.status === 'completed') {
        throw new AppError('Bezahlte Zahlungen können nicht gelöscht werden', 400);
    }

    await payment.destroy();

    // Log activity
    await ActivityLog.logPayment(
        req.user.id,
        payment.restaurant_id,
        'payment_deleted',
        payment.id
    );

    res.json({
        success: true,
        message: 'Zahlung erfolgreich gelöscht'
    });
});

// Get revenue statistics
const getRevenueStats = asyncHandler(async (req, res) => {
    const { start_date, end_date, group_by = 'month' } = req.query;

    // Build date filter
    const dateFilter = {};
    if (start_date) dateFilter[sequelize.Op.gte] = new Date(start_date);
    if (end_date) dateFilter[sequelize.Op.lte] = new Date(end_date);

    // Determine grouping
    let dateFormat;
    switch (group_by) {
        case 'day':
            dateFormat = 'YYYY-MM-DD';
            break;
        case 'week':
            dateFormat = 'YYYY-WW';
            break;
        case 'month':
            dateFormat = 'YYYY-MM';
            break;
        case 'year':
            dateFormat = 'YYYY';
            break;
        default:
            dateFormat = 'YYYY-MM';
    }

    // Get revenue by period
    const revenue = await Payment.findAll({
        where: {
            status: 'completed',
            paid_at: dateFilter
        },
        attributes: [
            [sequelize.fn('TO_CHAR', sequelize.col('paid_at'), dateFormat), 'period'],
            [sequelize.fn('SUM', sequelize.col('total_amount')), 'revenue'],
            [sequelize.fn('COUNT', '*'), 'payment_count'],
            [sequelize.fn('AVG', sequelize.col('total_amount')), 'average_payment']
        ],
        group: [sequelize.fn('TO_CHAR', sequelize.col('paid_at'), dateFormat)],
        order: [[sequelize.fn('TO_CHAR', sequelize.col('paid_at'), dateFormat), 'ASC']]
    });

    // Get revenue by payment method
    const revenueByMethod = await Payment.findAll({
        where: {
            status: 'completed',
            paid_at: dateFilter
        },
        attributes: [
            'payment_method',
            [sequelize.fn('SUM', sequelize.col('total_amount')), 'revenue'],
            [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['payment_method']
    });

    // Get top paying restaurants
    const topRestaurants = await Payment.findAll({
        where: {
            status: 'completed',
            paid_at: dateFilter
        },
        attributes: [
            'restaurant_id',
            [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_paid'],
            [sequelize.fn('COUNT', '*'), 'payment_count']
        ],
        group: ['restaurant_id', 'restaurant.id', 'restaurant.name'],
        include: [{
            model: Restaurant,
            as: 'restaurant',
            attributes: ['name', 'slug']
        }],
        order: [[sequelize.fn('SUM', sequelize.col('total_amount')), 'DESC']],
        limit: 10
    });

    // Get overall statistics
    const stats = await Payment.findOne({
        where: {
            status: 'completed',
            paid_at: dateFilter
        },
        attributes: [
            [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_revenue'],
            [sequelize.fn('COUNT', '*'), 'total_payments'],
            [sequelize.fn('AVG', sequelize.col('total_amount')), 'average_payment'],
            [sequelize.fn('MAX', sequelize.col('total_amount')), 'highest_payment'],
            [sequelize.fn('MIN', sequelize.col('total_amount')), 'lowest_payment']
        ]
    });

    res.json({
        success: true,
        data: {
            revenue,
            revenueByMethod,
            topRestaurants,
            statistics: {
                total_revenue: parseFloat(stats?.dataValues?.total_revenue || 0),
                total_payments: parseInt(stats?.dataValues?.total_payments || 0),
                average_payment: parseFloat(stats?.dataValues?.average_payment || 0),
                highest_payment: parseFloat(stats?.dataValues?.highest_payment || 0),
                lowest_payment: parseFloat(stats?.dataValues?.lowest_payment || 0)
            }
        }
    });
});

// Get pending payments
const getPendingPayments = asyncHandler(async (req, res) => {
    const payments = await Payment.getPendingPayments();

    const totalPending = payments.reduce((sum, payment) => 
        sum + parseFloat(payment.total_amount), 0
    );

    res.json({
        success: true,
        data: {
            count: payments.length,
            total_amount: totalPending,
            payments
        }
    });
});

// Generate invoice
const generateInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const payment = await Payment.findByPk(id, {
        include: [
            {
                model: Restaurant,
                as: 'restaurant',
                include: [{
                    model: User,
                    as: 'owner'
                }]
            },
            {
                model: Subscription,
                as: 'subscription',
                include: [{
                    model: Plan,
                    as: 'plan'
                }]
            }
        ]
    });

    if (!payment) {
        throw new AppError('Zahlung nicht gefunden', 404);
    }

    const invoice = payment.generateInvoice();

    // Here you could generate a PDF invoice
    // For now, return the invoice data

    res.json({
        success: true,
        data: {
            invoice,
            restaurant: payment.restaurant,
            payment
        }
    });
});

// Bulk update payments
const bulkUpdatePayments = asyncHandler(async (req, res) => {
    const { payment_ids, action, data } = req.body;

    if (!payment_ids || !Array.isArray(payment_ids)) {
        throw new AppError('Payment IDs erforderlich', 400);
    }

    const results = {
        success: [],
        failed: []
    };

    for (const id of payment_ids) {
        try {
            const payment = await Payment.findByPk(id);
            
            if (!payment) {
                results.failed.push({ id, reason: 'Nicht gefunden' });
                continue;
            }

            switch (action) {
                case 'mark_paid':
                    await payment.markAsPaid(null, req.user.id);
                    break;
                case 'mark_failed':
                    await payment.markAsFailed(data?.reason || 'Bulk update');
                    break;
                case 'update_status':
                    payment.status = data?.status;
                    await payment.save();
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
    getAllPayments,
    getPaymentDetails,
    createPayment,
    updatePayment,
    markAsPaid,
    refundPayment,
    deletePayment,
    getRevenueStats,
    getPendingPayments,
    generateInvoice,
    bulkUpdatePayments
};