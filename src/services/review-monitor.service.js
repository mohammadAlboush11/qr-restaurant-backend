// backend/src/services/review-monitor.service.js
// BEWÄHRTES SYSTEM - Speichert und vergleicht Review-Anzahl

const axios = require('axios');
const { Op } = require('sequelize');

class ReviewMonitorService {
  constructor() {
    this.monitoringInterval = null;
    this.checkInterval = 3 * 60 * 1000; // 3 Minuten
    this.isMonitoring = false;
    this.lastCheckTime = new Date();
    this.checkCount = 0;
    this.scanWaitList = new Map(); // Speichert kürzliche Scans
  }

  async start() {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      console.log('❌ Review Monitoring deaktiviert - Google API Key fehlt');
      return;
    }

    if (this.isMonitoring) {
      console.log('⚠️ Review Monitoring läuft bereits');
      return;
    }

    console.log('='.repeat(60));
    console.log('🚀 STARTE REVIEW MONITORING SERVICE');
    console.log(`   ⏱️ Check-Intervall: ${this.checkInterval / 1000 / 60} Minuten`);
    console.log(`   🔑 API Key: ${process.env.GOOGLE_PLACES_API_KEY ? '✅' : '❌'}`);
    console.log('='.repeat(60));
    
    this.isMonitoring = true;
    
    // Erste Prüfung nach 30 Sekunden
    setTimeout(() => this.checkAllRestaurants(), 30000);
    
    // Dann regelmäßig alle 3 Minuten
    this.monitoringInterval = setInterval(() => {
      this.checkAllRestaurants();
    }, this.checkInterval);
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.isMonitoring = false;
      console.log('⛔ Review Monitoring gestoppt');
    }
  }

  // Registriere einen Scan zur Überwachung
  registerScan(scanData) {
    const key = `${scanData.restaurant_id}_${Date.now()}`;
    this.scanWaitList.set(key, {
      ...scanData,
      timestamp: new Date(),
      checked: false
    });
    
    console.log(`📝 Scan registriert für Review-Überwachung:`);
    console.log(`   Restaurant: ${scanData.restaurant_name}`);
    console.log(`   Tisch: ${scanData.table_number}`);
    console.log(`   Zeit: ${new Date().toLocaleTimeString('de-DE')}`);
    
    // Lösche alte Einträge (älter als 1 Stunde)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of this.scanWaitList.entries()) {
      if (new Date(v.timestamp).getTime() < oneHourAgo) {
        this.scanWaitList.delete(k);
      }
    }
  }

  async checkAllRestaurants() {
    try {
      this.checkCount++;
      const { Restaurant } = require('../models');
      
      console.log(`\n🔍 Review Check #${this.checkCount} - ${new Date().toLocaleTimeString('de-DE')}`);
      
      const restaurants = await Restaurant.findAll({
        where: { 
          is_active: true,
          google_place_id: { [Op.ne]: null }
        }
      });

      if (restaurants.length === 0) {
        console.log('   Keine aktiven Restaurants mit Google Place ID');
        return;
      }

      console.log(`   Prüfe ${restaurants.length} Restaurant(s)...`);
      
      for (const restaurant of restaurants) {
        await this.checkRestaurantReviews(restaurant);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limiting
      }
      
      this.lastCheckTime = new Date();
      
    } catch (error) {
      console.error('❌ Review Check Error:', error.message);
    }
  }

  async checkRestaurantReviews(restaurant) {
    try {
      console.log(`   🏢 ${restaurant.name}`);
      
      // Hole aktuelle Review-Anzahl von Google
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
        console.log(`      ⚠️ API Error: ${response.data.status}`);
        if (response.data.error_message) {
          console.log(`      ${response.data.error_message}`);
        }
        return;
      }

      const placeDetails = response.data.result;
      const currentReviewCount = placeDetails.user_ratings_total || 0;
      const lastKnownCount = restaurant.last_review_count || 0;

      console.log(`      Reviews: ${currentReviewCount} (vorher: ${lastKnownCount})`);

      // NEUE BEWERTUNG GEFUNDEN?
      if (currentReviewCount > lastKnownCount) {
        const newReviewsCount = currentReviewCount - lastKnownCount;
        console.log(`      🌟 ${newReviewsCount} NEUE BEWERTUNG(EN)!`);
        
        // Prüfe ob es einen kürzlichen Scan gab
        let recentScan = null;
        for (const [key, scan] of this.scanWaitList.entries()) {
          if (scan.restaurant_id === restaurant.id && !scan.checked) {
            recentScan = scan;
            scan.checked = true;
            break;
          }
        }
        
        // Hole die neueste Review
        const latestReview = placeDetails.reviews?.[0];
        
        // Sende E-Mail
        await this.sendReviewNotificationEmail({
          restaurant,
          newReviewsCount,
          currentReviewCount,
          rating: placeDetails.rating,
          latestReview,
          recentScan
        });
        
        // Update Restaurant mit neuer Review-Anzahl
        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date(),
          current_rating: placeDetails.rating
        });
        
        console.log(`      ✅ Datenbank aktualisiert`);
        
      } else if (currentReviewCount < lastKnownCount) {
        // Reviews wurden gelöscht oder Reset
        console.log(`      ⚠️ Review-Anzahl gesunken (Reset?)`);
        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date(),
          current_rating: placeDetails.rating
        });
      } else {
        // Keine Änderung
        console.log(`      ✓ Keine neuen Reviews`);
        await restaurant.update({
          last_review_check: new Date()
        });
      }
      
    } catch (error) {
      console.error(`   ❌ Fehler bei ${restaurant.name}:`, error.message);
    }
  }

  async sendReviewNotificationEmail(data) {
    const { 
      restaurant, 
      newReviewsCount, 
      currentReviewCount, 
      rating, 
      latestReview,
      recentScan 
    } = data;
    
    try {
      const emailService = require('./email.service');
      
      if (!emailService.isConfigured) {
        console.log('      ❌ E-Mail Service nicht konfiguriert');
        return;
      }

      const emailContent = {
        to: restaurant.notification_email || restaurant.email,
        subject: `🌟 ${newReviewsCount} neue Bewertung(en) für ${restaurant.name}!`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
              .content { padding: 30px; }
              .success-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .review-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
              .stats { display: flex; justify-content: space-around; margin: 20px 0; }
              .stat-box { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; flex: 1; margin: 0 10px; }
              .stat-number { font-size: 28px; font-weight: bold; color: #667eea; }
              .button { display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f8f9fa; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Neue Google-Bewertung(en)!</h1>
                <p style="margin: 0; font-size: 18px;">${restaurant.name}</p>
              </div>
              
              <div class="content">
                <div class="success-box">
                  <strong>✅ ${newReviewsCount} neue Bewertung(en) erhalten!</strong><br>
                  ${recentScan ? `Möglicherweise durch QR-Scan von Tisch ${recentScan.table_number}` : 'Neue Bewertung(en) auf Google'}
                </div>

                ${latestReview ? `
                <div class="review-box">
                  <h3>📝 Neueste Bewertung:</h3>
                  <p><strong>Von:</strong> ${latestReview.author_name}</p>
                  <p><strong>Bewertung:</strong> ${'⭐'.repeat(latestReview.rating)}</p>
                  ${latestReview.text ? `<p><strong>Text:</strong> "${latestReview.text}"</p>` : ''}
                  <p><small>Zeit: ${new Date(latestReview.time * 1000).toLocaleString('de-DE')}</small></p>
                </div>
                ` : ''}

                <div class="stats">
                  <div class="stat-box">
                    <div class="stat-number">${currentReviewCount}</div>
                    <div style="color: #666; font-size: 14px;">Gesamt-Bewertungen</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-number">${rating ? rating.toFixed(1) : '0.0'}</div>
                    <div style="color: #666; font-size: 14px;">Durchschnitt</div>
                  </div>
                </div>

                <div style="text-align: center;">
                  <a href="https://business.google.com" class="button">
                    Bewertungen verwalten →
                  </a>
                </div>

                <div style="background: #e7f5ff; padding: 15px; border-radius: 5px; margin-top: 20px;">
                  <strong>💡 Tipp:</strong> Antworten Sie auf die Bewertung, um Kundenbindung zu zeigen!
                </div>
              </div>

              <div class="footer">
                <p>QR Restaurant System - Automatische Benachrichtigung</p>
                <p>© ${new Date().getFullYear()}</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await emailService.transporter.sendMail(emailContent);
      console.log(`      📧 E-Mail gesendet an ${emailContent.to}`);
      
    } catch (error) {
      console.error('      ❌ E-Mail-Fehler:', error.message);
    }
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkInterval: this.checkInterval,
      lastCheckTime: this.lastCheckTime,
      checkCount: this.checkCount,
      scanWaitList: this.scanWaitList.size,
      apiKeyConfigured: !!process.env.GOOGLE_PLACES_API_KEY
    };
  }
}

module.exports = new ReviewMonitorService();