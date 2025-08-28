const { Restaurant, User, Subscription, Plan, sequelize } = require('../../models');
const bcrypt = require('bcryptjs');


class RestaurantAdminController {
  // Create restaurant WITH USER ACCOUNT - DEBUG VERSION
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
        plan_id
      } = req.body;

      console.log('=== CREATE RESTAURANT DEBUG ===');
      console.log('Input:', { name, email, password: '***', owner_name });

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
      console.log('Normalized email:', normalizedEmail);

      // Check if email already exists
      const existingUser = await User.findOne({
        where: { email: normalizedEmail }
      });

      if (existingUser) {
        console.log('User already exists:', existingUser.email);
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Ein Benutzer mit dieser E-Mail existiert bereits'
        });
      }

      // Hash password
      console.log('Hashing password...');
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('Password hashed successfully');

      // Test hash immediately
      const testHash = await bcrypt.compare(password, hashedPassword);
      console.log('Hash test result:', testHash);

      // Create restaurant FIRST
      console.log('Creating restaurant...');
      const restaurant = await Restaurant.create({
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        email: normalizedEmail,
        phone,
        address,
        description,
        owner_name: owner_name || name,
        is_active: true,
        settings: {
          currency: 'EUR',
          language: 'de',
          timezone: 'Europe/Berlin'
        }
      }, { transaction });
      console.log('Restaurant created:', restaurant.id);

      // Create user account for restaurant
      console.log('Creating user account...');
      const user = await User.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: owner_name || name,
        role: 'restaurant_owner',
        restaurant_id: restaurant.id,
        is_active: true
      }, { transaction });
      console.log('User created:', user.id, user.email);

      // Verify user was created correctly
      const verifyUser = await User.findOne({
        where: { email: normalizedEmail },
        transaction
      });
      console.log('User verification:', verifyUser ? 'Found' : 'Not found');

      // Update restaurant with owner_id
      await restaurant.update({ 
        owner_id: user.id 
      }, { transaction });

      await transaction.commit();

      console.log('=== RESTAURANT CREATED SUCCESSFULLY ===');
      console.log('Restaurant ID:', restaurant.id);
      console.log('User Email:', user.email);
      console.log('User Role:', user.role);

      res.status(201).json({
        success: true,
        message: 'Restaurant erfolgreich erstellt',
        data: {
          restaurant,
          credentials: {
            email: user.email,
            info: 'Verwenden Sie das angegebene Passwort zum Einloggen'
          }
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Create Restaurant Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen des Restaurants',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get all restaurants
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

      // Debug: Check if users exist for restaurants
      for (const restaurant of restaurants) {
        const users = await User.findAll({
          where: { restaurant_id: restaurant.id },
          attributes: ['id', 'email', 'role']
        });
        console.log(`Restaurant ${restaurant.name} has ${users.length} users:`, users.map(u => u.email));
      }

      res.json({
        success: true,
        data: restaurants
      });
    } catch (error) {
      console.error('Get Restaurants Error:', error);
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