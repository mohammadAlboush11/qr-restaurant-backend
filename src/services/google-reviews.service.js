const axios = require('axios');
const { Op } = require('sequelize');
const { Restaurant, ReviewNotification, Table } = require('../models');
const emailService = require('./email.service');

class GoogleReviewsService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    this.checkInterval = 10 * 60 * 1000; // 10 Minuten für schnellere Erkennung
    this.recentScans = new Map(); // Speichert recent QR-Scans
  }

  // QR-Code wurde gescannt - speichern für spätere Zuordnung
  async trackQRScan(tableId) {
    try {
      const table = await Table.findByPk(tableId, {
        include: [Restaurant]
      });

      if (!table) return false;

      // Scan Count erhöhen
      table.scan_count = (table.scan_count || 0) + 1;
      await table.save();

      // Scan für spätere Zuordnung speichern (30 Minuten gültig)
      const scanKey = `${table.restaurant_id}_${Date.now()}`;
      this.recentScans.set(scanKey, {
        tableId: table.id,
        tableNumber: table.table_number,
        restaurantId: table.restaurant_id,
        timestamp: Date.now()
      });

      // Alte Scans aufräumen (älter als 30 Minuten)
      this.cleanupOldScans();

      // Nach 2 Minuten erste Prüfung, dann nach 5 und 10 Minuten
      [2, 5, 10].forEach(minutes => {
        setTimeout(() => {
          this.checkForNewReviews(table.restaurant_id, table.id);
        }, minutes * 60 * 1000);
      });

      console.log(`QR-Scan tracked: Table ${table.table_number}, Restaurant ${table.restaurant_id}`);
      return true;
    } catch (error) {
      console.error('Track QR Scan Error:', error);
      return false;
    }
  }

  // Alte Scans aufräumen
  cleanupOldScans() {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    for (const [key, scan] of this.recentScans.entries()) {
      if (scan.timestamp < thirtyMinutesAgo) {
        this.recentScans.delete(key);
      }
    }
  }

  // Finde wahrscheinlichen Tisch für neue Review
  findProbableTable(restaurantId) {
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
    let mostRecentScan = null;

    for (const scan of this.recentScans.values()) {
      if (scan.restaurantId === restaurantId && scan.timestamp > fifteenMinutesAgo) {
        if (!mostRecentScan || scan.timestamp > mostRecentScan.timestamp) {
          mostRecentScan = scan;
        }
      }
    }

    return mostRecentScan;
  }

  async checkForNewReviews(restaurantId, triggeredByTableId = null) {
    try {
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant || !restaurant.is_active) {
        console.log(`Restaurant ${restaurantId} nicht aktiv oder nicht gefunden`);
        return;
      }

      // Wenn kein Google Place ID, versuche trotzdem E-Mail zu senden wenn von QR-Scan getriggert
      if (triggeredByTableId && !restaurant.google_place_id) {
        const table = await Table.findByPk(triggeredByTableId);
        if (table) {
          console.log(`Sende präventive E-Mail für Table ${table.table_number}`);
          await emailService.sendReviewNotification(
            restaurant,
            table,
            {
              author: 'Gast',
              rating: null,
              text: 'Ein Gast hat Ihren QR-Code gescannt und wurde zu Google Reviews weitergeleitet.'
            }
          );
        }
        return;
      }

      // Wenn Google Places API konfiguriert ist
      if (restaurant.google_place_id && this.apiKey) {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/place/details/json`,
          {
            params: {
              place_id: restaurant.google_place_id,
              fields: 'reviews,user_ratings_total,rating',
              key: this.apiKey,
              language: 'de'
            }
          }
        );

        if (response.data.result) {
          const currentReviewCount = response.data.result.user_ratings_total || 0;
          
          // Prüfen ob neue Bewertungen vorhanden sind
          if (currentReviewCount > (restaurant.last_review_count || 0)) {
            const newReviews = response.data.result.reviews || [];
            
            // Versuche Tisch zuzuordnen
            const probableTable = this.findProbableTable(restaurantId);
            let table = null;
            
            if (probableTable) {
              table = await Table.findByPk(probableTable.tableId);
            }

            // Neueste Bewertung verarbeiten
            if (newReviews.length > 0) {
              const latestReview = newReviews[0];
              
              // Benachrichtigung in DB speichern
              const notification = await ReviewNotification.create({
                restaurant_id: restaurantId,
                table_id: table ? table.id : null,
                review_author: latestReview.author_name,
                review_text: latestReview.text,
                review_rating: latestReview.rating,
                review_time: new Date(latestReview.time * 1000),
                notification_sent: false
              });

              // E-Mail senden
              const emailSent = await emailService.sendReviewNotification(
                restaurant,
                table || { table_number: 'Unbekannt' },
                {
                  author: latestReview.author_name,
                  rating: latestReview.rating,
                  text: latestReview.text
                }
              );

              if (emailSent) {
                notification.notification_sent = true;
                await notification.save();
                console.log(`E-Mail gesendet für neue Review an ${restaurant.email}`);
              }
            }

            // Review Count aktualisieren
            restaurant.last_review_count = currentReviewCount;
            restaurant.last_review_check = new Date();
            await restaurant.save();
          }
        }
      }
    } catch (error) {
      console.error('Google Reviews Check Error:', error);
    }
  }

  // Regelmäßige Überprüfung für alle Restaurants
  startPeriodicCheck() {
    console.log('Starte periodische Review-Überprüfung...');
    
    setInterval(async () => {
      try {
        const restaurants = await Restaurant.findAll({
          where: {
            is_active: true,
            google_place_id: { [Op.ne]: null }
          }
        });

        console.log(`Prüfe ${restaurants.length} aktive Restaurants auf neue Reviews...`);

        for (const restaurant of restaurants) {
          await this.checkForNewReviews(restaurant.id);
        }
      } catch (error) {
        console.error('Periodic Check Error:', error);
      }
    }, this.checkInterval);
  }
}

module.exports = new GoogleReviewsService();