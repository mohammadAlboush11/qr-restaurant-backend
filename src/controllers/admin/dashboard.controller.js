/**
 * Admin Dashboard Controller
 * Speichern als: backend/src/controllers/admin/dashboard.controller.js
 */

const { Restaurant, User, Table, QRCode, Payment, Subscription } = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class AdminDashboardController {
  async getDashboard(req, res) {
    try {
      // Basis-Statistiken
      const [
        totalRestaurants,
        activeRestaurants,
        totalUsers,
        totalTables,
        totalPayments
      ] = await Promise.all([
        Restaurant.count(),
        Restaurant.count({ where: { is_active: true } }),
        User.count(),
        Table.count(),
        Payment ? Payment.count() : 0
      ]);

      // Revenue berechnen
      let totalRevenue = 0;
      if (Payment) {
        const revenue = await Payment.sum('amount') || 0;
        totalRevenue = revenue;
      }

      // Top Restaurants (nach Tabellen)
      const topRestaurants = await Restaurant.findAll({
        attributes: [
          'id',
          'name',
          'subscription_status',
          [sequelize.literal('(SELECT COUNT(*) FROM tables WHERE tables.restaurant_id = Restaurant.id)'), 'table_count']
        ],
        order: [[sequelize.literal('table_count'), 'DESC']],
        limit: 5
      });

      // Recent Activities
      const recentActivities = [];
      
      // Letzte Restaurants
      const recentRestaurants = await Restaurant.findAll({
        order: [['created_at', 'DESC']],
        limit: 5
      });
      
      recentRestaurants.forEach(r => {
        recentActivities.push({
          type: 'restaurant_created',
          message: `Restaurant "${r.name}" wurde erstellt`,
          timestamp: r.created_at
        });
      });

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
            totalScans: 0,
            recentScans: 0
          },
          topRestaurants: topRestaurants.map(r => ({
            id: r.id,
            name: r.name,
            subscription_status: r.subscription_status,
            table_count: r.dataValues.table_count || 0
          })),
          revenueByMonth: [],
          subscriptionsByPlan: {
            trial: await Restaurant.count({ where: { subscription_status: 'trial' } }),
            active: await Restaurant.count({ where: { subscription_status: 'active' } }),
            cancelled: await Restaurant.count({ where: { subscription_status: 'cancelled' } })
          },
          recentActivities
        }
      });

    } catch (error) {
      console.error('Admin Dashboard Error:', error);
      res.status(500).json({
        success: false,
        message: 'Dashboard konnte nicht geladen werden'
      });
    }
  }
}

module.exports = new AdminDashboardController();