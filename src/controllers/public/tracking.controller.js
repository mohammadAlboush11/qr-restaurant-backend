// backend/src/controllers/public/tracking.controller.js
// FINALE VERSION - ABSOLUT KEINE SOFORT-E-MAILS

const { QRCode, Scan, Table, Restaurant } = require('../../models');
const { Op } = require('sequelize');

// KEIN IMPORT VON EMAIL SERVICE!!!
// GELÖSCHT: const emailService = require('../../services/email.service');

class TrackingController {
  async trackScan(req, res) {
    try {
      const { code } = req.params;
      
      if (!code || code === 'null' || code === 'undefined') {
        console.log('❌ Kein gültiger QR-Code angegeben');
        return res.status(400).send('Ungültiger QR-Code');
      }
      
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      
      console.log(`📱 QR-Code Scan: ${code} von IP: ${ipAddress}`);
      
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
      
      if (!qrCode) {
        console.log(`❌ QR-Code nicht gefunden: ${code}`);
        return res.status(404).send('QR-Code nicht gefunden');
      }
      
      const restaurant = qrCode.table.restaurant;
      const table = qrCode.table;
      
      if (!restaurant.is_active) {
        console.log(`⚠️ Restaurant inaktiv: ${restaurant.name}`);
        return res.status(403).send('Restaurant nicht aktiv');
      }
      
      // Google Review URL konstruieren
      let redirectUrl = '';
      
      if (restaurant.google_review_url) {
        redirectUrl = restaurant.google_review_url;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = 'https://' + redirectUrl;
        }
      } else if (restaurant.google_place_id) {
        redirectUrl = `https://search.google.com/local/writereview?placeid=${restaurant.google_place_id}`;
      } else if (restaurant.google_business_url) {
        redirectUrl = restaurant.google_business_url;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = 'https://' + redirectUrl;
        }
      } else {
        const searchQuery = encodeURIComponent(`${restaurant.name} ${restaurant.address || ''} Bewertung`);
        redirectUrl = `https://www.google.com/search?q=${searchQuery}`;
      }
      
      console.log(`🔄 Redirecting to: ${redirectUrl}`);
      
      // Scan speichern
      const scan = await Scan.create({
        qr_code_id: qrCode.id,
        table_id: table.id,
        restaurant_id: restaurant.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        redirected_to: redirectUrl
      });
      
      // Counter erhöhen
      await qrCode.increment('scan_count');
      await qrCode.update({ last_scan_at: new Date() });
      await table.increment('scan_count');
      await table.update({ last_scan_at: new Date() });
      
      console.log(`✅ Scan #${qrCode.scan_count + 1} für ${restaurant.name} - Tisch ${table.table_number}`);
      
      // KEINE E-MAIL HIER!!!
      // NUR Review Monitor registrieren falls vorhanden
      try {
        const reviewMonitor = require('../../services/review-monitor.service');
        if (reviewMonitor && reviewMonitor.registerScan) {
          reviewMonitor.registerScan({
            scan_id: scan.id,
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            table_number: table.table_number,
            google_place_id: restaurant.google_place_id
          });
          console.log(`📝 Scan für Review-Monitoring registriert`);
        }
      } catch (e) {
        // Review Monitor optional
      }
      
      // DIREKTE WEITERLEITUNG - KEINE E-MAIL!
      console.log(`✅ Weiterleitung OHNE E-Mail`);
      res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('❌ Scan Error:', error);
      res.status(500).send('Fehler beim Scan');
    }
  }
  
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
          last_scan: qrCode.last_scan_at
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