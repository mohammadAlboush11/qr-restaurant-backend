const { User } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET ;

class AdminAuthController {
  // Admin Login
  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      console.log(`ðŸ” Admin Login-Versuch: ${email}`);

      // Benutzer finden
      const user = await User.findOne({
        where: { 
          email: email.toLowerCase().trim()
        }
      });

      if (!user) {
        console.log(`âŒ Admin Login fehlgeschlagen: Benutzer nicht gefunden - ${email}`);
        return res.status(401).json({
          success: false,
          message: 'UngÃ¼ltige Anmeldedaten'
        });
      }

      // PrÃ¼fe ob User Admin ist
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        console.log(`âŒ Admin Login fehlgeschlagen: Keine Admin-Rechte - ${email}`);
        return res.status(403).json({
          success: false,
          message: 'Keine Admin-Berechtigung'
        });
      }

      // Passwort prÃ¼fen
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        console.log(`âŒ Admin Login fehlgeschlagen: Falsches Passwort - ${email}`);
        return res.status(401).json({
          success: false,
          message: 'UngÃ¼ltige Anmeldedaten'
        });
      }

      // Token generieren
      const token = jwt.sign(
        {
          id: user.id,
          userId: user.id,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Login-Zeit aktualisieren
      await user.update({ last_login: new Date() });

      console.log(`âœ… Admin Login erfolgreich: ${email}`);

      // Response
      res.json({
        success: true,
        message: 'Admin Login erfolgreich',
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name || 'Admin',
            role: user.role
          }
        }
      });

    } catch (error) {
      console.error('Admin Login Error:', error);
      res.status(500).json({
        success: false,
        message: 'Server-Fehler beim Login',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get Current User
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.id;
      
      const user = await User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          }
        }
      });

    } catch (error) {
      console.error('Get Current User Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Benutzerdaten'
      });
    }
  }

  // Logout
  async logout(req, res) {
    res.json({
      success: true,
      message: 'Logout erfolgreich'
    });
  }
}

module.exports = new AdminAuthController();