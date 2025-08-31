const { Restaurant, User, Subscription, Plan, sequelize } = require('../../models');
const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');

class RestaurantAdminController {
  // Create restaurant WITH USER ACCOUNT - Production Ready
  async createRestaurant(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        name,
        email,
        password,
        phone,
        address,
        description,
        owner_name,
        plan_id,
        google_review_url,
        google_business_url,
        notification_email
      } = req.body;

      // Logging nur in Development
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Creating restaurant', { name, email });
      }

      // Validierung
      if (!name || !email || !password) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Name, Email und Passwort sind erforderlich'
        });
      }

      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already exists
      const existingUser = await User.findOne({
        where: { email: normalizedEmail }
      });

      if (existingUser) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Ein Benutzer mit dieser E-Mail existiert bereits'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create restaurant
      const restaurant = await Restaurant.create({
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        email: normalizedEmail,
        phone,
        address,
        description,
        owner_name: owner_name || name,
        google_review_url: google_review_url || google_business_url,
        google_business_url,
        notification_email: notification_email || normalizedEmail,
        is_active: true,
        subscription_status: 'trial',
        settings: {
          currency: 'EUR',
          language: 'de',
          timezone: 'Europe/Berlin'
        }
      }, { transaction });

      // Create user account for restaurant
      const user = await User.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: owner_name || name,
        role: 'restaurant_owner',
        restaurant_id: restaurant.id,
        is_active: true,
        is_email_verified: false
      }, { transaction });

      // Update restaurant with owner_id
      await restaurant.update({ 
        owner_id: user.id 
      }, { transaction });

      await transaction.commit();

      logger.info(`Restaurant created: ${restaurant.id} - ${restaurant.name}`);

      // In createRestaurant method, ändern Sie die Response:
      res.status(201).json({
        success: true,
        message: 'Restaurant erfolgreich erstellt',
        data: {
          restaurant: restaurant,  // Statt nur restaurant
          credentials: {
            email: user.email,
            info: 'Verwenden Sie das angegebene Passwort zum Einloggen'
          }
        }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Create Restaurant Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen des Restaurants',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Weitere Methoden bleiben unverändert, nur console.logs entfernen...
  async getAllRestaurants(req, res) {
    try {
      const restaurants = await Restaurant.findAll({
        include: [
          {
            model: User,
            as: 'owner',
            attributes: ['id', 'name', 'email', 'role']
          }
        ],
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: restaurants
      });
    } catch (error) {
      logger.error('Get Restaurants Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Restaurants'
      });
    }
  }
  // Get single restaurant
  async getRestaurant(req, res) {
    try {
      const { id } = req.params;
      
      const restaurant = await Restaurant.findByPk(id, {
        include: [
          {
            model: User,
            as: 'owner',
            attributes: ['id', 'name', 'email']
          },
          {
            model: Subscription,
            as: 'subscription',
            include: [{
              model: Plan,
              as: 'plan'
            }]
          }
        ]
      });

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
      console.error('Get Restaurant Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen des Restaurants'
      });
    }
  }

  // Update restaurant
  async updateRestaurant(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const updates = req.body;

      const restaurant = await Restaurant.findByPk(id);
      
      if (!restaurant) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Update restaurant
      await restaurant.update(updates, { transaction });

      // If email is being updated, also update the user account
      if (updates.email && restaurant.owner_id) {
        await User.update(
          { email: updates.email.toLowerCase().trim() },
          { 
            where: { id: restaurant.owner_id },
            transaction 
          }
        );
      }

      // If password is provided, update it too
      if (updates.password && restaurant.owner_id) {
        const hashedPassword = await bcrypt.hash(updates.password, 10);
        await User.update(
          { password: hashedPassword },
          { 
            where: { id: restaurant.owner_id },
            transaction 
          }
        );
      }

      await transaction.commit();

      res.json({
        success: true,
        message: 'Restaurant erfolgreich aktualisiert',
        data: restaurant
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Update Restaurant Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren des Restaurants'
      });
    }
  }

  // Toggle restaurant status
  async toggleRestaurantStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;

      const restaurant = await Restaurant.findByPk(id);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      await restaurant.update({ is_active });

      // Also update user account status
      if (restaurant.owner_id) {
        await User.update(
          { is_active },
          { where: { id: restaurant.owner_id } }
        );
      }

      res.json({
        success: true,
        message: `Restaurant ${is_active ? 'aktiviert' : 'deaktiviert'}`,
        data: restaurant
      });

    } catch (error) {
      console.error('Toggle Restaurant Status Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Ändern des Restaurant-Status'
      });
    }
  }

  // Delete restaurant
  async deleteRestaurant(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const restaurant = await Restaurant.findByPk(id);
      
      if (!restaurant) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Delete associated user accounts
      await User.destroy({
        where: { restaurant_id: id },
        transaction
      });

      // Delete restaurant
      await restaurant.destroy({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Restaurant erfolgreich gelöscht'
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Delete Restaurant Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen des Restaurants'
      });
    }
  }
}

module.exports = new RestaurantAdminController();