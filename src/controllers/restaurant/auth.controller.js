/**
 * Auth Controller - VOLLSTÄNDIGE VERSION
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

      // Benutzer suchen
      const user = await User.findOne({
        where: { 
          email: email.toLowerCase().trim()
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

      // Prüfe ob User aktiv ist
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account ist deaktiviert'
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

      // Last Login aktualisieren
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

      // Restaurant-Daten hinzufügen
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

  // Token validieren
  async validateToken(req, res) {
    try {
      // User ist bereits durch Middleware authentifiziert
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      res.json({
        success: true,
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          restaurant_id: user.restaurant_id,
          restaurant: user.restaurant
        }
      });

    } catch (error) {
      console.error('Token Validierung Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Token-Validierung fehlgeschlagen'
      });
    }
  }

  // Logout
  async logout(req, res) {
    try {
      console.log(`👋 Logout: ${req.user ? req.user.email : 'Unknown'}`);
      
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

      // Aus Sicherheitsgründen immer erfolgreiche Antwort
      res.json({
        success: true,
        message: 'Wenn die E-Mail-Adresse existiert, wurde eine Anleitung zum Zurücksetzen gesendet.'
      });

      if (user) {
        // Hier würde die E-Mail gesendet werden
        console.log(`Password Reset angefordert für: ${email}`);
      }

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

      // Benutzer finden und Passwort aktualisieren
      const user = await User.findByPk(decoded.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      // Neues Passwort hashen
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await user.update({ password: hashedPassword });

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
}

module.exports = new AuthController();