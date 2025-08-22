/**
 * Restaurant Controller (for Restaurant Owners)
 * Speichern als: backend/src/controllers/restaurant/restaurant.controller.js
 */

const { 
    Restaurant, 
    Subscription, 
    Plan,
    Table,
    QRCode,
    Scan,
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { cache } = require('../../config/redis');
const logger = require('../../utils/logger');

// Get restaurant dashboard
const getDashboard = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;

    // Check cache first
    const cacheKey = `restaurant:${restaurantId}:dashboard`;
    const cached = await cache.get(cacheKey);
    if (cached) {
        return res.json({
            success: true,
            data: cached,
            cached: true
        });
    }

    const restaurant = await Restaurant.findByPk(restaurantId, {
        include: [
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

    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Get statistics
    const [
        totalTables,
        activeTables,
        totalScans,
        todayScans,
        weekScans,
        monthScans,
        topTables,
        recentScans,
        hourlyDistribution
    ] = await Promise.all([
        Table.count({ where: { restaurant_id: restaurantId } }),
        
        Table.count({ 
            where: { 
                restaurant_id: restaurantId,
                is_active: true 
            } 
        }),
        
        Scan.count({ where: { restaurant_id: restaurantId } }),
        
        Scan.count({
            where: {
                restaurant_id: restaurantId,
                created_at: {
                    [sequelize.Op.gte]: new Date().setHours(0, 0, 0, 0)
                }
            }
        }),
        
        Scan.count({
            where: {
                restaurant_id: restaurantId,
                created_at: {
                    [sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                }
            }
        }),
        
        Scan.count({
            where: {
                restaurant_id: restaurantId,
                created_at: {
                    [sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                }
            }
        }),
        
        Table.getTopPerformingTables(restaurantId, 5),
        
        Scan.findAll({
            where: { restaurant_id: restaurantId },
            order: [['created_at', 'DESC']],
            limit: 10,
            include: [{
                model: Table,
                as: 'table',
                attributes: ['number', 'name']
            }]
        }),
        
        Scan.getHourlyDistribution(restaurantId, 7)
    ]);

    const dashboardData = {
        restaurant: restaurant.toOwnerJSON(),
        statistics: {
            tables: {
                total: totalTables,
                active: activeTables,
                inactive: totalTables - activeTables
            },
            scans: {
                total: totalScans,
                today: todayScans,
                week: weekScans,
                month: monthScans
            },
            topTables,
            recentScans,
            hourlyDistribution
        },
        subscription: restaurant.subscription
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, dashboardData, 300);

    res.json({
        success: true,
        data: dashboardData
    });
});

// Get restaurant details
const getRestaurantDetails = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findByPk(restaurantId, {
        include: [
            {
                model: Subscription,
                as: 'subscription',
                include: [{
                    model: Plan,
                    as: 'plan'
                }]
            },
            {
                model: Table,
                as: 'tables',
                where: { is_active: true },
                required: false
            }
        ]
    });

    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    res.json({
        success: true,
        data: restaurant.toOwnerJSON()
    });
});

// Update restaurant settings
const updateRestaurant = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const updates = req.body;

    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Fields that restaurant owners can update
    const allowedFields = [
        'name', 'description', 'address', 'contact', 
        'business_hours', 'logo_url', 'cover_image_url',
        'theme_color', 'qr_code_style', 'settings'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
        }
    });

    await restaurant.update({
        ...filteredUpdates,
        updated_by: req.user.id
    });

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    // Log activity
    await ActivityLog.logRestaurantAction(
        req.user.id,
        restaurantId,
        'restaurant_settings_updated',
        { updates: Object.keys(filteredUpdates) }
    );

    res.json({
        success: true,
        message: 'Einstellungen erfolgreich aktualisiert',
        data: restaurant.toOwnerJSON()
    });
});

// Get analytics
const getAnalytics = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { 
        start_date, 
        end_date, 
        period = '30days',
        group_by = 'day'
    } = req.query;

    // Check cache
    const cacheKey = `analytics:${restaurantId}:${period}:${group_by}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
        return res.json({
            success: true,
            data: cached,
            cached: true
        });
    }

    // Build date filter
    let dateFilter = {};
    if (start_date && end_date) {
        dateFilter = {
            created_at: {
                [sequelize.Op.between]: [new Date(start_date), new Date(end_date)]
            }
        };
    } else {
        const days = parseInt(period.replace('days', ''));
        dateFilter = {
            created_at: {
                [sequelize.Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
            }
        };
    }

    // Get various analytics
    const [
        scanTrend,
        deviceStats,
        tablePerformance,
        peakHours,
        uniqueVisitors,
        conversionRate
    ] = await Promise.all([
        // Scan trend over time
        Scan.findAll({
            where: { restaurant_id: restaurantId, ...dateFilter },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'scans'],
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('ip_address'))), 'unique_visitors']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
        }),

        // Device statistics
        Scan.getDeviceStats(restaurantId, 30),

        // Table performance
        Table.findAll({
            where: { restaurant_id: restaurantId },
            attributes: [
                'id',
                'number',
                'name',
                'total_scans',
                'daily_scans',
                'weekly_scans',
                'monthly_scans'
            ],
            order: [['total_scans', 'DESC']]
        }),

        // Peak hours
        Scan.getHourlyDistribution(restaurantId, 30),

        // Unique visitors trend
        Scan.findAll({
            where: { 
                restaurant_id: restaurantId, 
                ...dateFilter,
                is_unique: true 
            },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
        }),

        // Conversion rate (simplified - would need actual review tracking)
        Scan.findAll({
            where: { restaurant_id: restaurantId, ...dateFilter },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'total'],
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('session_id'))), 'sessions']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at'))]
        })
    ]);

    const analyticsData = {
        period: {
            start: dateFilter.created_at?.[sequelize.Op.gte] || start_date,
            end: dateFilter.created_at?.[sequelize.Op.lte] || end_date || new Date()
        },
        scanTrend,
        deviceStats,
        tablePerformance,
        peakHours,
        uniqueVisitors,
        conversionRate,
        summary: {
            totalScans: scanTrend.reduce((sum, day) => sum + parseInt(day.dataValues.scans), 0),
            totalUniqueVisitors: uniqueVisitors.reduce((sum, day) => sum + parseInt(day.dataValues.count), 0),
            averageDaily: Math.round(scanTrend.reduce((sum, day) => sum + parseInt(day.dataValues.scans), 0) / scanTrend.length)
        }
    };

    // Cache for 1 hour
    await cache.set(cacheKey, analyticsData, 3600);

    res.json({
        success: true,
        data: analyticsData
    });
});

// Export analytics data
const exportAnalytics = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { format = 'json', start_date, end_date } = req.query;

    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Build date filter
    const dateFilter = {};
    if (start_date) dateFilter[sequelize.Op.gte] = new Date(start_date);
    if (end_date) dateFilter[sequelize.Op.lte] = new Date(end_date);

    // Get all scans for export
    const scans = await Scan.findAll({
        where: {
            restaurant_id: restaurantId,
            ...(start_date || end_date ? { created_at: dateFilter } : {})
        },
        include: [{
            model: Table,
            as: 'table',
            attributes: ['number', 'name']
        }],
        order: [['created_at', 'DESC']]
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'analytics_exported',
        category: 'restaurant',
        metadata: { format, count: scans.length }
    });

    if (format === 'csv') {
        const { Parser } = require('json2csv');
        const fields = [
            'id', 'table.number', 'table.name', 'device_type',
            'browser', 'operating_system', 'country', 'city',
            'created_at'
        ];
        const parser = new Parser({ fields });
        const csv = parser.parse(scans.map(s => s.toJSON()));

        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="analytics_${restaurantId}_${Date.now()}.csv"`);
        return res.send(csv);
    }

    res.json({
        success: true,
        data: {
            restaurant: {
                id: restaurant.id,
                name: restaurant.name
            },
            period: {
                start: start_date || 'all',
                end: end_date || 'all'
            },
            count: scans.length,
            scans
        }
    });
});

// Get subscription info
const getSubscriptionInfo = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;

    const subscription = await Subscription.findOne({
        where: { restaurant_id: restaurantId },
        include: [{
            model: Plan,
            as: 'plan'
        }]
    });

    if (!subscription) {
        return res.json({
            success: true,
            data: {
                hasSubscription: false,
                message: 'Kein aktives Abonnement'
            }
        });
    }

    const daysRemaining = subscription.daysUntilExpiry();
    const usagePercentage = {
        tables: subscription.usage_stats.current_tables / subscription.plan.limits.max_tables * 100,
        scans: subscription.usage_stats.total_scans_this_period / subscription.plan.limits.max_scans_per_month * 100
    };

    res.json({
        success: true,
        data: {
            subscription,
            daysRemaining,
            usagePercentage,
            isActive: subscription.isActive(),
            isInTrial: subscription.isInTrial()
        }
    });
});

module.exports = {
    getDashboard,
    getRestaurantDetails,
    updateRestaurant,
    getAnalytics,
    exportAnalytics,
    getSubscriptionInfo
};