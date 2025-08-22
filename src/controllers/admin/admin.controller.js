admin.controller.js
/**
 * Admin Main Controller
 * Speichern als: backend/src/controllers/admin/admin.controller.js
 */

const { 
    User, 
    Restaurant, 
    Subscription, 
    Plan, 
    Payment, 
    Table, 
    QRCode, 
    Scan, 
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// Dashboard Statistics
const getDashboardStats = asyncHandler(async (req, res) => {
    const { start_date, end_date } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (start_date) dateFilter[sequelize.Op.gte] = new Date(start_date);
    if (end_date) dateFilter[sequelize.Op.lte] = new Date(end_date);

    // Get statistics
    const [
        totalRestaurants,
        activeRestaurants,
        totalUsers,
        activeSubscriptions,
        totalRevenue,
        totalScans,
        recentScans,
        topRestaurants
    ] = await Promise.all([
        // Total restaurants
        Restaurant.count(),
        
        // Active restaurants
        Restaurant.count({ where: { is_active: true } }),
        
        // Total users
        User.count(),
        
        // Active subscriptions
        Subscription.count({ where: { status: 'active' } }),
        
        // Total revenue
        Payment.getTotalRevenue(dateFilter[sequelize.Op.gte], dateFilter[sequelize.Op.lte]),
        
        // Total scans
        Scan.count({
            where: start_date || end_date ? { created_at: dateFilter } : {}
        }),
        
        // Recent scans (last 24 hours)
        Scan.count({
            where: {
                created_at: {
                    [sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }
        }),
        
        // Top performing restaurants
        Restaurant.findAll({
            attributes: [
                'id',
                'name',
                'slug',
                [sequelize.literal('(SELECT COUNT(*) FROM scans WHERE scans.restaurant_id = "Restaurant"."id")'), 'scan_count']
            ],
            order: [[sequelize.literal('scan_count'), 'DESC']],
            limit: 5
        })
    ]);

    // Get revenue by month
    const revenueByMonth = await Payment.findAll({
        where: {
            status: 'completed',
            ...(start_date || end_date ? { paid_at: dateFilter } : {})
        },
        attributes: [
            [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('paid_at')), 'month'],
            [sequelize.fn('SUM', sequelize.col('total_amount')), 'revenue'],
            [sequelize.fn('COUNT', '*'), 'payment_count']
        ],
        group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('paid_at'))],
        order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('paid_at')), 'DESC']],
        limit: 12
    });

    // Get subscription distribution
    const subscriptionsByPlan = await Subscription.findAll({
        where: { status: 'active' },
        attributes: [
            'plan_id',
            [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['plan_id'],
        include: [{
            model: Plan,
            as: 'plan',
            attributes: ['name', 'price_monthly']
        }]
    });

    // Get recent activities
    const recentActivities = await ActivityLog.findAll({
        order: [['created_at', 'DESC']],
        limit: 20,
        include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'email', 'first_name', 'last_name']
        }]
    });

    // Calculate growth rates
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const [lastMonthRestaurants, lastMonthUsers] = await Promise.all([
        Restaurant.count({
            where: {
                created_at: { [sequelize.Op.lte]: lastMonth }
            }
        }),
        User.count({
            where: {
                created_at: { [sequelize.Op.lte]: lastMonth }
            }
        })
    ]);

    const restaurantGrowth = lastMonthRestaurants > 0 
        ? ((totalRestaurants - lastMonthRestaurants) / lastMonthRestaurants * 100).toFixed(2)
        : 0;
    
    const userGrowth = lastMonthUsers > 0
        ? ((totalUsers - lastMonthUsers) / lastMonthUsers * 100).toFixed(2)
        : 0;

    res.json({
        success: true,
        data: {
            overview: {
                totalRestaurants,
                activeRestaurants,
                inactiveRestaurants: totalRestaurants - activeRestaurants,
                totalUsers,
                activeSubscriptions,
                totalRevenue,
                totalScans,
                recentScans,
                restaurantGrowth,
                userGrowth
            },
            topRestaurants,
            revenueByMonth,
            subscriptionsByPlan,
            recentActivities
        }
    });
});

// Get system health
const getSystemHealth = asyncHandler(async (req, res) => {
    const { redisClient } = require('../../config/redis');
    
    // Check database connection
    let dbStatus = 'healthy';
    try {
        await sequelize.authenticate();
    } catch (error) {
        dbStatus = 'unhealthy';
    }

    // Check Redis connection
    let redisStatus = 'healthy';
    try {
        if (!redisClient.isOpen) {
            redisStatus = 'unhealthy';
        }
    } catch (error) {
        redisStatus = 'unhealthy';
    }

    // Get database size
    const dbSize = await sequelize.query(
        "SELECT pg_database_size(current_database()) as size",
        { type: sequelize.QueryTypes.SELECT }
    );

    // Get table sizes
    const tableSizes = await sequelize.query(`
        SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
    `, { type: sequelize.QueryTypes.SELECT });

    // Get error count (last 24 hours)
    const errorCount = await ActivityLog.count({
        where: {
            severity: 'error',
            created_at: {
                [sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
        }
    });

    // Server info
    const serverInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
    };

    res.json({
        success: true,
        data: {
            status: {
                database: dbStatus,
                redis: redisStatus,
                overall: dbStatus === 'healthy' && redisStatus === 'healthy' ? 'healthy' : 'degraded'
            },
            database: {
                size: dbSize[0].size,
                tables: tableSizes
            },
            errors: {
                last24Hours: errorCount
            },
            server: serverInfo
        }
    });
});

// Get activity logs
const getActivityLogs = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 50,
        user_id,
        restaurant_id,
        category,
        severity,
        start_date,
        end_date
    } = req.query;

    const offset = (page - 1) * limit;

    // Build filters
    const where = {};
    if (user_id) where.user_id = user_id;
    if (restaurant_id) where.restaurant_id = restaurant_id;
    if (category) where.category = category;
    if (severity) where.severity = severity;
    
    if (start_date || end_date) {
        where.created_at = {};
        if (start_date) where.created_at[sequelize.Op.gte] = new Date(start_date);
        if (end_date) where.created_at[sequelize.Op.lte] = new Date(end_date);
    }

    const { count, rows } = await ActivityLog.findAndCountAll({
        where,
        include: [
            {
                model: User,
                as: 'user',
                attributes: ['id', 'email', 'first_name', 'last_name', 'role']
            },
            {
                model: Restaurant,
                as: 'restaurant',
                attributes: ['id', 'name', 'slug']
            }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset
    });

    res.json({
        success: true,
        data: {
            logs: rows,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        }
    });
});

// Export data
const exportData = asyncHandler(async (req, res) => {
    const { type, format = 'json', start_date, end_date } = req.query;

    // Build date filter
    const dateFilter = {};
    if (start_date) dateFilter[sequelize.Op.gte] = new Date(start_date);
    if (end_date) dateFilter[sequelize.Op.lte] = new Date(end_date);

    let data;
    
    switch (type) {
        case 'restaurants':
            data = await Restaurant.findAll({
                include: ['owner', 'subscription']
            });
            break;
            
        case 'users':
            data = await User.findAll({
                attributes: { exclude: ['password'] }
            });
            break;
            
        case 'subscriptions':
            data = await Subscription.findAll({
                include: ['restaurant', 'plan']
            });
            break;
            
        case 'payments':
            data = await Payment.findAll({
                where: start_date || end_date ? { created_at: dateFilter } : {},
                include: ['restaurant', 'subscription']
            });
            break;
            
        case 'scans':
            data = await Scan.findAll({
                where: start_date || end_date ? { created_at: dateFilter } : {},
                include: ['restaurant', 'table']
            });
            break;
            
        default:
            return res.status(400).json({
                success: false,
                message: 'Ungültiger Export-Typ'
            });
    }

    // Log export
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'data_exported',
        category: 'system',
        metadata: { type, format, count: data.length }
    });

    // Return data based on format
    if (format === 'csv') {
        const { Parser } = require('json2csv');
        const parser = new Parser();
        const csv = parser.parse(data.map(item => item.toJSON()));
        
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="${type}_export_${Date.now()}.csv"`);
        return res.send(csv);
    }

    res.json({
        success: true,
        data: {
            type,
            count: data.length,
            exported_at: new Date(),
            data
        }
    });
});

// Clear cache
const clearCache = asyncHandler(async (req, res) => {
    const { cache } = require('../../config/redis');
    const { type = 'all' } = req.body;

    let result;
    
    if (type === 'all') {
        result = await cache.flush();
    } else if (type === 'restaurant' && req.body.restaurant_id) {
        result = await cache.invalidateRestaurant(req.body.restaurant_id);
    } else {
        return res.status(400).json({
            success: false,
            message: 'Ungültiger Cache-Typ'
        });
    }

    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'cache_cleared',
        category: 'system',
        metadata: { type }
    });

    res.json({
        success: true,
        message: 'Cache erfolgreich geleert'
    });
});

// Run maintenance tasks
const runMaintenance = asyncHandler(async (req, res) => {
    const { task } = req.body;
    
    let result;
    
    switch (task) {
        case 'clean_logs':
            // Clean logs older than 90 days
            result = await ActivityLog.cleanOldLogs(90);
            break;
            
        case 'expire_subscriptions':
            // Check and expire subscriptions
            const expiredSubs = await Subscription.getExpiredSubscriptions();
            for (const sub of expiredSubs) {
                await sub.expire();
            }
            result = `${expiredSubs.length} subscriptions expired`;
            break;
            
        case 'reset_daily_stats':
            // Reset daily statistics
            await Table.update(
                { daily_scans: 0 },
                { where: {} }
            );
            result = 'Daily stats reset';
            break;
            
        case 'optimize_database':
            // Run VACUUM ANALYZE
            await sequelize.query('VACUUM ANALYZE');
            result = 'Database optimized';
            break;
            
        default:
            return res.status(400).json({
                success: false,
                message: 'Ungültige Wartungsaufgabe'
            });
    }

    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'maintenance_task_executed',
        category: 'system',
        metadata: { task, result }
    });

    res.json({
        success: true,
        message: 'Wartungsaufgabe erfolgreich ausgeführt',
        data: { task, result }
    });
});

// Get recent errors
const getRecentErrors = asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;
    
    const errors = await ActivityLog.findAll({
        where: { severity: 'error' },
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'email']
        }]
    });

    res.json({
        success: true,
        data: errors
    });
});

module.exports = {
    getDashboardStats,
    getSystemHealth,
    getActivityLogs,
    exportData,
    clearCache,
    runMaintenance,
    getRecentErrors
};