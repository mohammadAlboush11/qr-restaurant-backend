const axios = require('axios');
const { Op } = require('sequelize');
const { Restaurant, Table, ReviewNotification } = require('../models');
const emailService = require('./email.service');

class ReviewMonitorService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.scanTracking = new Map(); // Speichert QR-Scans
    this.checkInterval = 60 * 1000; // Jede Minute prüfen
    this.isRunning = false;
    this.lastReviewIds = new Map(); // Speichert letzte Review IDs pro Restaurant
  }

  // QR-Code wurde gescannt - NUR tracken, KEINE E-Mail!
  trackScan(restaurantId, tableId) {
    const now = Date.now();
    const key = `${restaurantId}_${tableId}_${now}`;
    
    this.scanTracking.set(key, {
      restaurantId,
      tableId,
      timestamp: now,
      checked: false
    });
    
    console.log(`📱 Scan getrackt für Restaurant ${restaurantId}, Tisch ${tableId}`);
    console.log(`   KEINE E-Mail gesendet - warte auf echte Bewertung`);
    
    // Nach 2, 5 und 10 Minuten prüfen ob neue Bewertung
    [2, 5, 10].forEach(minutes => {
      setTimeout(() => {
        this.checkForNewReview(restaurantId, tableId);
      }, minutes * 60 * 1000);
    });
    
    // Nach 30 Minuten aus Tracking entfernen
    setTimeout(() => {
      this.scanTracking.delete(key);
    }, 30 * 60 * 1000);
  }

  async checkForNewReview(restaurantId, tableId = null) {
    if (!this.apiKey) {
      console.log('⚠️ Google Places API Key nicht konfiguriert - kann keine Reviews prüfen');
      return false;
    }

    try {
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant || !restaurant.google_place_id) {
        console.log(`⚠️ Restaurant ${restaurantId} hat keine Google Place ID`);
        return false;
      }

      console.log(`🔍 Prüfe auf neue Bewertungen für ${restaurant.name}...`);

      // Google Places API abfragen
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: restaurant.google_place_id,
            fields: 'reviews,user_ratings_total,rating',
            key: this.apiKey,
            language: 'de'
          }
        }
      );

      if (response.data.status !== 'OK') {
        console.error('❌ Google API Error:', response.data.status);
        if (response.data.error_message) {
          console.error('   Details:', response.data.error_message);
        }
        return false;
      }

      const result = response.data.result;
      const currentCount = result.user_ratings_total || 0;
      const lastCount = restaurant.last_review_count || 0;
      const reviews = result.reviews || [];

      console.log(`   Aktuelle Bewertungen: ${currentCount}`);
      console.log(`   Letzte bekannte Anzahl: ${lastCount}`);

      // Prüfe ob neue Bewertung
      if (currentCount > lastCount || this.hasNewReview(restaurantId, reviews)) {
        console.log(`🌟 NEUE BEWERTUNG GEFUNDEN für ${restaurant.name}!`);
        
        // Neueste Review finden
        const latestReview = reviews[0]; // Google gibt sortiert zurück
        
        // Prüfe ob diese Review schon verarbeitet wurde
        const lastProcessedId = this.lastReviewIds.get(restaurantId);
        const currentReviewId = this.generateReviewId(latestReview);
        
        if (currentReviewId !== lastProcessedId) {
          // Tisch ermitteln (falls von QR-Scan)
          let table = null;
          if (tableId) {
            table = await Table.findByPk(tableId);
          }
          
          // JETZT E-Mail senden - NUR bei echter neuer Bewertung!
          console.log(`📧 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);
          
          const emailSent = await emailService.sendNewReviewNotification(
            restaurant,
            table,
            {
              author: latestReview?.author_name || 'Anonym',
              rating: latestReview?.rating,
              text: latestReview?.text,
              time: latestReview?.time ? new Date(latestReview.time * 1000) : new Date(),
              profilePhoto: latestReview?.profile_photo_url
            }
          );
          
          if (emailSent) {
            console.log(`✅ E-Mail erfolgreich gesendet!`);
            
            // Review in DB speichern
            await ReviewNotification.create({
              restaurant_id: restaurantId,
              table_id: tableId,
              review_author: latestReview?.author_name,
              review_text: latestReview?.text,
              review_rating: latestReview?.rating,
              review_time: latestReview?.time ? new Date(latestReview.time * 1000) : new Date(),
              notification_sent: true
            });
            
            // Letzte Review ID speichern
            this.lastReviewIds.set(restaurantId, currentReviewId);
          }
          
          // Review Count aktualisieren
          restaurant.last_review_count = currentCount;
          restaurant.last_review_check = new Date();
          await restaurant.save();
          
          return true;
        } else {
          console.log('   Diese Bewertung wurde bereits verarbeitet');
        }
      } else {
        console.log('   Keine neuen Bewertungen gefunden');
      }
      
      return false;
    } catch (error) {
      console.error('❌ Review Check Error:', error.message);
      if (error.response?.data) {
        console.error('   API Response:', error.response.data);
      }
      return false;
    }
  }

  // Prüfe ob es neue Reviews gibt die wir noch nicht kennen
  hasNewReview(restaurantId, reviews) {
    if (!reviews || reviews.length === 0) return false;
    
    const lastId = this.lastReviewIds.get(restaurantId);
    const currentId = this.generateReviewId(reviews[0]);
    
    return currentId !== lastId;
  }

  // Generiere eindeutige ID für Review
  generateReviewId(review) {
    if (!review) return null;
    // Kombination aus Author, Zeit und Rating für Eindeutigkeit
    return `${review.author_name}_${review.time}_${review.rating}`;
  }

  // Periodische Überprüfung aller Restaurants
  startMonitoring() {
    if (this.isRunning) return;
    
    if (!this.apiKey) {
      console.log('⚠️ Review Monitoring NICHT gestartet - Google API Key fehlt!');
      console.log('   Setzen Sie GOOGLE_PLACES_API_KEY in .env');
      return;
    }
    
    this.isRunning = true;
    console.log('✅ Review Monitoring gestartet');
    console.log(`   Prüfintervall: ${this.checkInterval / 1000} Sekunden`);
    console.log('   E-Mails werden NUR bei neuen Bewertungen gesendet');
    
    // Initial alle Restaurants laden um Baseline zu setzen
    this.initializeBaseline();
    
    // Periodische Prüfung
    this.intervalId = setInterval(async () => {
      try {
        const restaurants = await Restaurant.findAll({
          where: { 
            is_active: true,
            google_place_id: { [Op.ne]: null }
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

  // Initiale Baseline setzen
  async initializeBaseline() {
    try {
      const restaurants = await Restaurant.findAll({
        where: { 
          is_active: true,
          google_place_id: { [Op.ne]: null }
        }
      });

      console.log(`📊 Initialisiere Baseline für ${restaurants.length} Restaurants...`);

      for (const restaurant of restaurants) {
        try {
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

          if (response.data.status === 'OK') {
            const result = response.data.result;
            const currentCount = result.user_ratings_total || 0;
            
            // Speichere aktuelle Anzahl
            restaurant.last_review_count = currentCount;
            restaurant.last_review_check = new Date();
            await restaurant.save();
            
            // Speichere letzte Review ID
            if (result.reviews && result.reviews.length > 0) {
              const reviewId = this.generateReviewId(result.reviews[0]);
              this.lastReviewIds.set(restaurant.id, reviewId);
            }
            
            console.log(`   ✅ ${restaurant.name}: ${currentCount} Bewertungen`);
          }
        } catch (error) {
          console.error(`   ❌ Fehler bei ${restaurant.name}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Baseline Initialization Error:', error);
    }
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.isRunning = false;
      console.log('⏹️ Review Monitoring gestoppt');
    }
  }
}

module.exports = new ReviewMonitorService();