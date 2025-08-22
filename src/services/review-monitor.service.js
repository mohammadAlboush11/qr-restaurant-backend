const axios = require('axios');
const { Restaurant, Table, ReviewNotification } = require('../models');
const emailService = require('./email.service');

class ReviewMonitorService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.scanTracking = new Map(); // Speichert QR-Scans
    this.checkInterval = 2 * 60 * 1000; // 2 Minuten
    this.isRunning = false;
  }

  // QR-Code wurde gescannt - nur tracken, KEINE E-Mail
  trackScan(restaurantId, tableId) {
    const now = Date.now();
    const key = `${restaurantId}_${now}`;
    
    this.scanTracking.set(key, {
      restaurantId,
      tableId,
      timestamp: now,
      checked: false
    });
    
    console.log(`📱 QR-Scan getrackt für Restaurant ${restaurantId}, Tisch ${tableId}`);
    
    // Nach 3, 5 und 10 Minuten prüfen
    [3, 5, 10].forEach(minutes => {
      setTimeout(() => {
        this.checkForNewReview(restaurantId, tableId);
      }, minutes * 60 * 1000);
    });
    
    // Alte Einträge nach 30 Minuten löschen
    setTimeout(() => {
      this.scanTracking.delete(key);
    }, 30 * 60 * 1000);
  }

  async checkForNewReview(restaurantId, tableId = null) {
    if (!this.apiKey) {
      console.log('⚠️ Google Places API Key nicht konfiguriert');
      return false;
    }

    try {
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant || !restaurant.google_place_id) {
        console.log(`⚠️ Restaurant ${restaurantId} hat keine Google Place ID`);
        return false;
      }

      // Google Places API abfragen
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: restaurant.google_place_id,
            fields: 'reviews,user_ratings_total',
            key: this.apiKey,
            language: 'de'
          }
        }
      );

      if (response.data.status !== 'OK') {
        console.error('Google API Error:', response.data.status);
        return false;
      }

      const currentCount = response.data.result.user_ratings_total || 0;
      const lastCount = restaurant.last_review_count || 0;

      // Neue Bewertung gefunden!
      if (currentCount > lastCount) {
        console.log(`🌟 NEUE BEWERTUNG gefunden für ${restaurant.name}!`);
        
        // Neueste Review holen
        const reviews = response.data.result.reviews || [];
        const latestReview = reviews[0];
        
        // Tisch ermitteln (falls von QR-Scan)
        let table = null;
        if (tableId) {
          table = await Table.findByPk(tableId);
        }
        
        // E-Mail senden
        const emailSent = await emailService.sendNewReviewNotification(
          restaurant,
          table,
          {
            author: latestReview?.author_name || 'Anonym',
            rating: latestReview?.rating,
            text: latestReview?.text,
            time: latestReview?.time ? new Date(latestReview.time * 1000) : new Date()
          }
        );
        
        // Review in DB speichern
        await ReviewNotification.create({
          restaurant_id: restaurantId,
          table_id: tableId,
          review_author: latestReview?.author_name,
          review_text: latestReview?.text,
          review_rating: latestReview?.rating,
          review_time: latestReview?.time ? new Date(latestReview.time * 1000) : new Date(),
          notification_sent: emailSent
        });
        
        // Review Count aktualisieren
        restaurant.last_review_count = currentCount;
        restaurant.last_review_check = new Date();
        await restaurant.save();
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Review Check Error:', error);
      return false;
    }
  }

  // Periodische Überprüfung aller Restaurants
  startMonitoring() {
    if (this.isRunning) return;
    
    if (!this.apiKey) {
      console.log('⚠️ Review Monitoring deaktiviert (kein Google API Key)');
      return;
    }
    
    this.isRunning = true;
    console.log('✅ Review Monitoring gestartet');
    
    setInterval(async () => {
      try {
        const restaurants = await Restaurant.findAll({
          where: { 
            is_active: true,
            google_place_id: { [require('sequelize').Op.ne]: null }
          }
        });
        
        for (const restaurant of restaurants) {
          await this.checkForNewReview(restaurant.id);
        }
      } catch (error) {
        console.error('Monitoring Error:', error);
      }
    }, this.checkInterval);
  }
}

module.exports = new ReviewMonitorService();