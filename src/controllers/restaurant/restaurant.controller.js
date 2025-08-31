const { Restaurant, Table, QRCode, Scan } = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class RestaurantController {
  async getDashboard(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      if (!restaurantId) {
        return res.status(403).json({
          success: false,
          message: 'Kein Restaurant zugeordnet'
        });
      }

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

      const tables = restaurant.tables || [];
      const totalTables = tables.length;
      const activeQRCodes = tables.filter(t => t.qrcode_data?.is_active).length;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [totalScans, todayScans] = await Promise.all([
        Scan.count({ where: { restaurant_id: restaurantId } }),
        Scan.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { [Op.gte]: today }
          }
        })
      ]);

      const recentScans = await Scan.findAll({
        where: { restaurant_id: restaurantId },
        include: [{
          model: Table,
          as: 'table',
          attributes: ['table_number']
        }],
        order: [['created_at', 'DESC']],
        limit: 5
      });

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

  async updateProfile(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const updates = req.body;

      // Felder die nicht geändert werden dürfen
      delete updates.id;
      delete updates.owner_id;
      delete updates.subscription_status;
      delete updates.created_at;
      delete updates.updated_at;

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

  async getStatistics(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const { period = '30' } = req.query;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      // Get total and recent scans
      const [totalScans, recentScans] = await Promise.all([
        Scan.count({ 
          where: { restaurant_id: restaurantId } 
        }),
        Scan.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { [Op.gte]: startDate }
          }
        })
      ]);

      // Get top tables
      const topTables = await Table.findAll({
        where: { restaurant_id: restaurantId },
        order: [['scan_count', 'DESC']],
        limit: 5,
        attributes: ['id', 'table_number', 'scan_count']
      });

      // Get daily scans (simplified)
      const dailyScans = await Scan.findAll({
        where: {
          restaurant_id: restaurantId,
          created_at: { [Op.gte]: startDate }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
      });

      res.json({
        success: true,
        data: {
          period: period,
          total_scans: totalScans,
          recent_scans: recentScans,
          top_tables: topTables.map(t => ({
            id: t.id,
            table_number: t.table_number,
            total_scans: t.scan_count || 0
          })),
          daily_scans: dailyScans.map(d => ({
            date: d.dataValues.date,
            count: parseInt(d.dataValues.count)
          })),
          hourly_distribution: []
        }
      });

    } catch (error) {
      console.error('Get Statistics Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Statistiken',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new RestaurantController();