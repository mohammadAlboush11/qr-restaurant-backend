const { Plan, Subscription, Restaurant } = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class PlanAdminController {
  // Get all plans
  async getAllPlans(req, res) {
    try {
      const { include_inactive = false } = req.query;
      
      const where = {};
      if (!include_inactive || include_inactive === 'false') {
        where.is_active = true;
      }

      const plans = await Plan.findAll({
        where,
        order: [['price', 'ASC']]
      });

      // Add subscription count for each plan
      const plansWithStats = await Promise.all(
        plans.map(async (plan) => {
          const subscriptionCount = await Subscription.count({
            where: { 
              plan_id: plan.id,
              status: 'active'
            }
          });

          return {
            ...plan.toJSON(),
            active_subscriptions: subscriptionCount
          };
        })
      );

      res.json({
        success: true,
        data: plansWithStats
      });
    } catch (error) {
      console.error('Get Plans Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Pläne'
      });
    }
  }

  // Get plan details
  async getPlanDetails(req, res) {
    try {
      const { id } = req.params;

      const plan = await Plan.findByPk(id);
      
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan nicht gefunden'
        });
      }

      // Get statistics
      const [totalSubscriptions, activeSubscriptions, revenue] = await Promise.all([
        Subscription.count({ where: { plan_id: id } }),
        Subscription.count({ where: { plan_id: id, status: 'active' } }),
        sequelize.query(`
          SELECT SUM(p.amount) as total
          FROM payments p
          JOIN subscriptions s ON p.restaurant_id = s.restaurant_id
          WHERE s.plan_id = :planId
        `, {
          replacements: { planId: id },
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      res.json({
        success: true,
        data: {
          plan,
          statistics: {
            totalSubscriptions,
            activeSubscriptions,
            totalRevenue: parseFloat(revenue[0]?.total || 0)
          }
        }
      });
    } catch (error) {
      console.error('Get Plan Details Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Plan-Details'
      });
    }
  }

  // Create plan
  async createPlan(req, res) {
    try {
      const {
        name,
        slug,
        description,
        price,
        duration_months,
        max_tables,
        features,
        is_active = true
      } = req.body;

      // Check if slug exists
      const existingPlan = await Plan.findOne({ where: { slug } });
      if (existingPlan) {
        return res.status(400).json({
          success: false,
          message: 'Ein Plan mit diesem Slug existiert bereits'
        });
      }

      const plan = await Plan.create({
        name,
        slug,
        description,
        price,
        duration_months,
        max_tables,
        features: Array.isArray(features) ? JSON.stringify(features) : features,
        is_active
      });

      res.status(201).json({
        success: true,
        message: 'Plan erfolgreich erstellt',
        data: plan
      });
    } catch (error) {
      console.error('Create Plan Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen des Plans'
      });
    }
  }

  // Update plan
  async updatePlan(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const plan = await Plan.findByPk(id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan nicht gefunden'
        });
      }

      // Check if new slug already exists
      if (updates.slug && updates.slug !== plan.slug) {
        const existingPlan = await Plan.findOne({ 
          where: { 
            slug: updates.slug,
            id: { [Op.ne]: id }
          } 
        });
        
        if (existingPlan) {
          return res.status(400).json({
            success: false,
            message: 'Ein Plan mit diesem Slug existiert bereits'
          });
        }
      }

      // Handle features array
      if (updates.features && Array.isArray(updates.features)) {
        updates.features = JSON.stringify(updates.features);
      }

      await plan.update(updates);

      res.json({
        success: true,
        message: 'Plan erfolgreich aktualisiert',
        data: plan
      });
    } catch (error) {
      console.error('Update Plan Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren des Plans'
      });
    }
  }

  // Delete plan
  async deletePlan(req, res) {
    try {
      const { id } = req.params;

      const plan = await Plan.findByPk(id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan nicht gefunden'
        });
      }

      // Check for active subscriptions
      const activeSubscriptions = await Subscription.count({
        where: {
          plan_id: id,
          status: 'active'
        }
      });

      if (activeSubscriptions > 0) {
        return res.status(400).json({
          success: false,
          message: `Plan hat ${activeSubscriptions} aktive Abonnements und kann nicht gelöscht werden`
        });
      }

      // Soft delete
      await plan.update({ is_active: false });

      res.json({
        success: true,
        message: 'Plan erfolgreich deaktiviert'
      });
    } catch (error) {
      console.error('Delete Plan Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen des Plans'
      });
    }
  }

  // Toggle plan status
  async togglePlanStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;

      const plan = await Plan.findByPk(id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan nicht gefunden'
        });
      }

      await plan.update({ is_active });

      res.json({
        success: true,
        message: `Plan ${is_active ? 'aktiviert' : 'deaktiviert'}`,
        data: plan
      });
    } catch (error) {
      console.error('Toggle Plan Status Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Ändern des Plan-Status'
      });
    }
  }
}

module.exports = new PlanAdminController();