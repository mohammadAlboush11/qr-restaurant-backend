/**
 * Review Monitor Service - Korrigierte Version
 */
const axios = require('axios');
const { Op } = require('sequelize');

// Models werden lazy geladen
let models = null;
let logger = null;

class ReviewMonitorService {
  constructor() {
    this.monitoringInterval = null;
    this.checkInterval = 5 * 60 * 1000; // 5 Minuten
    this.isMonitoring = false;
    this.lastCheckTime = new Date();
    this.checkCount = 0;
  }

  getLogger() {
    if (!logger) {
      try {
        logger = require('../utils/logger');
      } catch (e) {
        // Fallback logger
        logger = {
          info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
          warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
          error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
          debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || '')
        };
      }
    }
    return logger;
  }

  getModels() {
    if (!models) {
      models = require('../models');
    }
    return models;
  }

  start() {
    const log = this.getLogger();
    
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      log.warn('Review Monitoring deaktiviert - Google API Key fehlt');
      return;
    }

    if (this.isMonitoring) {
      log.info('Review Monitoring läuft bereits');
      return;
    }

    log.info('Starte Review Monitoring Service', {
      checkInterval: this.checkInterval / 1000 / 60 + ' Minuten'
    });
    
    this.isMonitoring = true;
    
    // Erste Prüfung nach 30 Sekunden
    setTimeout(() => this.checkAllRestaurants(), 30000);
    
    // Dann regelmäßig
    this.monitoringInterval = setInterval(() => {
      this.checkAllRestaurants();
    }, this.checkInterval);
  }

  stop() {
    const log = this.getLogger();
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.isMonitoring = false;
      log.info('Review Monitoring gestoppt');
    }
  }

  async checkAllRestaurants() {
    const log = this.getLogger();
    
    try {
      const { Restaurant } = this.getModels();
      this.checkCount++;
      
      log.debug(`Review Check #${this.checkCount}`, {
        time: new Date().toLocaleTimeString('de-DE')
      });
      
      const restaurants = await Restaurant.findAll({
        where: { 
          is_active: true,
          google_place_id: { [Op.ne]: null }
        }
      });

      if (restaurants.length === 0) {
        log.debug('Keine aktiven Restaurants mit Google Place ID');
        return;
      }

      for (const restaurant of restaurants) {
        await this.checkRestaurantReviews(restaurant);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      this.lastCheckTime = new Date();
      
    } catch (error) {
      log.error('Review Check Error:', error);
    }
  }

  async checkRestaurantReviews(restaurant) {
    const log = this.getLogger();
    
    try {
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
        log.warn(`Google API Error for ${restaurant.name}:`, response.data.status);
        return;
      }

      const placeDetails = response.data.result;
      const currentReviewCount = placeDetails.user_ratings_total || 0;
      const lastKnownCount = restaurant.last_review_count || 0;

      if (currentReviewCount > lastKnownCount) {
        const newReviewsCount = currentReviewCount - lastKnownCount;
        log.info(`Neue Reviews gefunden für ${restaurant.name}:`, newReviewsCount);
        
        await this.processNewReviews(restaurant, placeDetails);
        
        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date(),
          current_rating: placeDetails.rating
        });
      } else {
        await restaurant.update({ last_review_check: new Date() });
      }
      
    } catch (error) {
      log.error(`Review Check Error für ${restaurant.name}:`, error.message);
    }
  }

  async processNewReviews(restaurant, placeDetails) {
    const log = this.getLogger();
    const { ReviewNotification } = this.getModels();
    
    try {
      const emailService = require('./email.service');
      const latestReviews = placeDetails.reviews || [];
      
      for (const review of latestReviews.slice(0, 1)) {
        try {
          const notification = await ReviewNotification.create({
            restaurant_id: restaurant.id,
            review_author: review.author_name,
            review_rating: review.rating,
            review_text: review.text,
            review_time: new Date(review.time * 1000),
            notification_sent: false
          });

          if (emailService.isConfigured) {
            // Sende E-Mail über den Standard-Service
            const emailSent = await emailService.sendScanNotification({
              restaurant_name: restaurant.name,
              restaurant_email: restaurant.notification_email || restaurant.email,
              table_number: 'Neue Bewertung',
              table_description: `${review.rating} Sterne von ${review.author_name}`,
              scan_time: new Date().toLocaleString('de-DE'),
              ip_address: 'Google Reviews',
              user_agent: 'Review Monitor',
              google_review_url: restaurant.google_review_url
            });

            if (emailSent) {
              await notification.update({ notification_sent: true });
              log.info('Review notification sent', { restaurantId: restaurant.id });
            }
          }
        } catch (error) {
          log.error('Error processing review:', error);
        }
      }
    } catch (error) {
      log.error('Process new reviews error:', error);
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