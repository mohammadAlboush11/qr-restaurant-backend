const { 
  User, 
  Restaurant, 
  Payment, 
  Table,
  Subscription,
  Plan,
  Scan,
  ActivityLog
} = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class AdminController {
  // Dashboard Statistics
  async getDashboardStats(req, res) {
    try {
      // Basis-Statistiken
      const [
        totalRestaurants,
        activeRestaurants,
        totalUsers,
        totalTables,
        totalPayments,
        totalRevenue,
        totalScans,
        recentScans,
        topRestaurants,
        recentActivities  // Vereinfacht ohne Include
      ] = await Promise.all([
        Restaurant.count(),
        Restaurant.count({ where: { is_active: true } }),
        User.count(),
        Table.count(),
        Payment.count(),
        Payment.sum('amount') || 0,
        Scan ? Scan.count() : 0,
        Scan ? Scan.count({
          where: {
            created_at: {
              [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        }) : 0,
        Restaurant.findAll({
          attributes: [
            'id',
            'name',
            'slug',
            [sequelize.literal('(SELECT COUNT(*) FROM tables WHERE tables.restaurant_id = Restaurant.id)'), 'table_count']
          ],
          order: [[sequelize.literal('table_count'), 'DESC']],
          limit: 5
        }),
        // Vereinfachte Activity Logs ohne Include
        ActivityLog ? ActivityLog.findAll({
          order: [['created_at', 'DESC']],
          limit: 10
        }) : []
      ]);

      // Revenue by Month (vereinfacht)
      const revenueByMonth = await sequelize.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          SUM(amount) as total
        FROM payments
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY month
        ORDER BY month DESC
      `, { type: sequelize.QueryTypes.SELECT }).catch(() => []);

      // Subscriptions by Plan
      const subscriptionsByPlan = Subscription && Plan ? 
        await sequelize.query(`
          SELECT 
            p.name as plan_name,
            COUNT(s.id) as count
          FROM plans p
          LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
          GROUP BY p.id, p.name
        `, { type: sequelize.QueryTypes.SELECT }).catch(() => []) : [];

      res.json({
        success: true,
        data: {
          overview: {
            totalRestaurants,
            activeRestaurants,
            inactiveRestaurants: totalRestaurants - activeRestaurants,
            totalUsers,
            totalTables,
            totalPayments,
            totalRevenue,
            totalScans,
            recentScans
          },
          topRestaurants,
          revenueByMonth,
          subscriptionsByPlan,
          recentActivities: recentActivities.map(activity => ({
            id: activity.id,
            action: activity.action,
            category: activity.category,
            created_at: activity.created_at
          }))
        }
      });

    } catch (error) {
      console.error('Dashboard Stats Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Dashboard-Statistiken',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // System Health
  async getSystemHealth(req, res) {
    try {
      // Datenbankverbindung prüfen
      let dbStatus = 'healthy';
      try {
        await sequelize.authenticate();
      } catch (error) {
        dbStatus = 'unhealthy';
      }

      res.json({
        success: true,
        data: {
          status: {
            database: dbStatus,
            overall: dbStatus
          },
          server: {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
          }
        }
      });

    } catch (error) {
      console.error('System Health Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen des System-Status'
      });
    }
  }

  // Activity Logs mit korrektem Alias
  async getActivityLogs(req, res) {
    try {
      const { limit = 50, page = 1 } = req.query;
      const offset = (page - 1) * limit;

      // Wenn ActivityLog Model existiert
      if (ActivityLog) {
        const logs = await ActivityLog.findAll({
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'name'],
              required: false
            },
            {
              model: Restaurant,
              as: 'log_restaurant',  // KORRIGIERT: Verwende den richtigen Alias
              attributes: ['id', 'name', 'slug'],
              required: false
            }
          ],
          order: [['created_at', 'DESC']],
          limit: parseInt(limit),
          offset
        });

        const count = await ActivityLog.count();

        res.json({
          success: true,
          data: {
            logs,
            pagination: {
              total: count,
              page: parseInt(page),
              limit: parseInt(limit),
              pages: Math.ceil(count / limit)
            }
          }
        });
      } else {
        // Fallback wenn Model nicht existiert
        res.json({
          success: true,
          data: {
            logs: [],
            pagination: {
              total: 0,
              page: 1,
              limit: 50,
              pages: 0
            }
          }
        });
      }

    } catch (error) {
      console.error('Activity Logs Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Activity Logs',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new AdminController();