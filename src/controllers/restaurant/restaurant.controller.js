const { Restaurant, Table, QRCode, Scan } = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class RestaurantController {
  // Get Dashboard
  async getDashboard(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      if (!restaurantId) {
        return res.status(403).json({
          success: false,
          message: 'Kein Restaurant zugeordnet'
        });
      }

      // Restaurant mit Tabellen laden
      const restaurant = await Restaurant.findByPk(restaurantId, {
        include: [{
          model: Table,
          as: 'tables',
          include: [{
            model: QRCode,
            as: 'qrcode_data',
            required: false
          }]
        }]
      });

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Statistiken berechnen
      const tables = restaurant.tables || [];
      const totalTables = tables.length;
      const activeQRCodes = tables.filter(t => t.qrcode_data?.is_active).length;
      
      // Scan-Statistiken
      let totalScans = 0;
      let todayScans = 0;
      
      if (Scan) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        totalScans = await Scan.count({
          where: { restaurant_id: restaurantId }
        });
        
        todayScans = await Scan.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { [Op.gte]: today }
          }
        });
      }

      // Letzte Scans
      const recentScans = Scan ? await Scan.findAll({
        where: { restaurant_id: restaurantId },
        include: [{
          model: Table,
          as: 'table',
          attributes: ['table_number']
        }],
        order: [['created_at', 'DESC']],
        limit: 5
      }) : [];

      res.json({
        success: true,
        data: {
          restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            slug: restaurant.slug,
            email: restaurant.email,
            phone: restaurant.phone,
            address: restaurant.address,
            is_active: restaurant.is_active,
            subscription_status: restaurant.subscription_status,
            google_review_url: restaurant.google_review_url
          },
          statistics: {
            total_tables: totalTables,
            active_qr_codes: activeQRCodes,
            total_scans: totalScans,
            today_scans: todayScans
          },
          tables: tables.map(t => ({
            id: t.id,
            table_number: t.table_number,
            description: t.description,
            scan_count: t.scan_count || 0,
            qr_code: t.qrcode_data ? true : false,
            is_active: t.is_active
          })),
          recent_scans: recentScans.map(s => ({
            id: s.id,
            table_number: s.table?.table_number || 'Unknown',
            created_at: s.created_at
          }))
        }
      });

    } catch (error) {
      console.error('Dashboard Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden des Dashboards',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get Profile
  async getProfile(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      res.json({
        success: true,
        data: restaurant
      });

    } catch (error) {
      console.error('Get Profile Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden des Profils'
      });
    }
  }

  // Update Profile
  async updateProfile(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const updates = req.body;

      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      await restaurant.update(updates);

      res.json({
        success: true,
        message: 'Profil erfolgreich aktualisiert',
        data: restaurant
      });

    } catch (error) {
      console.error('Update Profile Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren des Profils'
      });
    }
  }

  // Get Statistics
  async getStatistics(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      // Verschiedene Zeiträume für Statistiken
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const thisWeek = new Date();
      thisWeek.setDate(thisWeek.getDate() - 7);
      
      const thisMonth = new Date();
      thisMonth.setMonth(thisMonth.getMonth() - 1);

      // Scan-Statistiken
      const [todayScans, weekScans, monthScans] = await Promise.all([
        Scan ? Scan.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { [Op.gte]: today }
          }
        }) : 0,
        Scan ? Scan.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { [Op.gte]: thisWeek }
          }
        }) : 0,
        Scan ? Scan.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { [Op.gte]: thisMonth }
          }
        }) : 0
      ]);

      // Top-Tische nach Scans
      const topTables = await sequelize.query(`
        SELECT 
          t.id,
          t.table_number,
          t.scan_count,
          COUNT(s.id) as recent_scans
        FROM tables t
        LEFT JOIN scans s ON s.table_id = t.id 
          AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        WHERE t.restaurant_id = :restaurantId
        GROUP BY t.id
        ORDER BY recent_scans DESC
        LIMIT 5
      `, {
        replacements: { restaurantId },
        type: sequelize.QueryTypes.SELECT
      });

      res.json({
        success: true,
        data: {
          scans: {
            today: todayScans,
            week: weekScans,
            month: monthScans
          },
          top_tables: topTables
        }
      });

    } catch (error) {
      console.error('Get Statistics Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Statistiken'
      });
    }
  }
}

module.exports = new RestaurantController();