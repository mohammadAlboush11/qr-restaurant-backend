const { 
  Payment, 
  Restaurant,
  User,
  Subscription,
  ActivityLog
} = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class PaymentAdminController {
  // Get all payments - VOLLSTÄNDIG
  async getAllPayments(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20,
        restaurant_id,
        status,
        start_date,
        end_date,
        min_amount,
        max_amount,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      // Build where clause
      const where = {};
      
      if (restaurant_id) where.restaurant_id = restaurant_id;
      if (status) where.status = status;
      
      if (min_amount || max_amount) {
        where.amount = {};
        if (min_amount) where.amount[Op.gte] = parseFloat(min_amount);
        if (max_amount) where.amount[Op.lte] = parseFloat(max_amount);
      }
      
      if (start_date || end_date) {
        where.created_at = {};
        if (start_date) where.created_at[Op.gte] = new Date(start_date);
        if (end_date) where.created_at[Op.lte] = new Date(end_date);
      }

      const { count, rows } = await Payment.findAndCountAll({
        where,
        include: [
          {
            model: Restaurant,
            as: 'restaurant',
            attributes: ['id', 'name', 'slug', 'email']
          }
        ],
        order: [[sort_by, sort_order]],
        limit: parseInt(limit),
        offset
      });

      // Calculate summary statistics
      const summary = await Payment.findOne({
        where,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
          [sequelize.fn('COUNT', '*'), 'total_count'],
          [sequelize.fn('AVG', sequelize.col('amount')), 'average_amount'],
          [sequelize.fn('MIN', sequelize.col('amount')), 'min_amount'],
          [sequelize.fn('MAX', sequelize.col('amount')), 'max_amount']
        ],
        raw: true
      });

      res.json({
        success: true,
        data: {
          payments: rows.map(payment => ({
            id: payment.id,
            restaurant_id: payment.restaurant_id,
            restaurant: payment.restaurant ? {
              id: payment.restaurant.id,
              name: payment.restaurant.name,
              slug: payment.restaurant.slug,
              email: payment.restaurant.email
            } : null,
            amount: parseFloat(payment.amount).toFixed(2),
            payment_date: payment.payment_date,
            customer_name: payment.customer_name,
            notes: payment.notes,
            status: payment.status || 'completed',
            created_at: payment.created_at,
            created_by: payment.created_by
          })),
          summary: {
            total_amount: parseFloat(summary.total_amount || 0).toFixed(2),
            total_count: parseInt(summary.total_count || 0),
            average_amount: parseFloat(summary.average_amount || 0).toFixed(2),
            min_amount: parseFloat(summary.min_amount || 0).toFixed(2),
            max_amount: parseFloat(summary.max_amount || 0).toFixed(2)
          },
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get Payments Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Zahlungen',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Create payment - VOLLSTÄNDIG
  async createPayment(req, res) {
    try {
      const {
        restaurant_id,
        amount,
        payment_date,
        customer_name,
        notes,
        subscription_months
      } = req.body;

      // Validate restaurant exists
      const restaurant = await Restaurant.findByPk(restaurant_id);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Create payment
      const payment = await Payment.create({
        restaurant_id,
        amount,
        payment_date: payment_date || new Date(),
        customer_name: customer_name || restaurant.name,
        notes,
        created_by: req.user ? req.user.id : null,
        status: 'completed'
      });

      // Update subscription if specified
      if (subscription_months && Subscription) {
        const existingSubscription = await Subscription.findOne({
          where: { restaurant_id }
        });

        if (existingSubscription) {
          // Extend existing subscription
          const currentEndDate = new Date(existingSubscription.end_date);
          const newEndDate = new Date(currentEndDate);
          newEndDate.setMonth(newEndDate.getMonth() + parseInt(subscription_months));
          
          await existingSubscription.update({
            end_date: newEndDate,
            status: 'active'
          });
        } else {
          // Create new subscription
          const startDate = new Date();
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + parseInt(subscription_months));
          
          await Subscription.create({
            restaurant_id,
            status: 'active',
            start_date: startDate,
            end_date: endDate,
            price: amount
          });
        }

        // Update restaurant subscription status
        await restaurant.update({
          subscription_status: 'active',
          subscription_end_date: endDate
        });
      }

      // Log activity
      if (ActivityLog) {
        await ActivityLog.create({
          user_id: req.user ? req.user.id : null,
          restaurant_id,
          action: 'payment_created',
          category: 'payment',
          severity: 'info',
          details: {
            payment_id: payment.id,
            amount: payment.amount,
            customer_name: payment.customer_name
          }
        });
      }

      res.status(201).json({
        success: true,
        message: 'Zahlung erfolgreich erstellt',
        data: payment
      });

    } catch (error) {
      console.error('Create Payment Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen der Zahlung',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get payment details - VOLLSTÄNDIG
  async getPaymentDetails(req, res) {
    try {
      const { id } = req.params;

      const payment = await Payment.findByPk(id, {
        include: [
          {
            model: Restaurant,
            as: 'restaurant',
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['id', 'email', 'name']
              }
            ]
          }
        ]
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Zahlung nicht gefunden'
        });
      }

      res.json({
        success: true,
        data: payment
      });

    } catch (error) {
      console.error('Get Payment Details Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Zahlungsdetails',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Update payment - VOLLSTÄNDIG
  async updatePayment(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const payment = await Payment.findByPk(id);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Zahlung nicht gefunden'
        });
      }

      await payment.update(updates);

      // Log activity
      if (ActivityLog) {
        await ActivityLog.create({
          user_id: req.user ? req.user.id : null,
          restaurant_id: payment.restaurant_id,
          action: 'payment_updated',
          category: 'payment',
          severity: 'info',
          details: {
            payment_id: payment.id,
            changes: updates
          }
        });
      }

      res.json({
        success: true,
        message: 'Zahlung aktualisiert',
        data: payment
      });

    } catch (error) {
      console.error('Update Payment Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren der Zahlung',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Delete payment - VOLLSTÄNDIG
  async deletePayment(req, res) {
    try {
      const { id } = req.params;

      const payment = await Payment.findByPk(id);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Zahlung nicht gefunden'
        });
      }

      const paymentData = payment.toJSON();
      await payment.destroy();

      // Log activity
      if (ActivityLog) {
        await ActivityLog.create({
          user_id: req.user ? req.user.id : null,
          restaurant_id: paymentData.restaurant_id,
          action: 'payment_deleted',
          category: 'payment',
          severity: 'warning',
          details: {
            payment_id: paymentData.id,
            amount: paymentData.amount
          }
        });
      }

      res.json({
        success: true,
        message: 'Zahlung gelöscht'
      });

    } catch (error) {
      console.error('Delete Payment Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen der Zahlung',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get payment statistics - ZUSÄTZLICH
  async getPaymentStatistics(req, res) {
    try {
      const { year = new Date().getFullYear() } = req.query;

      // Monthly revenue for the year
      const monthlyRevenue = await sequelize.query(`
        SELECT 
          strftime('%m', payment_date) as month,
          SUM(amount) as revenue,
          COUNT(*) as count
        FROM payments
        WHERE strftime('%Y', payment_date) = :year
        GROUP BY month
        ORDER BY month
      `, {
        replacements: { year: year.toString() },
        type: sequelize.QueryTypes.SELECT
      });

      // Top paying restaurants
      const topRestaurants = await sequelize.query(`
        SELECT 
          r.id,
          r.name,
          SUM(p.amount) as total_paid,
          COUNT(p.id) as payment_count
        FROM payments p
        JOIN restaurants r ON p.restaurant_id = r.id
        WHERE strftime('%Y', p.payment_date) = :year
        GROUP BY r.id, r.name
        ORDER BY total_paid DESC
        LIMIT 10
      `, {
        replacements: { year: year.toString() },
        type: sequelize.QueryTypes.SELECT
      });

      res.json({
        success: true,
        data: {
          year,
          monthlyRevenue: monthlyRevenue.map(m => ({
            month: m.month,
            revenue: parseFloat(m.revenue || 0).toFixed(2),
            count: m.count
          })),
          topRestaurants: topRestaurants.map(r => ({
            id: r.id,
            name: r.name,
            total_paid: parseFloat(r.total_paid || 0).toFixed(2),
            payment_count: r.payment_count
          })),
          yearTotal: monthlyRevenue.reduce((sum, m) => sum + parseFloat(m.revenue || 0), 0).toFixed(2)
        }
      });

    } catch (error) {
      console.error('Payment Statistics Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Zahlungsstatistiken',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new PaymentAdminController();