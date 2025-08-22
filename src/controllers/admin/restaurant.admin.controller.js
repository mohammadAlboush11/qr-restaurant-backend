/**
 * Restaurant Admin Controller
 * Speichern als: backend/src/controllers/admin/restaurant.admin.controller.js
 */

const { 
    Restaurant, 
    User, 
    Subscription, 
    Plan, 
    Table, 
    QRCode,
    Scan,
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// Get all restaurants
const getAllRestaurants = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 20, 
        search, 
        is_active,
        has_subscription,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    
    if (search) {
        where[sequelize.Op.or] = [
            { name: { [sequelize.Op.iLike]: `%${search}%` } },
            { slug: { [sequelize.Op.iLike]: `%${search}%` } }
        ];
    }
    
    if (is_active !== undefined) {
        where.is_active = is_active === 'true';
    }

    // Build include
    const include = [
        {
            model: User,
            as: 'owner',
            attributes: ['id', 'email', 'first_name', 'last_name']
        }
    ];

    if (has_subscription !== undefined) {
        include.push({
            model: Subscription,
            as: 'subscription',
            required: has_subscription === 'true',
            where: has_subscription === 'true' ? { status: 'active' } : {},
            include: [{
                model: Plan,
                as: 'plan'
            }]
        });
    } else {
        include.push({
            model: Subscription,
            as: 'subscription',
            required: false,
            include: [{
                model: Plan,
                as: 'plan'
            }]
        });
    }

    const { count, rows } = await Restaurant.findAndCountAll({
        where,
        include,
        order: [[sort_by, sort_order]],
        limit: parseInt(limit),
        offset,
        distinct: true
    });

    // Get additional stats for each restaurant
    const restaurantsWithStats = await Promise.all(
        rows.map(async (restaurant) => {
            const [tableCount, scanCount] = await Promise.all([
                Table.count({ where: { restaurant_id: restaurant.id } }),
                Scan.count({ where: { restaurant_id: restaurant.id } })
            ]);

            return {
                ...restaurant.toJSON(),
                stats: {
                    tables: tableCount,
                    total_scans: scanCount
                }
            };
        })
    );

    res.json({
        success: true,
        data: {
            restaurants: restaurantsWithStats,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        }
    });
});

// Get single restaurant details
const getRestaurantDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const restaurant = await Restaurant.findByPk(id, {
        include: [
            {
                model: User,
                as: 'owner',
                attributes: { exclude: ['password'] }
            },
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
                required: false,
                include: [{
                    model: QRCode,
                    as: 'qrCode'
                }]
            }
        ]
    });

    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Get statistics
    const [
        totalScans,
        todayScans,
        weekScans,
        monthScans,
        uniqueVisitors,
        topTables,
        recentScans
    ] = await Promise.all([
        Scan.count({ where: { restaurant_id: id } }),
        
        Scan.count({
            where: {
                restaurant_id: id,
                created_at: {
                    [sequelize.Op.gte]: new Date().setHours(0, 0, 0, 0)
                }
            }
        }),
        
        Scan.count({
            where: {
                restaurant_id: id,
                created_at: {
                    [sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                }
            }
        }),
        
        Scan.count({
            where: {
                restaurant_id: id,
                created_at: {
                    [sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                }
            }
        }),
        
        Scan.count({
            where: { restaurant_id: id, is_unique: true }
        }),
        
        Scan.getTopTables(id, 5),
        
        Scan.findAll({
            where: { restaurant_id: id },
            order: [['created_at', 'DESC']],
            limit: 10
        })
    ]);

    res.json({
        success: true,
        data: {
            restaurant,
            statistics: {
                totalScans,
                todayScans,
                weekScans,
                monthScans,
                uniqueVisitors,
                topTables,
                recentScans
            }
        }
    });
});

// Create new restaurant
const createRestaurant = asyncHandler(async (req, res) => {
    const {
        name,
        slug,
        google_reviews_url,
        owner_email,
        owner_password,
        owner_first_name,
        owner_last_name,
        plan_id,
        is_active = false,
        address,
        contact
    } = req.body;

    // Start transaction
    const t = await sequelize.transaction();

    try {
        // Check if slug is unique
        const existingSlug = await Restaurant.findOne({ where: { slug } });
        if (existingSlug) {
            throw new AppError('Dieser Slug existiert bereits', 400);
        }

        // Check if user email already exists
        const existingUser = await User.findByEmail(owner_email);
        if (existingUser) {
            throw new AppError('Ein Benutzer mit dieser E-Mail existiert bereits', 400);
        }

        // Create restaurant owner
        const owner = await User.create({
            email: owner_email,
            password: owner_password,
            role: 'restaurant_owner',
            first_name: owner_first_name,
            last_name: owner_last_name,
            is_active: true,
            is_email_verified: true,
            created_by: req.user.id
        }, { transaction: t });

        // Create restaurant
        const restaurant = await Restaurant.create({
            name,
            slug: slug || await Restaurant.generateUniqueSlug(name),
            google_reviews_url,
            owner_id: owner.id,
            is_active,
            address: address || {},
            contact: contact || {},
            created_by: req.user.id
        }, { transaction: t });

        // Create subscription if plan_id provided
        if (plan_id) {
            const plan = await Plan.findByPk(plan_id);
            if (!plan) {
                throw new AppError('Plan nicht gefunden', 404);
            }

            await Subscription.create({
                restaurant_id: restaurant.id,
                plan_id: plan_id,
                status: is_active ? 'active' : 'pending',
                created_by: req.user.id
            }, { transaction: t });
        }

        // Create default tables
        await Table.bulkCreateTables(restaurant.id, 5, 'T');

        await t.commit();

        // Log activity
        await ActivityLog.logRestaurantAction(
            req.user.id,
            restaurant.id,
            'restaurant_created',
            { new: { name, owner_email } }
        );

        // Fetch complete restaurant data
        const completeRestaurant = await Restaurant.findByPk(restaurant.id, {
            include: ['owner', 'subscription', 'tables']
        });

        res.status(201).json({
            success: true,
            message: 'Restaurant erfolgreich erstellt',
            data: {
                restaurant: completeRestaurant,
                owner: {
                    email: owner_email,
                    password: owner_password,
                    message: 'Bitte notieren Sie die Zugangsdaten'
                }
            }
        });

    } catch (error) {
        await t.rollback();
        throw error;
    }
});

// Update restaurant
const updateRestaurant = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const restaurant = await Restaurant.findByPk(id);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    const oldValues = restaurant.toJSON();

    // Restricted fields that only admin can update
    const allowedFields = [
        'name', 'slug', 'description', 'google_reviews_url',
        'address', 'contact', 'business_hours', 'is_active',
        'is_verified', 'theme_color', 'qr_code_style',
        'features', 'settings', 'notes', 'deactivation_reason'
    ];

    // Filter updates
    const filteredUpdates = {};
    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
        }
    });

    // Update restaurant
    await restaurant.update({
        ...filteredUpdates,
        updated_by: req.user.id
    });

    // Log activity
    await ActivityLog.logRestaurantAction(
        req.user.id,
        restaurant.id,
        'restaurant_updated',
        { old: oldValues, new: filteredUpdates }
    );

    res.json({
        success: true,
        message: 'Restaurant erfolgreich aktualisiert',
        data: restaurant
    });
});

// Delete restaurant
const deleteRestaurant = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const restaurant = await Restaurant.findByPk(id);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Soft delete
    await restaurant.update({
        is_active: false,
        deleted_at: new Date(),
        updated_by: req.user.id
    });

    // Deactivate subscription
    const subscription = await Subscription.findOne({
        where: { restaurant_id: id }
    });
    
    if (subscription) {
        await subscription.cancel('Restaurant deleted', req.user.id);
    }

    // Log activity
    await ActivityLog.logRestaurantAction(
        req.user.id,
        restaurant.id,
        'restaurant_deleted'
    );

    res.json({
        success: true,
        message: 'Restaurant erfolgreich gelöscht'
    });
});

// Toggle restaurant status
const toggleRestaurantStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { is_active, reason } = req.body;

    const restaurant = await Restaurant.findByPk(id);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    await restaurant.update({
        is_active,
        deactivation_reason: !is_active ? reason : null,
        updated_by: req.user.id
    });

    // Log activity
    await ActivityLog.logRestaurantAction(
        req.user.id,
        restaurant.id,
        is_active ? 'restaurant_activated' : 'restaurant_deactivated',
        { reason }
    );

    res.json({
        success: true,
        message: `Restaurant erfolgreich ${is_active ? 'aktiviert' : 'deaktiviert'}`,
        data: restaurant
    });
});

// Reset restaurant owner password
const resetOwnerPassword = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;

    const restaurant = await Restaurant.findByPk(id, {
        include: ['owner']
    });

    if (!restaurant || !restaurant.owner) {
        throw new AppError('Restaurant oder Besitzer nicht gefunden', 404);
    }

    // Update password
    restaurant.owner.password = new_password;
    await restaurant.owner.save();

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: id,
        action: 'owner_password_reset',
        category: 'user',
        entity_type: 'User',
        entity_id: restaurant.owner.id
    });

    res.json({
        success: true,
        message: 'Passwort erfolgreich zurückgesetzt',
        data: {
            email: restaurant.owner.email,
            new_password,
            message: 'Bitte teilen Sie dem Besitzer das neue Passwort mit'
        }
    });
});

// Get restaurant analytics
const getRestaurantAnalytics = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { start_date, end_date, period = '30days' } = req.query;

    const restaurant = await Restaurant.findByPk(id);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
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

    // Get analytics data
    const [
        dailyScans,
        hourlyDistribution,
        deviceStats,
        topTables,
        uniqueVisitors
    ] = await Promise.all([
        // Daily scans
        Scan.findAll({
            where: { restaurant_id: id, ...dateFilter },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
        }),

        // Hourly distribution
        Scan.getHourlyDistribution(id, 30),

        // Device statistics
        Scan.getDeviceStats(id, 30),

        // Top performing tables
        Scan.getTopTables(id, 10),

        // Unique visitors over time
        Scan.findAll({
            where: { restaurant_id: id, ...dateFilter, is_unique: true },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
        })
    ]);

    res.json({
        success: true,
        data: {
            restaurant: {
                id: restaurant.id,
                name: restaurant.name,
                slug: restaurant.slug
            },
            analytics: {
                dailyScans,
                hourlyDistribution,
                deviceStats,
                topTables,
                uniqueVisitors
            }
        }
    });
});

module.exports = {
    getAllRestaurants,
    getRestaurantDetails,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    toggleRestaurantStatus,
    resetOwnerPassword,
    getRestaurantAnalytics
};