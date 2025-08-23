/**
 * Restaurant Auth Controller - KORRIGIERTE VERSION
 * Speichern als: backend/src/controllers/restaurant/auth.controller.js
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Restaurant, Table } = require('../../models');
const { Op } = require('sequelize');

class AuthController {
  // Login
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validierung
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'E-Mail und Passwort sind erforderlich'
        });
      }

      console.log(`🔐 Login-Versuch für: ${email}`);

      // Benutzer mit Restaurant-Daten laden
      const user = await User.findOne({
        where: { 
          email: email.toLowerCase().trim(),
          is_active: true
        },
        include: [{
          model: Restaurant,
          as: 'restaurant',
          include: [{
            model: Table,
            as: 'tables'
          }]
        }]
      });

      if (!user) {
        console.log(`❌ Login fehlgeschlagen: Benutzer nicht gefunden - ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Ungültige E-Mail oder Passwort'
        });
      }

      // Passwort prüfen
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        console.log(`❌ Login fehlgeschlagen: Falsches Passwort - ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Ungültige E-Mail oder Passwort'
        });
      }

      // Prüfe ob Restaurant aktiv ist (nur für Restaurant-Rolle)
      if (user.role === 'restaurant' && user.restaurant && !user.restaurant.is_active) {
        console.log(`⚠️ Login verweigert: Restaurant deaktiviert - ${email}`);
        return res.status(403).json({
          success: false,
          message: 'Ihr Restaurant-Account ist deaktiviert. Bitte kontaktieren Sie den Support.'
        });
      }

      // JWT Token generieren
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          restaurant_id: user.restaurant_id
        },
        process.env.JWT_SECRET || 'your-secret-key-change-this',
        {
          expiresIn: '7d'
        }
      );

      // Update last login
      await user.update({
        last_login: new Date()
      });

      console.log(`✅ Login erfolgreich: ${email} (${user.role})`);

      // Response vorbereiten
      const userData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant_id: user.restaurant_id
      };

      // Restaurant-Daten hinzufügen wenn vorhanden
      if (user.restaurant) {
        userData.restaurant = {
          id: user.restaurant.id,
          name: user.restaurant.name,
          slug: user.restaurant.slug,
          is_active: user.restaurant.is_active,
          subscription_status: user.restaurant.subscription_status,
          subscription_end_date: user.restaurant.subscription_end_date,
          google_place_id: user.restaurant.google_place_id,
          google_review_url: user.restaurant.google_review_url,
          tables_count: user.restaurant.tables ? user.restaurant.tables.length : 0
        };
      }

      res.json({
        success: true,
        message: 'Login erfolgreich',
        token,
        user: userData
      });

    } catch (error) {
      console.error('❌ Login Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Login fehlgeschlagen',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Token validieren / Refresh
  async validateToken(req, res) {
    try {
      // User ist bereits durch Middleware authentifiziert
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] },
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: [
            'id', 'name', 'slug', 'is_active', 
            'subscription_status', 'subscription_end_date',
            'google_place_id', 'google_review_url'
          ]
        }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      // Neuer Token wenn gewünscht
      let newToken = null;
      if (req.query.refresh === 'true') {
        newToken = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            role: user.role,
            restaurant_id: user.restaurant_id
          },
          process.env.JWT_SECRET || 'your-secret-key-change-this',
          {
            expiresIn: '7d'
          }
        );
      }

      const userData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant_id: user.restaurant_id
      };

      if (user.restaurant) {
        userData.restaurant = {
          id: user.restaurant.id,
          name: user.restaurant.name,
          slug: user.restaurant.slug,
          is_active: user.restaurant.is_active,
          subscription_status: user.restaurant.subscription_status,
          subscription_end_date: user.restaurant.subscription_end_date,
          google_place_id: user.restaurant.google_place_id,
          google_review_url: user.restaurant.google_review_url
        };
      }

      res.json({
        success: true,
        valid: true,
        user: userData,
        ...(newToken && { token: newToken })
      });

    } catch (error) {
      console.error('Token Validierung Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Token-Validierung fehlgeschlagen'
      });
    }
  }

  // Passwort zurücksetzen anfordern
  async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'E-Mail Adresse erforderlich'
        });
      }

      const user = await User.findOne({
        where: { 
          email: email.toLowerCase().trim() 
        }
      });

      if (!user) {
        // Aus Sicherheitsgründen immer erfolgreiche Antwort
        return res.json({
          success: true,
          message: 'Wenn die E-Mail-Adresse existiert, wurde eine Anleitung zum Zurücksetzen gesendet.'
        });
      }

      // Reset-Token generieren
      const resetToken = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          type: 'password_reset'
        },
        process.env.JWT_SECRET || 'your-secret-key-change-this',
        { 
          expiresIn: '1h' 
        }
      );

      // Token in DB speichern
      await user.update({
        reset_token: resetToken,
        reset_token_expires: new Date(Date.now() + 3600000) // 1 Stunde
      });

      // E-Mail senden (wenn Service konfiguriert)
      if (emailService.isConfigured) {
        // E-Mail-Template würde hier gesendet
        console.log(`📧 Password-Reset E-Mail würde an ${email} gesendet`);
      }

      res.json({
        success: true,
        message: 'Wenn die E-Mail-Adresse existiert, wurde eine Anleitung zum Zurücksetzen gesendet.'
      });

    } catch (error) {
      console.error('Password Reset Request Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Zurücksetzen des Passworts'
      });
    }
  }

  // Passwort zurücksetzen
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token und neues Passwort erforderlich'
        });
      }

      // Token verifizieren
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Ungültiger oder abgelaufener Token'
        });
      }

      if (decoded.type !== 'password_reset') {
        return res.status(400).json({
          success: false,
          message: 'Ungültiger Token-Typ'
        });
      }

      // Benutzer finden
      const user = await User.findOne({
        where: {
          id: decoded.userId,
          reset_token: token,
          reset_token_expires: {
            [Op.gt]: new Date()
          }
        }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Ungültiger oder abgelaufener Token'
        });
      }

      // Neues Passwort hashen und speichern
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await user.update({
        password: hashedPassword,
        reset_token: null,
        reset_token_expires: null
      });

      console.log(`✅ Passwort zurückgesetzt für: ${user.email}`);

      res.json({
        success: true,
        message: 'Passwort erfolgreich zurückgesetzt'
      });

    } catch (error) {
      console.error('Password Reset Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Zurücksetzen des Passworts'
      });
    }
  }

  // Logout (optional - hauptsächlich für Logging)
  async logout(req, res) {
    try {
      console.log(`👋 Logout: ${req.user.email}`);
      
      // Hier könnte man Token blacklisten wenn nötig
      
      res.json({
        success: true,
        message: 'Erfolgreich abgemeldet'
      });
    } catch (error) {
      console.error('Logout Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Logout fehlgeschlagen'
      });
    }
  }
}

module.exports = new AuthController();