const { QRCode, Scan, Table, Restaurant, ActivityLog } = require('../../models');
const { Op } = require('sequelize');
const emailService = require('../../services/email.service');

class TrackingController {
  // QR-Code Scan - Mit E-Mail-Benachrichtigung
  async trackScan(req, res) {
    try {
      const { code } = req.params;
      
      // IP und User Agent erfassen
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      
      console.log(`📱 QR-Code Scan: ${code} von IP: ${ipAddress}`);
      
      // QR Code mit allen Beziehungen laden
      const qrCode = await QRCode.findOne({
        where: { 
          code,
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
            <title>QR-Code ungültig</title>
            <style>
              body { 
                font-family: Arial; 
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
              }
              h1 { color: #dc3545; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ QR-Code ungültig</h1>
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
            <title>Service nicht verfügbar</title>
            <style>
              body { 
                font-family: Arial; 
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
                border: 2px solid #dc3545;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚫 Service nicht verfügbar</h1>
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
            <title>Abonnement inaktiv</title>
            <style>
              body { 
                font-family: Arial; 
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
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>⚠️ Abonnement inaktiv</h1>
              <p>Das Abonnement für dieses Restaurant ist nicht aktiv.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // Google Review URL prüfen
      if (!restaurant.google_review_url) {
        console.log(`⚠️ Keine Google Review URL für Restaurant: ${restaurant.name}`);
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Konfigurationsfehler</title>
          </head>
          <body>
            <div style="text-align: center; padding: 50px; font-family: Arial;">
              <h1>⚙️ Konfigurationsfehler</h1>
              <p>Google Review URL wurde noch nicht eingerichtet.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // Scan in Datenbank speichern
      const scan = await Scan.create({
        qr_code_id: qrCode.id,
        table_id: table.id,
        restaurant_id: restaurant.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        redirected_to: restaurant.google_review_url
      });
      
      // Scan-Zähler erhöhen
      await qrCode.increment('scan_count');
      await qrCode.update({ last_scanned_at: new Date() });
      
      await table.increment('scan_count');
      await table.update({ last_scan_at: new Date() });
      
      console.log(`✅ Scan erfasst für Tisch ${table.table_number} in Restaurant ${restaurant.name}`);
      
      // E-MAIL SENDEN - WICHTIGSTER TEIL!
      try {
        const emailSent = await emailService.sendScanNotification({
          restaurant_name: restaurant.name,
          restaurant_email: restaurant.notification_email || restaurant.email,
          table_number: table.table_number,
          table_description: table.description || '',
          scan_time: new Date().toLocaleString('de-DE'),
          ip_address: ipAddress,
          user_agent: userAgent,
          google_review_url: restaurant.google_review_url
        });
        
        if (emailSent) {
          console.log(`📧 E-Mail-Benachrichtigung gesendet an ${restaurant.notification_email || restaurant.email}`);
          
          // Activity Log
          await ActivityLog.create({
            restaurant_id: restaurant.id,
            action: 'qr_scan_email_sent',
            category: 'notification',
            severity: 'info',
            details: {
              table_number: table.table_number,
              scan_id: scan.id,
              email_to: restaurant.notification_email || restaurant.email
            }
          });
        }
      } catch (emailError) {
        console.error('❌ E-Mail-Versand fehlgeschlagen:', emailError);
        // Trotzdem weiterleiten, auch wenn E-Mail fehlschlägt
      }
      
      // Weiterleitung zu Google Reviews
      console.log(`🔄 Weiterleitung zu: ${restaurant.google_review_url}`);
      res.redirect(restaurant.google_review_url);
      
    } catch (error) {
      console.error('❌ Scan Error:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Fehler</title>
        </head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial;">
            <h1>❌ Ein Fehler ist aufgetreten</h1>
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
        where: { code },
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
          subscription_status: qrCode.table.restaurant.subscription_status
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
        where: { code },
        attributes: ['scan_count', 'last_scanned_at'],
        include: [
          {
            model: Table,
            as: 'table',
            attributes: ['table_number'],
            include: [
              {
                model: Restaurant,
                as: 'restaurant',
                attributes: ['name']
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
          last_scan: qrCode.last_scanned_at
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