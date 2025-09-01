// backend/src/services/smart-review-notification.service.js
// NEUER SERVICE - E-MAILS NUR BEI ECHTEN REVIEWS (3 MIN VERZÖGERUNG)

const axios = require('axios');
const { Op } = require('sequelize');

class SmartReviewNotificationService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = 2 * 60 * 1000; // Alle 2 Minuten prüfen
    this.intervalId = null;
    this.scanCache = new Map();
    
    // ⚡ HIER DIE WICHTIGE ÄNDERUNG - NUR 3 MINUTEN WARTEN!
    this.reviewCheckDelay = 3 * 60 * 1000; // 3 Minuten statt 10!
  }

  async start() {
    if (this.isMonitoring) {
      console.log('⚠️ Review Monitoring läuft bereits');
      return;
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      console.warn('❌ Google Places API Key fehlt - Review Monitoring deaktiviert');
      return;
    }

    console.log('🔍 Starte intelligentes Review Monitoring...');
    console.log('⏱️ E-Mail-Verzögerung: 3 Minuten');
    this.isMonitoring = true;

    // Erste Prüfung nach 1 Minute
    setTimeout(() => this.checkAllRestaurants(), 60000);

    // Regelmäßige Prüfung alle 2 Minuten
    this.intervalId = setInterval(() => {
      this.checkAllRestaurants();
    }, this.checkInterval);

    // Prüfe ausstehende Scans beim Start
    this.processPendingScans();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isMonitoring = false;
      console.log('⛔ Review Monitoring gestoppt');
    }
  }

  /**
   * Registriere einen neuen Scan (ohne sofortige E-Mail)
   */
  async registerScan(scanData) {
    const { 
      restaurant_id, 
      table_id, 
      restaurant_name, 
      table_number,
      scan_time,
      ip_address,
      user_agent 
    } = scanData;

    const scanKey = `${restaurant_id}_${Date.now()}`;
    
    this.scanCache.set(scanKey, {
      ...scanData,
      scan_time: scan_time || new Date(),
      check_after: new Date(Date.now() + this.reviewCheckDelay),
      attempts: 0,
      max_attempts: 10 // Mehr Versuche bei kürzerer Zeit
    });

    console.log(`📝 Scan registriert für ${restaurant_name} - Tisch ${table_number}`);
    console.log(`   ⏱️ Review-Check in 3 Minuten geplant`);

    // Plane Review-Check nach 3 Minuten
    setTimeout(() => {
      this.checkForNewReview(scanKey);
    }, this.reviewCheckDelay);
  }

  /**
   * Prüfe ob neue Review vorhanden ist
   */
  async checkForNewReview(scanKey) {
    const scanData = this.scanCache.get(scanKey);
    if (!scanData) return;

    try {
      const { Restaurant } = require('../models');
      const restaurant = await Restaurant.findByPk(scanData.restaurant_id);
      
      if (!restaurant || !restaurant.google_place_id) {
        console.log(`⚠️ Restaurant ohne Google Place ID - überspringe`);
        this.scanCache.delete(scanKey);
        return;
      }

      console.log(`🔍 Prüfe Reviews für ${restaurant.name}...`);

      // Hole aktuelle Reviews von Google
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
        throw new Error(`Google API Error: ${response.data.status}`);
      }

      const placeDetails = response.data.result;
      const currentReviewCount = placeDetails.user_ratings_total || 0;
      const lastKnownCount = restaurant.last_review_count || 0;

      // Prüfe ob neue Review vorhanden
      if (currentReviewCount > lastKnownCount) {
        console.log(`✅ NEUE BEWERTUNG gefunden für ${restaurant.name}!`);
        console.log(`   Vorher: ${lastKnownCount} Reviews`);
        console.log(`   Jetzt: ${currentReviewCount} Reviews`);
        
        // Finde die neueste Review
        const latestReview = placeDetails.reviews?.[0];
        
        // Berechne Reaktionszeit
        const reactionTime = Math.round((Date.now() - new Date(scanData.scan_time).getTime()) / 60000);
        
        // Sende E-Mail mit Review-Details
        await this.sendReviewNotificationEmail({
          ...scanData,
          review_found: true,
          review_author: latestReview?.author_name || 'Anonym',
          review_rating: latestReview?.rating || 0,
          review_text: latestReview?.text || '',
          review_time: latestReview?.time ? new Date(latestReview.time * 1000) : new Date(),
          total_reviews: currentReviewCount,
          average_rating: placeDetails.rating,
          reaction_time_minutes: reactionTime
        });

        // Update Restaurant
        await restaurant.update({
          last_review_count: currentReviewCount,
          last_review_check: new Date(),
          current_rating: placeDetails.rating
        });

        // Scan als erfolgreich markieren
        if (scanData.scan_id) {
          const { Scan } = require('../models');
          const scan = await Scan.findByPk(scanData.scan_id);
          if (scan) {
            await scan.update({
              processed: true,
              processed_at: new Date(),
              resulted_in_review: true,
              review_details: {
                author: latestReview?.author_name,
                rating: latestReview?.rating,
                text: latestReview?.text
              }
            });
          }
        }

        // Aus Cache entfernen
        this.scanCache.delete(scanKey);
        
      } else {
        // Keine neue Review gefunden
        scanData.attempts++;
        
        if (scanData.attempts < scanData.max_attempts) {
          // Versuche es später nochmal - alle 2 Minuten
          console.log(`🔄 Keine neue Review - Versuch ${scanData.attempts}/${scanData.max_attempts}`);
          
          setTimeout(() => {
            this.checkForNewReview(scanKey);
          }, 2 * 60 * 1000); // Nächster Check in 2 Minuten
          
        } else {
          // Maximum erreicht (nach ~20 Minuten aufgeben)
          console.log(`⏱️ Keine Review nach ${scanData.max_attempts} Versuchen`);
          
          // Optional: Info-Email senden
          await this.sendNoReviewNotificationEmail({
            ...scanData,
            review_found: false,
            message: 'Der Gast hat nach dem Scan keine Bewertung hinterlassen.',
            total_wait_time: scanData.attempts * 2
          });
          
          // Scan als verarbeitet markieren
          if (scanData.scan_id) {
            const { Scan } = require('../models');
            const scan = await Scan.findByPk(scanData.scan_id);
            if (scan) {
              await scan.update({
                processed: true,
                processed_at: new Date(),
                resulted_in_review: false
              });
            }
          }
          
          this.scanCache.delete(scanKey);
        }
      }
      
    } catch (error) {
      console.error(`❌ Review-Check Fehler für ${scanKey}:`, error.message);
      
      // Bei Fehler: Versuche es später nochmal oder lösche
      const scanData = this.scanCache.get(scanKey);
      if (scanData && scanData.attempts < 3) {
        scanData.attempts++;
        setTimeout(() => this.checkForNewReview(scanKey), 5 * 60 * 1000);
      } else {
        this.scanCache.delete(scanKey);
      }
    }
  }

  /**
   * Sende E-Mail wenn Review gefunden wurde
   */
  async sendReviewNotificationEmail(data) {
    const emailService = require('./email.service');
    
    if (!emailService.isConfigured) {
      console.warn('❌ E-Mail Service nicht konfiguriert');
      return;
    }

    const emailContent = {
      to: data.restaurant_email || data.notification_email,
      subject: `🌟 Neue ${data.review_rating}-Sterne Bewertung erhalten!`,
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
            .rating { color: #ffc107; font-size: 24px; margin: 10px 0; }
            .timeline { background: #e7f5ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .stats { display: flex; justify-content: space-around; margin: 20px 0; }
            .stat-box { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; flex: 1; margin: 0 10px; }
            .stat-number { font-size: 28px; font-weight: bold; color: #667eea; }
            .stat-label { color: #666; font-size: 14px; margin-top: 5px; }
            .button { display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f8f9fa; }
            .fast-response { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Neue Google-Bewertung erhalten!</h1>
              <p style="margin: 0; font-size: 18px;">${data.restaurant_name}</p>
            </div>
            
            <div class="content">
              <div class="success-box">
                <strong>✅ Erfolg!</strong> Ein Gast hat nach dem QR-Code Scan tatsächlich eine Bewertung hinterlassen!
              </div>

              <div class="fast-response">
                <strong>⚡ Schnelle Reaktion!</strong><br>
                Bewertung erfolgte nur ${data.reaction_time_minutes || 3} Minuten nach dem Scan!
              </div>

              <div class="timeline">
                <strong>📱 Ablauf:</strong><br>
                • Scan: Tisch ${data.table_number} um ${new Date(data.scan_time).toLocaleString('de-DE')}<br>
                • Bewertung: ${data.review_rating} Sterne (nach ~${data.reaction_time_minutes || 3} Minuten)<br>
                • Benachrichtigung: Jetzt (${new Date().toLocaleString('de-DE')})
              </div>

              <div class="review-box">
                <h3>📝 Bewertungsdetails:</h3>
                <div class="rating">${'⭐'.repeat(data.review_rating)}</div>
                <p><strong>Von:</strong> ${data.review_author}</p>
                ${data.review_text ? `<p><strong>Text:</strong> "${data.review_text}"</p>` : '<p><em>Keine schriftliche Bewertung hinterlassen</em></p>'}
              </div>

              <div class="stats">
                <div class="stat-box">
                  <div class="stat-number">${data.total_reviews}</div>
                  <div class="stat-label">Gesamt-Bewertungen</div>
                </div>
                <div class="stat-box">
                  <div class="stat-number">${data.average_rating ? data.average_rating.toFixed(1) : '0.0'}</div>
                  <div class="stat-label">Durchschnitt</div>
                </div>
              </div>

              <div style="text-align: center;">
                <a href="${data.google_review_url || 'https://business.google.com'}" class="button">
                  Alle Bewertungen ansehen →
                </a>
              </div>

              <div style="background: #e7f5ff; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <strong>💡 Tipp:</strong> Antworten Sie zeitnah auf die Bewertung, um Ihre Kundenbindung zu stärken!
              </div>
            </div>

            <div class="footer">
              <p>Diese Benachrichtigung wurde automatisch vom QR Restaurant System generiert.</p>
              <p>© ${new Date().getFullYear()} QR Restaurant System. Alle Rechte vorbehalten.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await emailService.transporter.sendMail(emailContent);
      console.log(`📧 Review-Benachrichtigung gesendet an ${emailContent.to}`);
    } catch (error) {
      console.error('❌ E-Mail-Versand fehlgeschlagen:', error);
    }
  }

  /**
   * Sende Info-Email wenn keine Review erfolgte (optional)
   */
  async sendNoReviewNotificationEmail(data) {
    // Optional - kann auch deaktiviert werden
    const emailService = require('./email.service');
    
    if (!emailService.isConfigured) return;
    
    // Wenn Sie keine "Keine-Review" E-Mails möchten, kommentieren Sie den Rest aus
    /*
    const emailContent = {
      to: data.restaurant_email || data.notification_email,
      subject: `📊 QR-Scan ohne Bewertung - Tisch ${data.table_number}`,
      // ... E-Mail Inhalt
    };
    
    await emailService.transporter.sendMail(emailContent);
    */
  }

  /**
   * Prüfe alle Restaurants auf neue Reviews (Backup-Mechanismus)
   */
  async checkAllRestaurants() {
    try {
      const { Restaurant } = require('../models');
      const restaurants = await Restaurant.findAll({
        where: {
          is_active: true,
          google_place_id: { [Op.ne]: null }
        }
      });

      console.log(`🔍 Prüfe ${restaurants.length} Restaurants auf neue Reviews...`);

      for (const restaurant of restaurants) {
        await this.checkRestaurantReviews(restaurant);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limiting
      }
    } catch (error) {
      console.error('❌ Fehler beim Restaurant-Check:', error);
    }
  }

  async checkRestaurantReviews(restaurant) {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: restaurant.google_place_id,
            fields: 'rating,user_ratings_total',
            key: process.env.GOOGLE_PLACES_API_KEY
          }
        }
      );

      if (response.data.status === 'OK') {
        const currentCount = response.data.result.user_ratings_total || 0;
        const lastCount = restaurant.last_review_count || 0;
        
        if (currentCount !== lastCount) {
          await restaurant.update({
            last_review_count: currentCount,
            last_review_check: new Date(),
            current_rating: response.data.result.rating
          });
          
          if (currentCount > lastCount) {
            console.log(`📈 ${restaurant.name}: ${currentCount - lastCount} neue Review(s)`);
          }
        }
      }
    } catch (error) {
      console.error(`Review-Check Error für ${restaurant.name}:`, error.message);
    }
  }

  /**
   * Verarbeite ausstehende Scans beim Neustart
   */
  async processPendingScans() {
    try {
      const { Scan, Restaurant, Table } = require('../models');
      
      // Hole unverarbeitete Scans der letzten 30 Minuten
      const cutoffTime = new Date(Date.now() - 30 * 60 * 1000);
      
      const pendingScans = await Scan.findAll({
        where: {
          created_at: { [Op.gte]: cutoffTime },
          processed: false
        },
        include: [
          {
            model: Restaurant,
            as: 'restaurant',
            attributes: ['id', 'name', 'google_place_id', 'notification_email', 'email']
          },
          {
            model: Table,
            as: 'table',
            attributes: ['id', 'table_number', 'description']
          }
        ],
        order: [['created_at', 'DESC']]
      });

      if (pendingScans.length > 0) {
        console.log(`📋 ${pendingScans.length} ausstehende Scans gefunden`);
        
        for (const scan of pendingScans) {
          if (scan.restaurant && scan.restaurant.google_place_id) {
            this.registerScan({
              scan_id: scan.id,
              restaurant_id: scan.restaurant_id,
              table_id: scan.table_id,
              restaurant_name: scan.restaurant.name,
              restaurant_email: scan.restaurant.notification_email || scan.restaurant.email,
              table_number: scan.table?.table_number || 'Unbekannt',
              scan_time: scan.created_at,
              ip_address: scan.ip_address,
              user_agent: scan.user_agent,
              google_place_id: scan.restaurant.google_place_id
            });
          }
        }
      }
    } catch (error) {
      console.error('❌ Fehler beim Laden ausstehender Scans:', error);
    }
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkInterval: this.checkInterval,
      reviewCheckDelay: this.reviewCheckDelay,
      pendingScans: this.scanCache.size,
      apiKeyConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
      settings: {
        waitTime: '3 Minuten',
        recheckInterval: '2 Minuten',
        maxAttempts: 10
      }
    };
  }
}

module.exports = new SmartReviewNotificationService();