const { User, Restaurant } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class RestaurantAuthController {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({
        where: { email: email.toLowerCase() },
        include: [{ model: Restaurant, as: 'restaurant' }]
      });

      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({
          success: false,
          message: 'Ungültige Anmeldedaten'
        });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET ,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        data: { token, user: user.toSafeObject() }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async register(req, res) {
    res.status(501).json({
      success: false,
      message: 'Registrierung über Admin Panel'
    });
  }

  async logout(req, res) {
    res.json({
      success: true,
      message: 'Logout erfolgreich'
    });
  }

  async getCurrentUser(req, res) {
    try {
      const user = await User.findByPk(req.user.id, {
        include: [{ model: Restaurant, as: 'restaurant' }]
      });
      
      res.json({
        success: true,
        data: { user: user.toSafeObject() }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Benutzerdaten'
      });
    }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const user = await User.findByPk(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Aktuelles Passwort ist falsch'
        });
      }

      user.password = newPassword; // Hook hasht automatisch
      await user.save();

      res.json({
        success: true,
        message: 'Passwort erfolgreich geändert'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Fehler beim Ändern des Passworts'
      });
    }
  }
}

module.exports = new RestaurantAuthController();