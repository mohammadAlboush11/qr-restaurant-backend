// backend/src/controllers/public/tracking.controller.js
// VOLLSTÄNDIG KORRIGIERTE VERSION - KEINE SOFORT-E-MAILS MEHR!

const { QRCode, Scan, Table, Restaurant, ActivityLog } = require('../../models');
const { Op } = require('sequelize');

// WICHTIG: KEIN Import von emailService mehr!
// const emailService = require('../../services/email.service'); // ENTFERNT!

class TrackingController {
  // QR-Code Scan - OHNE sofortige E-Mail-Benachrichtigung
  async trackScan(req, res) {
    try {
      const { code } = req.params;
      
      // Validierung des Codes
      if (!code || code === 'null' || code === 'undefined') {
        console.log('❌ Kein gültiger QR-Code angegeben');
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Fehler</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container { 
                background: white; 
                padding: 40px; 
                border-radius: 10px; 
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                max-width: 400px;
              }
              h1 { color: #dc3545; margin-bottom: 10px; }
              p { color: #6c757d; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Ungültiger QR-Code</h1>
              <p>Kein gültiger QR-Code angegeben.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // IP und User Agent erfassen
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      
      console.log(`📱 QR-Code Scan: ${code} von IP: ${ipAddress}`);
      
      // QR Code mit allen Beziehungen laden
      const qrCode = await QRCode.findOne({
        where: { 
          code: code.toUpperCase(),
          is_active: true 
        },
        include: [
          {
            model: Table,
            as: 'table',
            required: true,
            include: [
              {
                model: Restaurant,
                as: 'restaurant',
                required: true
              }
            ]
          }
        ]
      });
      
      // Validierungen
      if (!qrCode) {
        console.log(`❌ QR-Code nicht gefunden: ${code}`);
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QR-Code ungültig</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container { 
                background: white; 
                padding: 40px; 
                border-radius: 10px; 
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                max-width: 400px;
              }
              h1 { color: #dc3545; }
              p { color: #6c757d; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>QR-Code nicht gefunden</h1>
              <p>Dieser QR-Code existiert nicht oder ist nicht mehr aktiv.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      const restaurant = qrCode.table.restaurant;
      const table = qrCode.table;
      
      // Restaurant aktiv prüfen
      if (!restaurant.is_active) {
        console.log(`⚠️ Restaurant inaktiv: ${restaurant.name}`);
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Service nicht verfügbar</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh;
                margin: 0;
                background: #f8f9fa;
              }
              .container { 
                background: white; 
                padding: 40px; 
                border-radius: 10px; 
                text-align: center;
                border: 2px solid #ffc107;
                max-width: 400px;
              }
              h1 { color: #ffc107; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Service nicht verfügbar</h1>
              <p>Dieses Restaurant ist momentan nicht aktiv.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // Subscription prüfen
      if (restaurant.subscription_status !== 'active' && restaurant.subscription_status !== 'trial') {
        console.log(`⚠️ Subscription inaktiv für Restaurant: ${restaurant.name}`);
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Abonnement inaktiv</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh;
                margin: 0;
                background: #f8f9fa;
              }
              .container { 
                background: white; 
                padding: 40px; 
                border-radius: 10px; 
                text-align: center;
                border: 2px solid #ffc107;
                max-width: 400px;
              }
              h1 { color: #ffc107; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Abonnement inaktiv</h1>
              <p>Das Abonnement für dieses Restaurant ist nicht aktiv.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // Google Review URL konstruieren
      let redirectUrl = '';
      
      console.log(`🔍 Restaurant Google Place ID: ${restaurant.google_place_id}`);
      
      if (restaurant.google_review_url) {
        redirectUrl = restaurant.google_review_url;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          redirectUrl = 'https://' + redirectUrl;
        }
      } else if (restaurant.google_place_id) {
        // Direkt-Link zu Google Reviews mit Place ID
        redirectUrl = `https://search.google.com/local/writereview?placeid=${restaurant.google_place_id}`;
      } else if (restaurant.google_business_url) {
        redirectUrl = restaurant.google_business_url;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          redirectUrl = 'https://' + redirectUrl;
        }
      } else {
        // Fallback: Google-Suche
        const searchQuery = encodeURIComponent(
          `${restaurant.name} ${restaurant.address || ''} Bewertung schreiben`
        );
        redirectUrl = `https://www.google.com/search?q=${searchQuery}`;
      }
      
      console.log(`🔄 Redirecting to: ${redirectUrl}`);
      
      // Scan in Datenbank speichern
      const scan = await Scan.create({
        qr_code_id: qrCode.id,
        table_id: table.id,
        restaurant_id: restaurant.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        redirected_to: redirectUrl,
        processed: false // WICHTIG: Als unverarbeitet markieren
      });
      
      // Scan-Zähler erhöhen
      await qrCode.increment('scan_count');
      await qrCode.update({ last_scan_at: new Date() });
      
      await table.increment('scan_count');
      await table.update({ last_scan_at: new Date() });
      
      console.log(`✅ Scan #${qrCode.scan_count + 1} für ${restaurant.name} - Tisch ${table.table_number}`);
      
      // ============================================================
      // WICHTIG: KEINE SOFORTIGE E-MAIL MEHR!
      // Stattdessen: Registriere Scan für Review-Monitoring
      // ============================================================
      
      // ENTFERNT: Der alte E-Mail Code ist komplett gelöscht!
      // KEIN emailService.sendScanNotification mehr!
      
      // NEU: Smart Review Service für verzögerte E-Mail bei echter Review
      try {
        // Prüfe ob Smart Review Service verfügbar ist
        let smartReviewService = null;
        try {
          smartReviewService = require('../../services/smart-review-notification.service');
        } catch (e) {
          console.log('⚠️ Smart Review Service nicht gefunden - verwende Fallback');
        }
        
        if (smartReviewService && restaurant.google_place_id) {
          await smartReviewService.registerScan({
            scan_id: scan.id,
            restaurant_id: restaurant.id,
            table_id: table.id,
            restaurant_name: restaurant.name,
            restaurant_email: restaurant.notification_email || restaurant.email,
            table_number: table.table_number,
            table_description: table.description,
            scan_time: new Date(),
            ip_address: ipAddress,
            user_agent: userAgent,
            google_review_url: redirectUrl,
            google_place_id: restaurant.google_place_id,
            notification_email: restaurant.notification_email || restaurant.email
          });
          
          console.log(`📝 Scan registriert für Review-Monitoring`);
          console.log(`   Restaurant: ${restaurant.name}`);
          console.log(`   Google Place ID: ${restaurant.google_place_id}`);
          console.log(`   E-Mail wird gesendet an: ${restaurant.notification_email || restaurant.email}`);
          console.log(`   ⏱️ Review-Check in 3 Minuten`);
        } else if (!restaurant.google_place_id) {
          console.log(`⚠️ WARNUNG: Kein Google Place ID für ${restaurant.name}`);
          console.log(`   Review-Monitoring nicht möglich ohne Google Place ID!`);
        }
      } catch (serviceError) {
        console.error('❌ Fehler beim Registrieren für Review-Monitoring:', serviceError.message);
        // Trotzdem weiterleiten auch wenn Service-Fehler
      }
      
      // Weiterleitung zu Google Reviews
      console.log(`✅ Weiterleitung ohne E-Mail zu: ${redirectUrl}`);
      res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('❌ Scan Error:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Fehler</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh;
              margin: 0;
              background: #f8f9fa;
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 10px; 
              text-align: center;
              border: 1px solid #dee2e6;
              max-width: 400px;
            }
            h1 { color: #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Ein Fehler ist aufgetreten</h1>
            <p>Bitte versuchen Sie es später erneut.</p>
          </div>
        </body>
        </html>
      `);
    }
  }
  
  // QR-Code Validierung (API Endpoint)
  async validateCode(req, res) {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'QR-Code erforderlich'
        });
      }
      
      const qrCode = await QRCode.findOne({
        where: { code: code.toUpperCase() },
        include: [
          {
            model: Table,
            as: 'table',
            include: [
              {
                model: Restaurant,
                as: 'restaurant'
              }
            ]
          }
        ]
      });
      
      if (!qrCode) {
        return res.json({
          success: false,
          valid: false,
          message: 'QR-Code nicht gefunden'
        });
      }
      
      const isValid = qrCode.is_active && 
                     qrCode.table?.restaurant?.is_active &&
                     (qrCode.table.restaurant.subscription_status === 'active' || 
                      qrCode.table.restaurant.subscription_status === 'trial');
      
      res.json({
        success: true,
        valid: isValid,
        data: isValid ? {
          restaurant_name: qrCode.table.restaurant.name,
          table_number: qrCode.table.table_number,
          subscription_status: qrCode.table.restaurant.subscription_status,
          has_google_place_id: !!qrCode.table.restaurant.google_place_id
        } : null
      });
      
    } catch (error) {
      console.error('Validate Error:', error);
      res.status(500).json({
        success: false,
        message: 'Validierung fehlgeschlagen'
      });
    }
  }
  
  // Öffentliche Statistiken
  async getPublicStats(req, res) {
    try {
      const { code } = req.params;
      
      const qrCode = await QRCode.findOne({
        where: { code: code.toUpperCase() },
        attributes: ['scan_count', 'last_scan_at'],
        include: [
          {
            model: Table,
            as: 'table',
            attributes: ['table_number'],
            include: [
              {
                model: Restaurant,
                as: 'restaurant',
                attributes: ['name', 'google_place_id']
              }
            ]
          }
        ]
      });
      
      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'QR-Code nicht gefunden'
        });
      }
      
      res.json({
        success: true,
        data: {
          restaurant: qrCode.table.restaurant.name,
          table: qrCode.table.table_number,
          total_scans: qrCode.scan_count,
          last_scan: qrCode.last_scan_at,
          review_monitoring: !!qrCode.table.restaurant.google_place_id
        }
      });
      
    } catch (error) {
      console.error('Stats Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Statistiken'
      });
    }
  }
}

module.exports = new TrackingController();