/**
 * Table Controller
 * Speichern als: backend/src/controllers/restaurant/table.controller.js
 */

const { 
    Table, 
    QRCode, 
    Scan,
    Restaurant,
    Subscription,
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { cache } = require('../../config/redis');
const logger = require('../../utils/logger');

// Get all tables
const getAllTables = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { 
        is_active,
        location,
        sort_by = 'number',
        sort_order = 'ASC'
    } = req.query;

    // Build where clause
    const where = { restaurant_id: restaurantId };
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (location) where.location = location;

    const tables = await Table.findAll({
        where,
        include: [{
            model: QRCode,
            as: 'qrCode',
            where: { is_active: true },
            required: false
        }],
        order: [[sort_by, sort_order]]
    });

    // Add scan statistics
    const tablesWithStats = await Promise.all(
        tables.map(async (table) => {
            const lastScan = await Scan.findOne({
                where: { table_id: table.id },
                order: [['created_at', 'DESC']]
            });

            return {
                ...table.toJSON(),
                lastScan: lastScan?.created_at || null
            };
        })
    );

    res.json({
        success: true,
        data: tablesWithStats
    });
});

// Get single table
const getTable = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        },
        include: [{
            model: QRCode,
            as: 'qrCode'
        }]
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    // Get recent scans
    const recentScans = await Scan.findAll({
        where: { table_id: tableId },
        order: [['created_at', 'DESC']],
        limit: 20
    });

    res.json({
        success: true,
        data: {
            table,
            recentScans
        }
    });
});

// Create table
const createTable = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const {
        number,
        name,
        description,
        capacity,
        location = 'indoor',
        floor,
        section,
        qr_code_position = 'table_top'
    } = req.body;

    // Check subscription limits
    const subscription = await Subscription.findActiveByRestaurant(restaurantId);
    if (subscription) {
        const canAddTable = await subscription.checkLimit('tables');
        if (!canAddTable) {
            throw new AppError('Tisch-Limit erreicht. Bitte upgraden Sie Ihren Plan.', 403);
        }
    }

    // Check if table number already exists
    const existingTable = await Table.findByNumber(restaurantId, number);
    if (existingTable) {
        throw new AppError('Eine Tisch mit dieser Nummer existiert bereits', 400);
    }

    // Create table
    const table = await Table.create({
        restaurant_id: restaurantId,
        number,
        name,
        description,
        capacity,
        location,
        floor,
        section,
        qr_code_position,
        created_by: req.user.id
    });

    // Update subscription usage
    if (subscription) {
        await subscription.incrementUsage('current_tables');
    }

    // QR Code is created automatically via hook

    // Get table with QR code
    const completeTable = await Table.findByPk(table.id, {
        include: [{
            model: QRCode,
            as: 'qrCode'
        }]
    });

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'table_created',
        category: 'table',
        entity_type: 'Table',
        entity_id: table.id,
        metadata: { number, name }
    });

    res.status(201).json({
        success: true,
        message: 'Tisch erfolgreich erstellt',
        data: completeTable
    });
});

// Update table
const updateTable = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;
    const updates = req.body;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        }
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    // Check if new number already exists
    if (updates.number && updates.number !== table.number) {
        const existingTable = await Table.findByNumber(restaurantId, updates.number);
        if (existingTable) {
            throw new AppError('Eine Tisch mit dieser Nummer existiert bereits', 400);
        }
    }

    // Allowed fields
    const allowedFields = [
        'number', 'name', 'description', 'capacity',
        'location', 'floor', 'section', 'qr_code_position',
        'is_active', 'custom_redirect_url', 'notes'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
        }
    });

    await table.update({
        ...filteredUpdates,
        updated_by: req.user.id
    });

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'table_updated',
        category: 'table',
        entity_type: 'Table',
        entity_id: table.id,
        metadata: { updates: Object.keys(filteredUpdates) }
    });

    res.json({
        success: true,
        message: 'Tisch erfolgreich aktualisiert',
        data: table
    });
});

// Delete table
const deleteTable = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        }
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    // Soft delete
    await table.update({
        is_active: false,
        deleted_at: new Date(),
        updated_by: req.user.id
    });

    // Deactivate QR code
    const qrCode = await QRCode.findOne({
        where: { table_id: tableId }
    });
    if (qrCode) {
        await qrCode.deactivate();
    }

    // Update subscription usage
    const subscription = await Subscription.findActiveByRestaurant(restaurantId);
    if (subscription && subscription.usage_stats.current_tables > 0) {
        subscription.usage_stats.current_tables--;
        await subscription.save();
    }

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'table_deleted',
        category: 'table',
        entity_type: 'Table',
        entity_id: table.id
    });

    res.json({
        success: true,
        message: 'Tisch erfolgreich gelöscht'
    });
});

// Bulk create tables
const bulkCreateTables = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { count, prefix = 'T', start_number = 1, location = 'indoor' } = req.body;

    if (!count || count < 1 || count > 50) {
        throw new AppError('Anzahl muss zwischen 1 und 50 liegen', 400);
    }

    // Check subscription limits
    const subscription = await Subscription.findActiveByRestaurant(restaurantId);
    if (subscription) {
        const currentTables = await Table.count({
            where: { restaurant_id: restaurantId, is_active: true }
        });
        const plan = await subscription.plan;
        const maxTables = plan.limits.max_tables;
        
        if (maxTables !== -1 && currentTables + count > maxTables) {
            throw new AppError(`Tisch-Limit würde überschritten. Maximal ${maxTables - currentTables} Tische können hinzugefügt werden.`, 403);
        }
    }

    const tables = [];
    for (let i = 0; i < count; i++) {
        const number = `${prefix}${start_number + i}`;
        
        // Check if number already exists
        const exists = await Table.findByNumber(restaurantId, number);
        if (!exists) {
            tables.push({
                restaurant_id: restaurantId,
                number,
                name: `Tisch ${number}`,
                location,
                created_by: req.user.id
            });
        }
    }

    if (tables.length === 0) {
        throw new AppError('Alle Tischnummern existieren bereits', 400);
    }

    const createdTables = await Table.bulkCreate(tables, {
        individualHooks: true, // This triggers QR code creation
        returning: true
    });

    // Update subscription usage
    if (subscription) {
        subscription.usage_stats.current_tables += createdTables.length;
        await subscription.save();
    }

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'tables_bulk_created',
        category: 'table',
        metadata: { count: createdTables.length, prefix, start_number }
    });

    res.status(201).json({
        success: true,
        message: `${createdTables.length} Tische erfolgreich erstellt`,
        data: createdTables
    });
});

// Toggle table status
const toggleTableStatus = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;
    const { is_active } = req.body;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        }
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    await table.update({
        is_active,
        updated_by: req.user.id
    });

    // Update QR code status
    const qrCode = await QRCode.findOne({
        where: { table_id: tableId }
    });
    if (qrCode) {
        if (is_active) {
            await qrCode.reactivate();
        } else {
            await qrCode.deactivate();
        }
    }

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    res.json({
        success: true,
        message: `Tisch erfolgreich ${is_active ? 'aktiviert' : 'deaktiviert'}`,
        data: table
    });
});

// Get table analytics
const getTableAnalytics = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;
    const { period = '30days' } = req.query;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        }
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    const analytics = await table.getAnalytics(period);
    const hourlyDistribution = await Scan.findAll({
        where: { table_id: tableId },
        attributes: [
            [sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM created_at')), 'hour'],
            [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM created_at'))],
        order: [[sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM created_at')), 'ASC']]
    });

    res.json({
        success: true,
        data: {
            table: {
                id: table.id,
                number: table.number,
                name: table.name,
                total_scans: table.total_scans
            },
            analytics,
            hourlyDistribution
        }
    });
});

// Reset table statistics
const resetTableStats = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;
    const { reset_type = 'daily' } = req.body;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        }
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    switch (reset_type) {
        case 'daily':
            await table.resetDailyScans();
            break;
        case 'weekly':
            await table.resetWeeklyScans();
            break;
        case 'monthly':
            await table.resetMonthlyScans();
            break;
        case 'all':
            table.total_scans = 0;
            table.daily_scans = 0;
            table.weekly_scans = 0;
            table.monthly_scans = 0;
            table.scan_statistics = {
                peak_hour: null,
                average_scans_per_day: 0,
                last_reset_date: new Date()
            };
            await table.save();
            break;
        default:
            throw new AppError('Ungültiger Reset-Typ', 400);
    }

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'table_stats_reset',
        category: 'table',
        entity_type: 'Table',
        entity_id: table.id,
        metadata: { reset_type }
    });

    res.json({
        success: true,
        message: 'Statistiken erfolgreich zurückgesetzt',
        data: table
    });
});

// Bulk update tables
const bulkUpdateTables = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { table_ids, updates } = req.body;

    if (!table_ids || !Array.isArray(table_ids)) {
        throw new AppError('Table IDs erforderlich', 400);
    }

    // Allowed fields for bulk update
    const allowedFields = ['location', 'is_active', 'qr_code_position'];
    const filteredUpdates = {};
    
    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
        }
    });

    if (Object.keys(filteredUpdates).length === 0) {
        throw new AppError('Keine gültigen Updates angegeben', 400);
    }

    const result = await Table.update(
        {
            ...filteredUpdates,
            updated_by: req.user.id
        },
        {
            where: {
                id: table_ids,
                restaurant_id: restaurantId
            }
        }
    );

    // Invalidate cache
    await cache.invalidateRestaurant(restaurantId);

    res.json({
        success: true,
        message: `${result[0]} Tische erfolgreich aktualisiert`
    });
});

module.exports = {
    getAllTables,
    getTable,
    createTable,
    updateTable,
    deleteTable,
    bulkCreateTables,
    toggleTableStatus,
    getTableAnalytics,
    resetTableStats,
    bulkUpdateTables
};