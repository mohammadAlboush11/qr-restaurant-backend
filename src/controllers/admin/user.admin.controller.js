const { 
  User, 
  Restaurant, 
  ActivityLog 
} = require('../../models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

class UserAdminController {
  // Alle Benutzer abrufen
  getAllUsers = asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20,
      role,
      is_active,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};
    
    if (role) where.role = role;
    if (is_active !== undefined) where.is_active = is_active === 'true';
    
    if (search) {
      where[Op.or] = [
        { email: { [Op.like]: `%${search}%` } },
        { name: { [Op.like]: `%${search}%` } },
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } }
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
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: {
        users: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  });

  // Benutzer Details
  getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
      include: [{
        model: Restaurant,
        as: 'restaurants'
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Benutzer nicht gefunden'
      });
    }

    // Get recent activity - vereinfacht ohne Include
    let recentActivity = [];
    if (ActivityLog && ActivityLog.getUserActivities) {
      recentActivity = await ActivityLog.getUserActivities(id, 20);
    }

    res.json({
      success: true,
      data: {
        user,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Get User Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Benutzer-Details'
    });
  }
};

  // Benutzer erstellen
  createUser = asyncHandler(async (req, res) => {
    const {
      email,
      password,
      role = 'restaurant',
      name,
      first_name,
      last_name,
      phone,
      is_active = true,
      restaurant_id
    } = req.body;

    // Email prüfen
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new AppError('Ein Benutzer mit dieser E-Mail existiert bereits', 400);
    }

    // Passwort hashen
    const hashedPassword = await bcrypt.hash(password, 10);

    // Benutzer erstellen
    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      name: name || `${first_name} ${last_name}`.trim(),
      first_name,
      last_name,
      phone,
      is_active,
      is_email_verified: true, // Admin-erstellte Benutzer sind verifiziert
      restaurant_id
    });

    // Activity Log
    if (ActivityLog && ActivityLog.logActivity) {
      await ActivityLog.logActivity({
        user_id: req.user?.id,
        action: 'user_created',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id,
        metadata: { email, role }
      });
    }

    logger.info(`User created: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Benutzer erfolgreich erstellt',
      data: {
        user: user.toSafeObject ? user.toSafeObject() : user,
        credentials: {
          email,
          password,
          message: 'Bitte notieren Sie die Zugangsdaten'
        }
      }
    });
  });

  // Benutzer aktualisieren
  updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Super Admin schützen
    if (user.role === 'super_admin' && updates.role && updates.role !== 'super_admin') {
      throw new AppError('Super Admin Rolle kann nicht geändert werden', 400);
    }

    // Erlaubte Felder
    const allowedFields = [
      'email', 'role', 'name', 'first_name', 'last_name', 
      'phone', 'is_active', 'is_email_verified', 'restaurant_id'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    await user.update(filteredUpdates);

    // Activity Log
    if (ActivityLog && ActivityLog.logActivity) {
      await ActivityLog.logActivity({
        user_id: req.user?.id,
        action: 'user_updated',
        category: 'user',
        entity_type: 'User',
        entity_id: user.id,
        new_values: filteredUpdates
      });
    }

    res.json({
      success: true,
      message: 'Benutzer erfolgreich aktualisiert',
      data: user.toSafeObject ? user.toSafeObject() : user
    });
  });

  // Benutzer löschen
  deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Super Admin schützen
    if (user.role === 'super_admin') {
      throw new AppError('Super Admin kann nicht gelöscht werden', 400);
    }

    // Soft Delete
    await user.update({
      is_active: false,
      deleted_at: new Date()
    });

    res.json({
      success: true,
      message: 'Benutzer erfolgreich gelöscht'
    });
  });

  // Passwort zurücksetzen
  resetUserPassword = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Passwort generieren falls nicht vorhanden
    const password = new_password || crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);

    await user.update({
      password: hashedPassword,
      password_reset_token: null,
      password_reset_expires: null
    });

    res.json({
      success: true,
      message: 'Passwort erfolgreich zurückgesetzt',
      data: {
        email: user.email,
        new_password: password,
        message: 'Bitte teilen Sie dem Benutzer das neue Passwort mit'
      }
    });
  });

  // Benutzer-Status umschalten
  toggleUserStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { is_active, reason } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError('Benutzer nicht gefunden', 404);
    }

    // Super Admin schützen
    if (user.role === 'super_admin' && !is_active) {
      throw new AppError('Super Admin kann nicht deaktiviert werden', 400);
    }

    await user.update({ is_active });

    // Restaurants deaktivieren wenn Benutzer deaktiviert wird
    if (!is_active) {
      await Restaurant.update(
        { is_active: false },
        { where: { user_id: id } }
      );
    }

    res.json({
      success: true,
      message: `Benutzer erfolgreich ${is_active ? 'aktiviert' : 'deaktiviert'}`,
      data: user.toSafeObject ? user.toSafeObject() : user
    });
  });

  // Benutzer entsperren
  unlockUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError('Benutzer nicht gefunden', 404);
    }

    if (user.resetLoginAttempts) {
      await user.resetLoginAttempts();
    } else {
      await user.update({
        login_attempts: 0,
        locked_until: null
      });
    }

    res.json({
      success: true,
      message: 'Benutzer-Account erfolgreich entsperrt'
    });
  });

  // Benutzer-Statistiken
  getUserStatistics = asyncHandler(async (req, res) => {
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { is_active: true } });
    const verifiedUsers = await User.count({ where: { is_email_verified: true } });
    
    // Benutzer nach Rolle
    const adminCount = await User.count({ where: { role: 'admin' } });
    const restaurantCount = await User.count({ where: { role: 'restaurant' } });

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
        usersByRole: {
          admin: adminCount,
          restaurant: restaurantCount
        }
      }
    });
  });

  // Bulk Update
  bulkUpdateUsers = asyncHandler(async (req, res) => {
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

        // Super Admin überspringen
        if (user.role === 'super_admin') {
          results.failed.push({ id, reason: 'Super Admin kann nicht bulk-updated werden' });
          continue;
        }

        switch (action) {
          case 'activate':
            await user.update({ is_active: true });
            break;
          case 'deactivate':
            await user.update({ is_active: false });
            break;
          case 'verify_email':
            await user.update({ 
              is_email_verified: true,
              email_verified_at: new Date()
            });
            break;
          case 'change_role':
            if (data?.role) {
              await user.update({ role: data.role });
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

  // Impersonate User (vereinfacht)
  impersonateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError('Benutzer nicht gefunden', 404);
    }

    if (user.role === 'super_admin') {
      throw new AppError('Super Admin kann nicht impersoniert werden', 400);
    }

    // JWT Token generieren
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurant_id: user.restaurant_id,
        impersonatedBy: req.user?.id
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      message: 'Impersonierung erfolgreich',
      data: {
        user: user.toSafeObject ? user.toSafeObject() : user,
        token,
        warning: 'Sie agieren jetzt als dieser Benutzer (1 Stunde gültig)'
      }
    });
  });
}

module.exports = new UserAdminController();