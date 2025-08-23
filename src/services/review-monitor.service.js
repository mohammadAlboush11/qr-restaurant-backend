/**
 * Review Monitor Service - OPTIMIERTE VERSION
 * Speichern als: backend/src/services/review-monitor.service.js
 */

const axios = require('axios');
const { Restaurant, ReviewNotification } = require('../models');
const emailService = require('./email.service');

class ReviewMonitorService {
  constructor() {
    this.monitoringInterval = null;
    this.checkInterval = 30000; // 30 Sekunden statt 60
    this.isMonitoring = false;
    this.lastCheckTime = new Date();
    this.checkCount = 0;
  }

  async startMonitoring() {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      console.log('⚠️ Review Monitoring deaktiviert - Google API Key fehlt');
      return;
    }

    if (this.isMonitoring) {
      console.log('ℹ️ Review Monitoring läuft bereits');
      return;
    }

    console.log('🚀 Starte Review Monitoring Service...');
    console.log(`   ⏱️ Check-Intervall: ${this.checkInterval / 1000} Sekunden`);
    
    this.isMonitoring = true;
    
    // Erste Prüfung sofort nach 5 Sekunden
    setTimeout(() => this.checkAllRestaurants(), 5000);
    
    // Dann regelmäßig alle 30 Sekunden
    this.monitoringInterval = setInterval(() => {
      this.checkAllRestaurants();
    }, this.checkInterval);
  }

  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.isMonitoring = false;
      console.log('⏹️ Review Monitoring gestoppt');
    }
  }

  async checkAllRestaurants() {
    try {
      this.checkCount++;
      console.log(`\n🔍 Review Check #${this.checkCount} - ${new Date().toLocaleTimeString('de-DE')}`);
      
      const restaurants = await Restaurant.findAll({
        where: { 
          is_active: true,
          google_place_id: { 
            [require('sequelize').Op.ne]: null 
          }
        }
      });

      if (restaurants.length === 0) {
        console.log('   Keine aktiven Restaurants mit Google Place ID gefunden');
        return;
      }

      console.log(`   Prüfe ${restaurants.length} Restaurant(s) auf neue Reviews...`);
      
      for (const restaurant of restaurants) {
        await this.checkRestaurantReviews(restaurant);
        // Kleine Pause zwischen Restaurants (1 Sekunde)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      this.lastCheckTime = new Date();
      
    } catch (error) {
      console.error('❌ Fehler beim Review-Check:', error.message);
    }
  }

  async checkRestaurantReviews(restaurant) {
    try {
      console.log(`   📍 Prüfe: ${restaurant.name}...`);
      
      // Google Places API Details abrufen
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: restaurant.google_place_id,
            fields: 'reviews,rating,user_ratings_total',
            key: process.env.GOOGLE_PLACES_API_KEY,
            language: 'de'
          },
          timeout: 10000 // 10 Sekunden Timeout
        }
      );

      if (response.data.status !== 'OK') {
        console.log(`      ⚠️ Google API Status: ${response.data.status}`);
        return;
      }

      const placeDetails = response.data.result;
      const currentReviewCount = placeDetails.user_ratings_total || 0;
      const lastKnownCount = restaurant.last_review_count || 0;

      console.log(`      Aktuelle Reviews: ${currentReviewCount} | Letzte: ${lastKnownCount}`);

      // Prüfe auf neue Reviews
      if (currentReviewCount > lastKnownCount) {
        const newReviewsCount = currentReviewCount - lastKnownCount;
        console.log(`      🌟 ${newReviewsCount} NEUE BEWERTUNG(EN) GEFUNDEN!`);
        
        // Hole die neuesten Reviews
        const latestReviews = placeDetails.reviews || [];
        
        // Verarbeite neue Reviews (normalerweise nur die neueste)
        for (let i = 0; i < Math.min(newReviewsCount, latestReviews.length); i++) {
          const review = latestReviews[i];
          
          // Prüfe ob diese Review schon verarbeitet wurde
          const existingNotification = await ReviewNotification.findOne({
            where: {
              restaurant_id: restaurant.id,
              review_author: review.author_name,
              review_time: new Date(review.time * 1000)
            }
          });

          if (!existingNotification) {
            await this.processNewReview(restaurant, review);
          }
        }

        // Update Restaurant Review Count
        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date(),
          current_rating: placeDetails.rating
        });
        
      } else if (currentReviewCount < lastKnownCount) {
        // Reviews wurden gelöscht
        console.log(`      ⚠️ Reviews wurden gelöscht (${lastKnownCount} → ${currentReviewCount})`);
        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date()
        });
      } else {
        console.log(`      ✓ Keine neuen Reviews`);
        await restaurant.update({
          last_review_check: new Date()
        });
      }
      
    } catch (error) {
      console.error(`   ❌ Fehler bei ${restaurant.name}:`, error.message);
      
      if (error.response?.status === 429) {
        console.log('   ⚠️ API Rate Limit erreicht - pausiere für 60 Sekunden');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }

  async processNewReview(restaurant, reviewData) {
    try {
      console.log(`      📧 Verarbeite Review von: ${reviewData.author_name}`);
      
      // Erstelle Review-Benachrichtigung in DB
      const notification = await ReviewNotification.create({
        restaurant_id: restaurant.id,
        review_author: reviewData.author_name,
        review_rating: reviewData.rating,
        review_text: reviewData.text,
        review_time: new Date(reviewData.time * 1000),
        notification_sent: false
      });

      // Sende E-Mail-Benachrichtigung
      const emailSent = await emailService.sendNewReviewNotification(
        restaurant,
        null, // Kein spezifischer Tisch
        {
          author: reviewData.author_name,
          rating: reviewData.rating,
          text: reviewData.text,
          time: new Date(reviewData.time * 1000)
        }
      );

      if (emailSent) {
        await notification.update({
          notification_sent: true,
          notification_sent_at: new Date()
        });
        console.log(`      ✅ E-Mail-Benachrichtigung gesendet!`);
      } else {
        console.log(`      ⚠️ E-Mail konnte nicht gesendet werden`);
      }
      
    } catch (error) {
      console.error('      ❌ Fehler beim Verarbeiten der Review:', error.message);
    }
  }

  // Methode für manuellen Review-Check (z.B. nach QR-Scan)
  async checkForNewReviewAfterScan(restaurant, delayMinutes = 2) {
    if (!restaurant.google_place_id) {
      return;
    }

    console.log(`⏰ Plane Review-Check für ${restaurant.name} in ${delayMinutes} Minuten`);
    
    // Mehrere Checks mit unterschiedlichen Verzögerungen
    const checkDelays = [
      delayMinutes * 60 * 1000,           // z.B. 2 Minuten
      (delayMinutes + 1) * 60 * 1000,     // 3 Minuten
      (delayMinutes + 3) * 60 * 1000      // 5 Minuten
    ];

    checkDelays.forEach((delay, index) => {
      setTimeout(async () => {
        console.log(`   🔍 Review-Check ${index + 1}/3 für ${restaurant.name}`);
        await this.checkRestaurantReviews(restaurant);
      }, delay);
    });
  }

  // Status-Methode für Monitoring
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkInterval: this.checkInterval,
      lastCheckTime: this.lastCheckTime,
      checkCount: this.checkCount,
      apiKeyConfigured: !!process.env.GOOGLE_PLACES_API_KEY
    };
  }
}

module.exports = new ReviewMonitorService();