/**
 * User Admin Controller
 * Speichern als: backend/src/controllers/admin/user.admin.controller.js
 */

const { 
    User, 
    Restaurant, 
    ActivityLog 
} = require('../../models');
const { sequelize } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const crypto = require('crypto');
const logger = require('../../utils/logger');

// Get all users
const getAllUsers = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 20,
        role,
        is_active,
        is_email_verified,
        search,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    
    if (role) where.role = role;
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (is_email_verified !== undefined) where.is_email_verified = is_email_verified === 'true';
    
    if (search) {
        where[sequelize.Op.or] = [
            { email: { [sequelize.Op.iLike]: `%${search}%` } },
            { first_name: { [sequelize.Op.iLike]: `%${search}%` } },
            { last_name: { [sequelize.Op.iLike]: `%${search}%` } }
        ];
    }

    const { count, rows } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password'] },
        include: [{
            model: Restaurant,
            as: 'restaurants',
            required: false,
            attributes: ['id', 'name', 'slug', 'is_active']
        }],
        order: [[sort_by, sort_order]],
        limit: parseInt(limit),
        offset
    });

    // Get additional stats
    const usersWithStats = await Promise.all(
        rows.map(async (user) => {
            const loginCount = await ActivityLog.count({
                where: {
                    user_id: user.id,
                    action: 'login_success',
                    created_at: {
                        [sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    }
                }
            });

            return {
                ...user.toJSON(),
                stats: {
                    login_count_30d: loginCount,
                    restaurants_count: user.restaurants?.length || 0
                }
            };
        })
    );

    res.json({
        success: true,
        data: {
            users: usersWithStats,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        }
    });
});

// Get user details
const getUserDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id, {
        attributes: { exclude: ['password'] },
        include: [{
            model: Restaurant,
            as: 'restaurants',
            include: ['subscription']
        }]
    });

    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Get recent activity
    const recentActivity = await ActivityLog.getUserActivities(id, 20);

    res.json({
        success: true,
        data: {
            user,
            recentActivity
        }
    });
});

// Create user
const createUser = asyncHandler(async (req, res) => {
    const {
        email,
        password,
        role = 'restaurant_owner',
        first_name,
        last_name,
        phone,
        is_active = true
    } = req.body;

    // Check if email already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
        throw new AppError('Ein Benutzer mit dieser E-Mail existiert bereits', 400);
    }

    // Create user
    const user = await User.create({
        email,
        password,
        role,
        first_name,
        last_name,
        phone,
        is_active,
        is_email_verified: true, // Admin created users are pre-verified
        created_by: req.user.id
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'user_created',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id,
        metadata: { email, role }
    });

    res.status(201).json({
        success: true,
        message: 'Benutzer erfolgreich erstellt',
        data: {
            user: user.toSafeObject(),
            credentials: {
                email,
                password,
                message: 'Bitte notieren Sie die Zugangsdaten'
            }
        }
    });
});

// Update user
const updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const user = await User.findByPk(id);
    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    const oldValues = user.toJSON();

    // Prevent changing super admin role
    if (user.role === 'super_admin' && updates.role && updates.role !== 'super_admin') {
        throw new AppError('Super Admin Rolle kann nicht geändert werden', 400);
    }

    // Allowed fields for update
    const allowedFields = [
        'email', 'role', 'first_name', 'last_name', 'phone',
        'is_active', 'is_email_verified', 'settings'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
        }
    });

    await user.update({
        ...filteredUpdates,
        updated_by: req.user.id
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'user_updated',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id,
        old_values: oldValues,
        new_values: filteredUpdates
    });

    res.json({
        success: true,
        message: 'Benutzer erfolgreich aktualisiert',
        data: user.toSafeObject()
    });
});

// Delete user
const deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Prevent deleting super admin
    if (user.role === 'super_admin') {
        throw new AppError('Super Admin kann nicht gelöscht werden', 400);
    }

    // Soft delete
    await user.update({
        is_active: false,
        deleted_at: new Date(),
        updated_by: req.user.id
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'user_deleted',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id
    });

    res.json({
        success: true,
        message: 'Benutzer erfolgreich gelöscht'
    });
});

// Reset user password
const resetUserPassword = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_password, send_email = false } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Generate password if not provided
    const password = new_password || crypto.randomBytes(8).toString('hex');

    // Update password
    user.password = password;
    user.password_reset_token = null;
    user.password_reset_expires = null;
    await user.save();

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'user_password_reset',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id,
        metadata: { by_admin: true }
    });

    res.json({
        success: true,
        message: 'Passwort erfolgreich zurückgesetzt',
        data: {
            email: user.email,
            new_password: password,
            message: send_email ? 'Passwort wurde per E-Mail gesendet' : 'Bitte teilen Sie dem Benutzer das neue Passwort mit'
        }
    });
});

// Toggle user status
const toggleUserStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { is_active, reason } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Prevent deactivating super admin
    if (user.role === 'super_admin' && !is_active) {
        throw new AppError('Super Admin kann nicht deaktiviert werden', 400);
    }

    await user.update({
        is_active,
        updated_by: req.user.id
    });

    // If deactivating, also deactivate user's restaurants
    if (!is_active) {
        await Restaurant.update(
            { 
                is_active: false,
                deactivation_reason: 'Owner account deactivated'
            },
            { 
                where: { owner_id: id }
            }
        );
    }

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: is_active ? 'user_activated' : 'user_deactivated',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id,
        metadata: { reason }
    });

    res.json({
        success: true,
        message: `Benutzer erfolgreich ${is_active ? 'aktiviert' : 'deaktiviert'}`,
        data: user.toSafeObject()
    });
});

// Unlock user account
const unlockUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    await user.resetLoginAttempts();

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'user_unlocked',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id
    });

    res.json({
        success: true,
        message: 'Benutzer-Account erfolgreich entsperrt'
    });
});

// Get user statistics
const getUserStatistics = asyncHandler(async (req, res) => {
    const [
        totalUsers,
        activeUsers,
        verifiedUsers,
        usersByRole,
        recentSignups,
        activeToday
    ] = await Promise.all([
        User.count(),
        
        User.count({ where: { is_active: true } }),
        
        User.count({ where: { is_email_verified: true } }),
        
        User.findAll({
            attributes: [
                'role',
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: ['role']
        }),
        
        User.count({
            where: {
                created_at: {
                    [sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                }
            }
        }),
        
        User.count({
            where: {
                last_login_at: {
                    [sequelize.Op.gte]: new Date().setHours(0, 0, 0, 0)
                }
            }
        })
    ]);

    res.json({
        success: true,
        data: {
            totalUsers,
            activeUsers,
            inactiveUsers: totalUsers - activeUsers,
            verifiedUsers,
            unverifiedUsers: totalUsers - verifiedUsers,
            usersByRole,
            recentSignups,
            activeToday
        }
    });
});

// Impersonate user (login as user)
const impersonateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
        throw new AppError('Benutzer nicht gefunden', 404);
    }

    if (user.role === 'super_admin') {
        throw new AppError('Super Admin kann nicht impersoniert werden', 400);
    }

    // Generate token for the user
    const { generateToken } = require('../../middleware/auth.middleware');
    const { sessionStore } = require('../../config/redis');
    
    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = generateToken(user.id, sessionId);

    // Store session
    await sessionStore.save(sessionId, {
        userId: user.id,
        email: user.email,
        role: user.role,
        impersonatedBy: req.user.id,
        loginAt: new Date(),
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        action: 'user_impersonated',
        category: 'user',
        severity: 'warning',
        entity_type: 'User',
        entity_id: user.id
    });

    res.json({
        success: true,
        message: 'Impersonierung erfolgreich',
        data: {
            user: user.toSafeObject(),
            token,
            warning: 'Sie agieren jetzt als dieser Benutzer'
        }
    });
});

// Bulk update users
const bulkUpdateUsers = asyncHandler(async (req, res) => {
    const { user_ids, action, data } = req.body;

    if (!user_ids || !Array.isArray(user_ids)) {
        throw new AppError('User IDs erforderlich', 400);
    }

    const results = {
        success: [],
        failed: []
    };

    for (const id of user_ids) {
        try {
            const user = await User.findByPk(id);
            
            if (!user) {
                results.failed.push({ id, reason: 'Nicht gefunden' });
                continue;
            }

            // Skip super admins
            if (user.role === 'super_admin') {
                results.failed.push({ id, reason: 'Super Admin kann nicht bulk-updated werden' });
                continue;
            }

            switch (action) {
                case 'activate':
                    user.is_active = true;
                    await user.save();
                    break;
                case 'deactivate':
                    user.is_active = false;
                    await user.save();
                    break;
                case 'verify_email':
                    user.is_email_verified = true;
                    user.email_verified_at = new Date();
                    await user.save();
                    break;
                case 'change_role':
                    if (data?.role) {
                        user.role = data.role;
                        await user.save();
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
    getAllUsers,
    getUserDetails,
    createUser,
    updateUser,
    deleteUser,
    resetUserPassword,
    toggleUserStatus,
    unlockUser,
    getUserStatistics,
    impersonateUser,
    bulkUpdateUsers
};