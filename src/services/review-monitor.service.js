/**
 * Review Monitor Service - NUR für echte Google Reviews
 * Speichern als: backend/src/services/review-monitor.service.js
 */

const axios = require('axios');
const { Restaurant, Table, ReviewNotification, Scan } = require('../models');
const emailService = require('./email.service');
const { Op } = require('sequelize');

class ReviewMonitorService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.checkInterval = 2 * 60 * 1000; // 2 Minuten
    this.isRunning = false;
    this.lastKnownReviews = new Map(); // Speichert letzte bekannte Review-Anzahl pro Restaurant
  }

  /**
   * Startet das Monitoring für alle Restaurants
   */
  startMonitoring() {
    if (this.isRunning) {
      console.log('⚠️ Review Monitoring läuft bereits');
      return;
    }

    if (!this.apiKey) {
      console.log('❌ FEHLER: Google API Key fehlt! Keine echten Reviews erkennbar.');
      console.log('   Bitte GOOGLE_PLACES_API_KEY in .env setzen');
      return;
    }

    this.isRunning = true;
    console.log('✅ Review Monitoring gestartet');
    console.log(`   Prüfintervall: ${this.checkInterval / 60000} Minuten`);
    console.log('   E-Mails NUR bei echten Google Reviews');

    // Initial Check nach 10 Sekunden
    setTimeout(() => {
      this.checkAllRestaurants();
    }, 10000);

    // Dann regelmäßig prüfen
    this.monitoringInterval = setInterval(() => {
      this.checkAllRestaurants();
    }, this.checkInterval);
  }

  /**
   * Stoppt das Monitoring
   */
  stopMonitoring() {
    if (!this.isRunning) return;
    
    clearInterval(this.monitoringInterval);
    this.isRunning = false;
    console.log('⏹️ Review Monitoring gestoppt');
  }

  /**
   * Prüft alle aktiven Restaurants auf neue Reviews
   */
  async checkAllRestaurants() {
    try {
      const restaurants = await Restaurant.findAll({
        where: {
          is_active: true,
          google_place_id: { [Op.ne]: null }
        }
      });

      console.log(`🔍 Prüfe ${restaurants.length} Restaurants auf neue Reviews...`);

      for (const restaurant of restaurants) {
        await this.checkRestaurantReviews(restaurant);
      }
    } catch (error) {
      console.error('❌ Fehler beim Review Check:', error);
    }
  }

  /**
   * Prüft ein einzelnes Restaurant auf neue Reviews
   */
  async checkRestaurantReviews(restaurant) {
    if (!restaurant.google_place_id) {
      return;
    }

    try {
      // Google Places API aufrufen
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: restaurant.google_place_id,
            fields: 'reviews,rating,user_ratings_total',
            key: this.apiKey,
            language: 'de'
          }
        }
      );

      if (response.data.status !== 'OK') {
        if (response.data.status === 'REQUEST_DENIED') {
          console.error('❌ Google API Key ungültig oder keine Berechtigung');
        }
        return;
      }

      const result = response.data.result;
      const currentReviewCount = result.user_ratings_total || 0;
      const lastKnownCount = this.lastKnownReviews.get(restaurant.id) || 
                             restaurant.last_review_count || 0;

      // Beim ersten Check: Nur Anzahl speichern, keine E-Mail
      if (!this.lastKnownReviews.has(restaurant.id)) {
        this.lastKnownReviews.set(restaurant.id, currentReviewCount);
        
        // In DB speichern
        restaurant.last_review_count = currentReviewCount;
        restaurant.last_review_check = new Date();
        await restaurant.save();
        
        console.log(`📊 ${restaurant.name}: ${currentReviewCount} Reviews (Initial)`);
        return;
      }

      // Prüfen ob neue Review vorhanden
      if (currentReviewCount > lastKnownCount) {
        console.log(`🌟 NEUE REVIEW für ${restaurant.name}!`);
        console.log(`   Vorher: ${lastKnownCount}, Jetzt: ${currentReviewCount}`);

        // Neueste Review aus den Details holen
        const latestReview = result.reviews ? result.reviews[0] : null;

        // Versuche den zugehörigen Tisch zu ermitteln
        // (basierend auf kürzlichen Scans in den letzten 30 Minuten)
        const recentScan = await Scan.findOne({
          where: {
            restaurant_id: restaurant.id,
            created_at: {
              [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) // Letzte 30 Min
            }
          },
          include: [{
            model: Table,
            as: 'table'
          }],
          order: [['created_at', 'DESC']]
        });

        // E-Mail-Daten vorbereiten
        const reviewData = {
          author: latestReview?.author_name || 'Anonym',
          rating: latestReview?.rating || result.rating,
          text: latestReview?.text || '',
          time: latestReview?.time ? new Date(latestReview.time * 1000) : new Date(),
          totalReviews: currentReviewCount,
          averageRating: result.rating
        };

        // E-Mail senden
        const emailSent = await this.sendReviewNotification(
          restaurant,
          recentScan?.table || null,
          reviewData
        );

        // In Datenbank speichern
        await ReviewNotification.create({
          restaurant_id: restaurant.id,
          table_id: recentScan?.table_id || null,
          review_author: reviewData.author,
          review_text: reviewData.text,
          review_rating: reviewData.rating,
          review_time: reviewData.time,
          notification_sent: emailSent
        });

        // Counts aktualisieren
        this.lastKnownReviews.set(restaurant.id, currentReviewCount);
        restaurant.last_review_count = currentReviewCount;
        restaurant.last_review_check = new Date();
        await restaurant.save();

      } else {
        // Keine neue Review
        restaurant.last_review_check = new Date();
        await restaurant.save();
      }

    } catch (error) {
      console.error(`❌ Fehler beim Prüfen von ${restaurant.name}:`, error.message);
    }
  }

  /**
   * Sendet E-Mail-Benachrichtigung für neue Review
   */
  async sendReviewNotification(restaurant, table, reviewData) {
    try {
      const emailData = {
        to: restaurant.email,
        subject: `🌟 Neue Google Bewertung - ${reviewData.rating} Sterne`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 30px; border: 1px solid #dee2e6; border-radius: 0 0 10px 10px; }
              .review-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .rating { font-size: 24px; color: #fbbf24; margin: 10px 0; }
              .author { font-weight: bold; color: #667eea; font-size: 18px; }
              .review-text { margin-top: 10px; font-style: italic; color: #4b5563; }
              .stats { display: flex; justify-content: space-around; margin-top: 20px; }
              .stat-box { text-align: center; padding: 15px; background: white; border-radius: 8px; flex: 1; margin: 0 10px; }
              .stat-value { font-size: 24px; font-weight: bold; color: #667eea; }
              .stat-label { font-size: 12px; color: #6b7280; margin-top: 5px; }
              .table-info { background: #e0e7ff; padding: 10px 15px; border-radius: 5px; margin-bottom: 20px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; color: #6c757d; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🌟 Neue Google Bewertung erhalten!</h1>
                <p style="margin: 0; opacity: 0.9;">für ${restaurant.name}</p>
              </div>
              
              <div class="content">
                ${table ? `
                <div class="table-info">
                  <strong>📍 Wahrscheinlich von Tisch ${table.table_number}</strong>
                  <br><small>(Basierend auf QR-Code Scan vor der Bewertung)</small>
                </div>
                ` : ''}
                
                <div class="review-box">
                  <div class="author">${reviewData.author}</div>
                  <div class="rating">${'⭐'.repeat(reviewData.rating)}</div>
                  ${reviewData.text ? `
                    <div class="review-text">"${reviewData.text}"</div>
                  ` : '<div class="review-text">Keine Textbewertung hinterlassen</div>'}
                  <div style="margin-top: 15px; color: #9ca3af; font-size: 14px;">
                    ${new Date(reviewData.time).toLocaleString('de-DE')}
                  </div>
                </div>
                
                <div class="stats">
                  <div class="stat-box">
                    <div class="stat-value">${reviewData.totalReviews}</div>
                    <div class="stat-label">Bewertungen gesamt</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-value">${reviewData.averageRating.toFixed(1)}</div>
                    <div class="stat-label">⭐ Durchschnitt</div>
                  </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${restaurant.google_business_url || 'https://business.google.com'}" 
                     style="display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px;">
                    Alle Bewertungen ansehen →
                  </a>
                </div>
                
                <div class="footer">
                  <p>Diese Benachrichtigung wurde automatisch generiert.</p>
                  <p>QR Restaurant Review System</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      return await emailService.sendEmail(emailData);
    } catch (error) {
      console.error('❌ Fehler beim Senden der Review-Email:', error);
      return false;
    }
  }

  /**
   * Manueller Check für ein Restaurant (Admin-Funktion)
   */
  async manualCheck(restaurantId) {
    try {
      const restaurant = await Restaurant.findByPk(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant nicht gefunden');
      }

      console.log(`🔍 Manueller Check für ${restaurant.name}...`);
      await this.checkRestaurantReviews(restaurant);
      
      return {
        success: true,
        message: `Check für ${restaurant.name} durchgeführt`
      };
    } catch (error) {
      console.error('❌ Manueller Check fehlgeschlagen:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ReviewMonitorService();