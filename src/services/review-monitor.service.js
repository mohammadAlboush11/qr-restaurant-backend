/**
 * Review Monitor Service - KORRIGIERT
 * Speichern als: backend/src/services/review-monitor.service.js
 */

const axios = require('axios');
const { Op } = require('sequelize');

class ReviewMonitorService {
  constructor() {
    this.monitoringInterval = null;
    this.checkInterval = 30000; // 30 Sekunden
    this.isMonitoring = false;
    this.lastCheckTime = new Date();
    this.checkCount = 0;
    this.emailService = null; // Wird später geladen
  }

  // Email Service lazy loading
  getEmailService() {
    if (!this.emailService) {
      try {
        this.emailService = require('./email.service');
      } catch (error) {
        console.error('❌ Email Service konnte nicht geladen werden:', error.message);
      }
    }
    return this.emailService;
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
    
    // Erste Prüfung nach 5 Sekunden
    setTimeout(() => this.checkAllRestaurants(), 5000);
    
    // Dann regelmäßig
    this.monitoringInterval = setInterval(() => {
      this.checkAllRestaurants();
    }, this.checkInterval);
  }

  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.isMonitoring = false;
      console.log('ℹ️ Review Monitoring gestoppt');
    }
  }

  async checkAllRestaurants() {
    try {
      this.checkCount++;
      console.log(`\n🔍 Review Check #${this.checkCount} - ${new Date().toLocaleTimeString('de-DE')}`);
      
      // Models hier laden um zirkuläre Abhängigkeiten zu vermeiden
      const { Restaurant, ReviewNotification } = require('../models');
      
      const restaurants = await Restaurant.findAll({
        where: { 
          is_active: true,
          google_place_id: { 
            [Op.ne]: null 
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      this.lastCheckTime = new Date();
      
    } catch (error) {
      console.error('❌ Fehler beim Review-Check:', error.message);
    }
  }

  async checkRestaurantReviews(restaurant) {
    try {
      console.log(`   🔍 Prüfe: ${restaurant.name}...`);
      
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: restaurant.google_place_id,
            fields: 'reviews,rating,user_ratings_total',
            key: process.env.GOOGLE_PLACES_API_KEY,
            language: 'de'
          },
          timeout: 10000
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

      if (currentReviewCount > lastKnownCount) {
        const newReviewsCount = currentReviewCount - lastKnownCount;
        console.log(`      🌟 ${newReviewsCount} NEUE BEWERTUNG(EN) GEFUNDEN!`);
        
        const latestReviews = placeDetails.reviews || [];
        
        for (let i = 0; i < Math.min(newReviewsCount, latestReviews.length); i++) {
          const review = latestReviews[i];
          await this.processNewReview(restaurant, review);
        }

        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date(),
          current_rating: placeDetails.rating
        });
        
      } else {
        console.log(`      ✓ Keine neuen Reviews`);
        await restaurant.update({
          last_review_check: new Date()
        });
      }
      
    } catch (error) {
      console.error(`   ❌ Fehler bei ${restaurant.name}:`, error.message);
    }
  }

  async processNewReview(restaurant, reviewData) {
    try {
      console.log(`      📧 Verarbeite Review von: ${reviewData.author_name}`);
      
      const { ReviewNotification } = require('../models');
      
      const notification = await ReviewNotification.create({
        restaurant_id: restaurant.id,
        review_author: reviewData.author_name,
        review_rating: reviewData.rating,
        review_text: reviewData.text,
        review_time: new Date(reviewData.time * 1000),
        notification_sent: false
      });

      // Email Service laden und senden
      const emailService = this.getEmailService();
      if (emailService) {
        const emailSent = await emailService.sendNewReviewNotification(
          restaurant,
          null,
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
        }
      }
      
    } catch (error) {
      console.error('      ❌ Fehler beim Verarbeiten der Review:', error.message);
    }
  }

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