const { User, Restaurant } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production-2024';

class RestaurantAuthController {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      console.log('Restaurant Login attempt for:', email);

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email und Passwort sind erforderlich'
        });
      }

      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();

      // Find user with CORRECT alias
      const user = await User.findOne({
        where: { 
          email: normalizedEmail
        },
        include: [{
          model: Restaurant,
          as: 'restaurant'  // SINGULAR!
        }]
      });

      if (!user) {
        console.log('User not found:', normalizedEmail);
        return res.status(401).json({
          success: false,
          message: 'Ungültige Anmeldedaten'
        });
      }

      console.log('User found:', user.email, 'Role:', user.role);

      // Check role
      if (user.role !== 'restaurant' && user.role !== 'restaurant_owner') {
        return res.status(403).json({
          success: false,
          message: 'Keine Restaurant-Berechtigung'
        });
      }

      // Check if active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account ist deaktiviert'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        console.log('Invalid password for user:', user.email);
        return res.status(401).json({
          success: false,
          message: 'Ungültige Anmeldedaten'
        });
      }

      // Generate token
      const token = jwt.sign(
        {
          id: user.id,
          userId: user.id,
          email: user.email,
          role: user.role,
          restaurant_id: user.restaurant_id
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Update last login
      await user.update({ last_login: new Date() });

      console.log('Login successful for:', user.email);

      res.json({
        success: true,
        message: 'Login erfolgreich',
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            restaurant_id: user.restaurant_id,
            restaurant: user.restaurant ? {
              id: user.restaurant.id,
              name: user.restaurant.name,
              slug: user.restaurant.slug
            } : null
          }
        }
      });

    } catch (error) {
      console.error('Restaurant Login Error:', error);
      res.status(500).json({
        success: false,
        message: 'Server-Fehler beim Login'
      });
    }
  }

  // Other methods remain the same but use 'restaurant' (singular) alias
}

module.exports = new RestaurantAuthController();