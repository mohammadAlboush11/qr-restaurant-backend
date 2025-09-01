// backend/src/services/smart-review-notification.service.js
// ERWEITERTE VERSION MIT MEHR LOGGING UND DEBUGGING

const axios = require('axios');
const { Op } = require('sequelize');

class SmartReviewNotificationService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = 2 * 60 * 1000; // Alle 2 Minuten prüfen
    this.intervalId = null;
    this.scanCache = new Map();
    this.reviewCheckDelay = 3 * 60 * 1000; // 3 Minuten warten
    this.lastReviewCounts = new Map(); // Speichert letzte bekannte Review-Zahlen
  }

  async start() {
    if (this.isMonitoring) {
      console.log('⚠️ Review Monitoring läuft bereits');
      return;
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      console.warn('❌ Google Places API Key fehlt - Review Monitoring deaktiviert');
      console.warn('   Setzen Sie GOOGLE_PLACES_API_KEY in den Environment Variables!');
      return;
    }

    console.log('='.repeat(60));
    console.log('🔍 STARTE SMART REVIEW MONITORING SERVICE');
    console.log('   ⏱️ E-Mail-Verzögerung: 3 Minuten');
    console.log('   🔄 Check-Intervall: 2 Minuten');
    console.log('   🔑 API Key: ' + (process.env.GOOGLE_PLACES_API_KEY ? '✅ Vorhanden' : '❌ Fehlt'));
    console.log('='.repeat(60));
    
    this.isMonitoring = true;

    // Erste Prüfung nach 30 Sekunden
    setTimeout(() => {
      console.log('📊 Initiale Restaurant-Prüfung...');
      this.checkAllRestaurants();
    }, 30000);

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
      scan_id,
      restaurant_id, 
      table_id, 
      restaurant_name, 
      table_number,
      scan_time,
      ip_address,
      user_agent,
      google_place_id,
      notification_email
    } = scanData;

    if (!google_place_id) {
      console.log(`❌ Kann Scan nicht registrieren - Google Place ID fehlt für ${restaurant_name}`);
      return;
    }

    const scanKey = `${restaurant_id}_${scan_id}_${Date.now()}`;
    
    this.scanCache.set(scanKey, {
      ...scanData,
      scan_time: scan_time || new Date(),
      check_after: new Date(Date.now() + this.reviewCheckDelay),
      attempts: 0,
      max_attempts: 10
    });

    console.log('='.repeat(60));
    console.log(`📝 SCAN REGISTRIERT FÜR REVIEW-MONITORING`);
    console.log(`   Restaurant: ${restaurant_name}`);
    console.log(`   Tisch: ${table_number}`);
    console.log(`   Google Place ID: ${google_place_id}`);
    console.log(`   E-Mail an: ${notification_email}`);
    console.log(`   ⏱️ Erster Check in: 3 Minuten`);
    console.log(`   Cache-Key: ${scanKey}`);
    console.log(`   Aktuelle Cache-Größe: ${this.scanCache.size}`);
    console.log('='.repeat(60));

    // Initiale Review-Anzahl speichern falls noch nicht vorhanden
    if (!this.lastReviewCounts.has(restaurant_id)) {
      await this.getInitialReviewCount(restaurant_id, google_place_id);
    }

    // Plane Review-Check nach 3 Minuten
    setTimeout(() => {
      console.log(`⏰ Starte Review-Check für ${scanKey}`);
      this.checkForNewReview(scanKey);
    }, this.reviewCheckDelay);
  }

  /**
   * Hole initiale Review-Anzahl
   */
  async getInitialReviewCount(restaurantId, placeId) {
    try {
      console.log(`📊 Hole initiale Review-Anzahl für Restaurant ${restaurantId}`);
      
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: placeId,
            fields: 'user_ratings_total',
            key: process.env.GOOGLE_PLACES_API_KEY,
            language: 'de'
          },
          timeout: 10000
        }
      );

      if (response.data.status === 'OK') {
        const reviewCount = response.data.result.user_ratings_total || 0;
        this.lastReviewCounts.set(restaurantId, reviewCount);
        console.log(`   Aktuelle Review-Anzahl: ${reviewCount}`);
        
        // Update auch in Datenbank
        const { Restaurant } = require('../models');
        await Restaurant.update(
          { last_review_count: reviewCount },
          { where: { id: restaurantId } }
        );
      }
    } catch (error) {
      console.error(`❌ Fehler beim Abrufen der initialen Review-Anzahl:`, error.message);
    }
  }

  /**
   * Prüfe ob neue Review vorhanden ist
   */
  async checkForNewReview(scanKey) {
    const scanData = this.scanCache.get(scanKey);
    if (!scanData) {
      console.log(`⚠️ Scan ${scanKey} nicht mehr im Cache`);
      return;
    }

    console.log('='.repeat(60));
    console.log(`🔍 PRÜFE AUF NEUE REVIEW`);
    console.log(`   Restaurant: ${scanData.restaurant_name}`);
    console.log(`   Versuch: ${scanData.attempts + 1}/${scanData.max_attempts}`);
    console.log(`   Place ID: ${scanData.google_place_id}`);

    try {
      // Google Places API aufrufen
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: scanData.google_place_id,
            fields: 'reviews,rating,user_ratings_total',
            key: process.env.GOOGLE_PLACES_API_KEY,
            language: 'de'
          },
          timeout: 10000
        }
      );

      console.log(`   API Response Status: ${response.data.status}`);

      if (response.data.status !== 'OK') {
        throw new Error(`Google API Error: ${response.data.status}`);
      }

      const placeDetails = response.data.result;
      const currentReviewCount = placeDetails.user_ratings_total || 0;
      const lastKnownCount = this.lastReviewCounts.get(scanData.restaurant_id) || 0;

      console.log(`   Letzte bekannte Reviews: ${lastKnownCount}`);
      console.log(`   Aktuelle Reviews: ${currentReviewCount}`);
      console.log(`   Differenz: ${currentReviewCount - lastKnownCount}`);

      // Prüfe ob neue Review vorhanden
      if (currentReviewCount > lastKnownCount) {
        console.log(`✅ NEUE BEWERTUNG GEFUNDEN!`);
        console.log(`   ${currentReviewCount - lastKnownCount} neue Review(s)`);
        
        // Update gespeicherte Anzahl
        this.lastReviewCounts.set(scanData.restaurant_id, currentReviewCount);
        
        // Finde die neueste Review
        const latestReview = placeDetails.reviews?.[0];
        if (latestReview) {
          console.log(`   Autor: ${latestReview.author_name}`);
          console.log(`   Rating: ${latestReview.rating} Sterne`);
          console.log(`   Text: ${latestReview.text?.substring(0, 100) || 'Kein Text'}`);
        }
        
        // Berechne Reaktionszeit
        const reactionTime = Math.round((Date.now() - new Date(scanData.scan_time).getTime()) / 60000);
        console.log(`   Reaktionszeit: ${reactionTime} Minuten`);
        
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

        // Update Restaurant in Datenbank
        const { Restaurant, Scan } = require('../models');
        
        await Restaurant.update(
          {
            last_review_count: currentReviewCount,
            last_review_check: new Date(),
            current_rating: placeDetails.rating
          },
          { where: { id: scanData.restaurant_id } }
        );

        // Markiere Scan als verarbeitet
        if (scanData.scan_id) {
          await Scan.update(
            {
              processed: true,
              processed_at: new Date(),
              resulted_in_review: true,
              review_details: JSON.stringify({
                author: latestReview?.author_name,
                rating: latestReview?.rating,
                text: latestReview?.text
              }),
              review_reaction_time: reactionTime
            },
            { where: { id: scanData.scan_id } }
          );
        }

        // Aus Cache entfernen
        this.scanCache.delete(scanKey);
        console.log(`✅ Scan ${scanKey} erfolgreich verarbeitet und aus Cache entfernt`);
        console.log('='.repeat(60));
        
      } else {
        // Keine neue Review gefunden
        scanData.attempts++;
        console.log(`❌ Keine neue Review gefunden`);
        
        if (scanData.attempts < scanData.max_attempts) {
          // Versuche es später nochmal
          const nextCheckIn = 2; // Minuten
          console.log(`   Nächster Check in ${nextCheckIn} Minuten`);
          console.log('='.repeat(60));
          
          setTimeout(() => {
            this.checkForNewReview(scanKey);
          }, nextCheckIn * 60 * 1000);
          
        } else {
          // Maximum erreicht
          console.log(`⏱️ Maximum erreicht - gebe auf nach ${scanData.attempts} Versuchen`);
          
          // Optional: Info-Email senden
          if (scanData.attempts >= 5) { // Nur wenn mindestens 5 Versuche
            await this.sendNoReviewNotificationEmail({
              ...scanData,
              review_found: false,
              total_wait_time: scanData.attempts * 2
            });
          }
          
          // Markiere Scan als verarbeitet (ohne Review)
          if (scanData.scan_id) {
            const { Scan } = require('../models');
            await Scan.update(
              {
                processed: true,
                processed_at: new Date(),
                resulted_in_review: false,
                check_attempts: scanData.attempts
              },
              { where: { id: scanData.scan_id } }
            );
          }
          
          this.scanCache.delete(scanKey);
          console.log(`❌ Scan ${scanKey} ohne Review aus Cache entfernt`);
          console.log('='.repeat(60));
        }
      }
      
    } catch (error) {
      console.error(`❌ Review-Check Fehler:`, error.message);
      console.error(`   Details:`, error.response?.data || error);
      
      // Bei Fehler: Versuche es später nochmal
      scanData.attempts++;
      if (scanData.attempts < 3) { // Bei Fehlern nur 3 Versuche
        setTimeout(() => this.checkForNewReview(scanKey), 5 * 60 * 1000);
      } else {
        this.scanCache.delete(scanKey);
        console.log(`❌ Scan ${scanKey} nach Fehler aus Cache entfernt`);
      }
      console.log('='.repeat(60));
    }
  }

  /**
   * Sende E-Mail wenn Review gefunden wurde
   */
  async sendReviewNotificationEmail(data) {
    console.log('📧 SENDE REVIEW-BENACHRICHTIGUNG');
    console.log(`   An: ${data.notification_email || data.restaurant_email}`);
    console.log(`   Review: ${data.review_rating} Sterne von ${data.review_author}`);
    
    try {
      const emailService = require('./email.service');
      
      if (!emailService.isConfigured) {
        console.warn('❌ E-Mail Service nicht konfiguriert');
        return;
      }

      const emailContent = {
        to: data.notification_email || data.restaurant_email,
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
                  <strong>✅ Erfolg!</strong> Ein Gast hat nach dem QR-Code Scan (Tisch ${data.table_number}) tatsächlich eine Bewertung hinterlassen!
                </div>

                <div class="fast-response">
                  <strong>⚡ Schnelle Reaktion!</strong><br>
                  Die Bewertung erfolgte nur ${data.reaction_time_minutes || 3} Minuten nach dem Scan!
                </div>

                <div class="timeline">
                  <strong>📱 Ablauf:</strong><br>
                  • QR-Scan: Tisch ${data.table_number} um ${new Date(data.scan_time).toLocaleString('de-DE')}<br>
                  • Bewertung: Nach ~${data.reaction_time_minutes || 3} Minuten<br>
                  • Benachrichtigung: Jetzt
                </div>

                <div class="review-box">
                  <h3>📝 Bewertungsdetails:</h3>
                  <div class="rating">${'⭐'.repeat(Math.max(1, data.review_rating))}</div>
                  <p><strong>Von:</strong> ${data.review_author}</p>
                  ${data.review_text ? `<p><strong>Bewertungstext:</strong><br>"${data.review_text}"</p>` : '<p><em>Keine schriftliche Bewertung hinterlassen</em></p>'}
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
                  <a href="https://business.google.com" class="button">
                    Jetzt auf Bewertung antworten →
                  </a>
                </div>

                <div style="background: #e7f5ff; padding: 15px; border-radius: 5px; margin-top: 20px;">
                  <strong>💡 Wichtig:</strong> Antworten Sie zeitnah auf die Bewertung! Das zeigt anderen Gästen, dass Sie Feedback ernst nehmen.
                </div>
              </div>

              <div class="footer">
                <p>QR Restaurant System - Automatische Review-Benachrichtigung</p>
                <p>© ${new Date().getFullYear()} Alle Rechte vorbehalten.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await emailService.transporter.sendMail(emailContent);
      console.log(`✅ Review-Benachrichtigung erfolgreich gesendet an ${emailContent.to}`);
    } catch (error) {
      console.error('❌ E-Mail-Versand fehlgeschlagen:', error);
    }
  }

  /**
   * Sende Info-Email wenn keine Review erfolgte (optional)
   */
  async sendNoReviewNotificationEmail(data) {
    // Optional - kann deaktiviert werden wenn zu viele E-Mails
    console.log(`📊 Optional: Info-E-Mail für Scan ohne Review (${data.restaurant_name})`);
    
    // Wenn Sie diese E-Mails nicht möchten, einfach return hier:
    return; // DEAKTIVIERT - Keine E-Mails bei ausbleibenden Reviews
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
        },
        attributes: ['id', 'name', 'google_place_id', 'last_review_count']
      });

      if (restaurants.length > 0) {
        console.log(`🔍 Prüfe ${restaurants.length} Restaurants auf neue Reviews...`);
        
        for (const restaurant of restaurants) {
          // Speichere letzte bekannte Anzahl falls noch nicht vorhanden
          if (!this.lastReviewCounts.has(restaurant.id)) {
            this.lastReviewCounts.set(restaurant.id, restaurant.last_review_count || 0);
          }
          
          await this.checkRestaurantReviews(restaurant);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limiting
        }
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
          },
          timeout: 5000
        }
      );

      if (response.data.status === 'OK') {
        const currentCount = response.data.result.user_ratings_total || 0;
        const lastCount = this.lastReviewCounts.get(restaurant.id) || restaurant.last_review_count || 0;
        
        if (currentCount !== lastCount) {
          this.lastReviewCounts.set(restaurant.id, currentCount);
          
          await restaurant.update({
            last_review_count: currentCount,
            last_review_check: new Date(),
            current_rating: response.data.result.rating
          });
          
          if (currentCount > lastCount) {
            console.log(`📈 ${restaurant.name}: ${currentCount - lastCount} neue Review(s) (Total: ${currentCount})`);
          }
        }
      }
    } catch (error) {
      // Stille Fehlerbehandlung für Background-Check
    }
  }

  /**
   * Verarbeite ausstehende Scans beim Neustart
   */
  async processPendingScans() {
    try {
      console.log('📋 Prüfe auf ausstehende Scans...');
      
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
              google_place_id: scan.restaurant.google_place_id,
              notification_email: scan.restaurant.notification_email || scan.restaurant.email
            });
          }
        }
      } else {
        console.log('📋 Keine ausstehenden Scans gefunden');
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
      cachedRestaurants: this.lastReviewCounts.size,
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