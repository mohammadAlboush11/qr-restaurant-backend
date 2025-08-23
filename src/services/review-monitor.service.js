const axios = require('axios');
const { Op } = require('sequelize');
const { Restaurant, Table, ReviewNotification } = require('../models');
const emailService = require('./email.service');

class ReviewMonitorService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.scanTracking = new Map(); 
    this.checkInterval = 60 * 1000; 
    this.isRunning = false;
    this.lastReviewIds = new Map(); 
    this.lastReviewCounts = new Map(); // WICHTIG: Speichert initiale Counts
  }

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
    
    // Nach 2, 5 und 10 Minuten prüfen
    [2, 5, 10].forEach(minutes => {
      setTimeout(() => {
        this.checkForNewReview(restaurantId, tableId);
      }, minutes * 60 * 1000);
    });
    
    // Nach 30 Minuten entfernen
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

      console.log(`🔍 Prüfe auf neue Bewertungen für ${restaurant.name}...`);

      // Google Places API
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
        return false;
      }

      const result = response.data.result;
      const currentCount = result.user_ratings_total || 0;
      const reviews = result.reviews || [];

      // WICHTIG: Hole gespeicherten Count aus Memory, nicht aus DB!
      const lastKnownCount = this.lastReviewCounts.get(restaurantId) || restaurant.last_review_count || 0;

      console.log(`   Aktuelle Bewertungen: ${currentCount}`);
      console.log(`   Letzte bekannte Anzahl: ${lastKnownCount}`);

      // Prüfe ob WIRKLICH neue Bewertung
      if (currentCount > lastKnownCount) {
        console.log(`🌟 NEUE BEWERTUNG GEFUNDEN für ${restaurant.name}!`);
        console.log(`   Anzahl erhöht von ${lastKnownCount} auf ${currentCount}`);
        
        // Neueste Review
        const latestReview = reviews[0];
        
        // Prüfe ob Review schon verarbeitet
        const lastProcessedId = this.lastReviewIds.get(restaurantId);
        const currentReviewId = this.generateReviewId(latestReview);
        
        if (currentReviewId !== lastProcessedId) {
          // Tisch ermitteln
          let table = null;
          if (tableId) {
            table = await Table.findByPk(tableId);
          }
          
          // E-Mail senden
          console.log(`📧 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);
          
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
            
            // IDs speichern
            this.lastReviewIds.set(restaurantId, currentReviewId);
          }
        }
        
        // WICHTIG: Count in Memory UND DB speichern
        this.lastReviewCounts.set(restaurantId, currentCount);
        restaurant.last_review_count = currentCount;
        restaurant.last_review_check = new Date();
        await restaurant.save();
        
        return true;
      } else {
        console.log('   Keine neuen Bewertungen gefunden');
        // Trotzdem Memory aktualisieren
        this.lastReviewCounts.set(restaurantId, currentCount);
      }
      
      return false;
    } catch (error) {
      console.error('❌ Review Check Error:', error.message);
      return false;
    }
  }

  generateReviewId(review) {
    if (!review) return null;
    return `${review.author_name}_${review.time}_${review.rating}`;
  }

  startMonitoring() {
    if (this.isRunning) return;
    
    if (!this.apiKey) {
      console.log('⚠️ Review Monitoring NICHT gestartet - Google API Key fehlt!');
      return;
    }
    
    this.isRunning = true;
    console.log('✅ Review Monitoring gestartet');
    console.log(`   Prüfintervall: ${this.checkInterval / 1000} Sekunden`);
    console.log('   E-Mails werden NUR bei neuen Bewertungen gesendet');
    
    // Initial Baseline
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
        
        console.log(`🔍 Prüfe ${restaurants.length} Restaurants auf neue Reviews...`);
        
        for (const restaurant of restaurants) {
          await this.checkForNewReview(restaurant.id);
        }
      } catch (error) {
        console.error('Monitoring Error:', error);
      }
    }, this.checkInterval);
  }

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
            
            // WICHTIG: In Memory UND DB speichern
            this.lastReviewCounts.set(restaurant.id, currentCount);
            restaurant.last_review_count = currentCount;
            restaurant.last_review_check = new Date();
            await restaurant.save();
            
            if (result.reviews && result.reviews.length > 0) {
              const reviewId = this.generateReviewId(result.reviews[0]);
              this.lastReviewIds.set(restaurant.id, reviewId);
            }
            
            console.log(`   ✅ ${restaurant.name}: ${currentCount} Bewertungen (Baseline gesetzt)`);
          }
        } catch (error) {
          console.error(`   ❌ Fehler bei ${restaurant.name}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Baseline Error:', error);
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