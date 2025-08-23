/**
 * Restaurant Controller - OHNE REDIS ABHÄNGIGKEIT
 * Speichern als: backend/src/controllers/restaurant/restaurant.controller.js
 */

const { Restaurant, Table, User } = require('../../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

// Optional Redis - wird nicht verwendet wenn nicht verfügbar
let redisClient = null;
try {
  redisClient = require('../../config/redis');
} catch (error) {
  console.log('ℹ️ Redis nicht verfügbar - Cache deaktiviert');
}

class RestaurantController {
  // Dashboard Daten
  async getDashboard(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          message: 'Kein Restaurant zugeordnet'
        });
      }

      const restaurant = await Restaurant.findByPk(restaurantId, {
        include: [{
          model: Table,
          as: 'tables',
          attributes: ['id', 'table_number', 'qr_code', 'scan_count']
        }]
      });

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Statistiken berechnen
      const totalTables = restaurant.tables ? restaurant.tables.length : 0;
      const totalScans = restaurant.tables 
        ? restaurant.tables.reduce((sum, table) => sum + (table.scan_count || 0), 0)
        : 0;

      // Dashboard-Daten
      const dashboardData = {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          email: restaurant.email,
          phone: restaurant.phone,
          address: restaurant.address,
          is_active: restaurant.is_active,
          subscription_status: restaurant.subscription_status,
          subscription_end_date: restaurant.subscription_end_date,
          google_place_id: restaurant.google_place_id,
          google_review_url: restaurant.google_review_url,
          last_review_count: restaurant.last_review_count,
          current_rating: restaurant.current_rating
        },
        statistics: {
          total_tables: totalTables,
          total_scans: totalScans,
          active_tables: totalTables,
          reviews_this_month: 0 // Könnte später implementiert werden
        },
        tables: restaurant.tables || []
      };

      res.json({
        success: true,
        data: dashboardData
      });

    } catch (error) {
      console.error('Dashboard Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden des Dashboards'
      });
    }
  }

  // Restaurant-Profil abrufen
  async getProfile(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      res.json({
        success: true,
        data: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          email: restaurant.email,
          phone: restaurant.phone,
          address: restaurant.address,
          description: restaurant.description,
          google_place_id: restaurant.google_place_id,
          google_review_url: restaurant.google_review_url,
          website: restaurant.website,
          opening_hours: restaurant.opening_hours,
          is_active: restaurant.is_active,
          subscription_status: restaurant.subscription_status,
          subscription_end_date: restaurant.subscription_end_date,
          created_at: restaurant.created_at,
          updated_at: restaurant.updated_at
        }
      });

    } catch (error) {
      console.error('Profil abrufen Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen des Profils'
      });
    }
  }

  // Restaurant-Profil aktualisieren
  async updateProfile(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const updates = req.body;
      
      // Felder die nicht aktualisiert werden dürfen
      const protectedFields = ['id', 'user_id', 'subscription_status', 'subscription_end_date', 'is_active'];
      protectedFields.forEach(field => delete updates[field]);

      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Restaurant aktualisieren
      await restaurant.update(updates);

      // Cache invalidieren wenn Redis verfügbar
      if (redisClient && redisClient.isConnected()) {
        await redisClient.del(`restaurant:${restaurantId}`);
      }

      res.json({
        success: true,
        message: 'Profil erfolgreich aktualisiert',
        data: restaurant
      });

    } catch (error) {
      console.error('Profil Update Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren des Profils'
      });
    }
  }

  // Passwort ändern
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Aktuelles und neues Passwort erforderlich'
        });
      }

      // Benutzer mit Passwort laden
      const user = await User.findByPk(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Benutzer nicht gefunden'
        });
      }

      // Aktuelles Passwort prüfen
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Aktuelles Passwort ist falsch'
        });
      }

      // Neues Passwort hashen und speichern
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await user.update({ password: hashedPassword });

      res.json({
        success: true,
        message: 'Passwort erfolgreich geändert'
      });

    } catch (error) {
      console.error('Passwort ändern Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Ändern des Passworts'
      });
    }
  }

  // Restaurant-Statistiken
  async getStatistics(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const { period = '7d' } = req.query;

      // Zeitraum berechnen
      let startDate = new Date();
      switch(period) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Basis-Statistiken abrufen
      const restaurant = await Restaurant.findByPk(restaurantId, {
        include: [{
          model: Table,
          as: 'tables'
        }]
      });

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      // Statistiken berechnen
      const stats = {
        period: period,
        total_tables: restaurant.tables.length,
        total_scans: restaurant.tables.reduce((sum, table) => sum + (table.scan_count || 0), 0),
        average_scans_per_table: restaurant.tables.length > 0 
          ? (restaurant.tables.reduce((sum, table) => sum + (table.scan_count || 0), 0) / restaurant.tables.length).toFixed(2)
          : 0,
        most_scanned_table: restaurant.tables.reduce((max, table) => 
          (table.scan_count || 0) > (max.scan_count || 0) ? table : max, 
          { table_number: 'N/A', scan_count: 0 }
        ),
        review_stats: {
          total_reviews: restaurant.last_review_count || 0,
          average_rating: restaurant.current_rating || 0
        }
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Statistiken Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Statistiken'
      });
    }
  }

  // Google Places ID setzen/aktualisieren
  async updateGooglePlaceId(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const { google_place_id, google_review_url } = req.body;

      if (!google_place_id) {
        return res.status(400).json({
          success: false,
          message: 'Google Place ID erforderlich'
        });
      }

      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant nicht gefunden'
        });
      }

      await restaurant.update({
        google_place_id,
        google_review_url: google_review_url || restaurant.google_review_url
      });

      res.json({
        success: true,
        message: 'Google Place ID erfolgreich aktualisiert',
        data: {
          google_place_id: restaurant.google_place_id,
          google_review_url: restaurant.google_review_url
        }
      });

    } catch (error) {
      console.error('Google Place ID Update Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren der Google Place ID'
      });
    }
  }
}

module.exports = new RestaurantController();