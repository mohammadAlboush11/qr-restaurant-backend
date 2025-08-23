/**
 * Public Routes - QR-Code Tracking KORRIGIERT
 * Speichern als: backend/src/routes/public.routes.js
 */

const express = require('express');
const router = express.Router();
const { QRCode, Table, Restaurant, Scan } = require('../models');
const { Op } = require('sequelize');

/**
 * QR-Code Scan Handler - NUR Tracking, KEINE E-Mail bei Scan!
 */
router.get('/qr/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log(`📱 QR-Code Scan empfangen: ${token}`);
    
    // QR-Code suchen - VEREINFACHT
    const qrCode = await QRCode.findOne({
      where: { 
        token: token
      }
    });

    if (!qrCode) {
      console.log(`❌ QR-Code nicht gefunden: ${token}`);
      // Bei Fehler zu Chilln Beef weiterleiten (als Fallback)
      return res.redirect('https://www.google.com/search?q=Chilln+Beef+Osnabrück+Bewertung');
    }

    // Restaurant und Tisch separat laden
    const restaurant = await Restaurant.findByPk(qrCode.restaurant_id);
    const table = await Table.findByPk(qrCode.table_id);

    if (!restaurant) {
      console.log('❌ Restaurant nicht gefunden');
      return res.redirect('https://www.google.com/search?q=Chilln+Beef+Osnabrück+Bewertung');
    }

    // Prüfen ob Restaurant aktiv ist
    if (!restaurant.is_active) {
      console.log('⚠️ Restaurant ist deaktiviert');
      return res.redirect('https://www.google.com/search?q=Restaurant+Bewertungen');
    }

    // Scan in Datenbank speichern
    const scan = await Scan.create({
      qr_code_id: qrCode.id,
      table_id: qrCode.table_id,
      restaurant_id: qrCode.restaurant_id,
      ip_address: req.ip || req.connection.remoteAddress || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      device_info: {
        browser: detectBrowser(req.get('user-agent')),
        isMobile: /mobile/i.test(req.get('user-agent'))
      }
    });

    // QR-Code Statistiken aktualisieren
    await qrCode.increment('scan_count');
    await qrCode.update({ last_scan_at: new Date() });

    // Tisch Statistiken aktualisieren
    if (table) {
      await table.increment('scan_count');
      console.log(`✅ Scan getrackt für ${restaurant.name} - Tisch ${table.table_number}`);
    } else {
      console.log(`✅ Scan getrackt für ${restaurant.name} - Tisch unbekannt`);
    }

    console.log(`   Scan #${qrCode.scan_count + 1}`);
    console.log(`   KEINE E-Mail bei Scan (nur bei echter Google-Bewertung)`);
    
    // Google Reviews URL bestimmen - WICHTIG: Die richtige URL verwenden!
    let redirectUrl = restaurant.google_business_url;
    
    if (!redirectUrl || redirectUrl === '') {
      // Fallback: Google Suche nach Restaurant
      const searchQuery = encodeURIComponent(`${restaurant.name} ${restaurant.city || ''} Bewertung`);
      redirectUrl = `https://www.google.com/search?q=${searchQuery}`;
      console.log('⚠️ Keine Google Business URL, verwende Suche:', redirectUrl);
    } else {
      console.log(`✅ Weiterleitung zu: ${redirectUrl}`);
    }
    
    // Weiterleitung zu Google Reviews
    return res.redirect(redirectUrl);

  } catch (error) {
    console.error('❌ QR-Code Scan Fehler:', error);
    console.error('Details:', error.message);
    // Bei Fehler zu einer sinnvollen Seite weiterleiten
    return res.redirect('https://www.google.com/search?q=Chilln+Beef+Osnabrück+Bewertung');
  }
});

/**
 * Alternative Route mit short_code
 */
router.get('/r/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    
    console.log(`📱 QR-Code Scan via ShortCode: ${shortCode}`);
    
    const qrCode = await QRCode.findOne({
      where: { 
        short_code: shortCode
      }
    });

    if (!qrCode) {
      console.log(`❌ ShortCode nicht gefunden: ${shortCode}`);
      return res.redirect('https://www.google.com/search?q=Restaurant+Bewertungen');
    }

    // Weiterleitung zum Token-Handler
    return res.redirect(`/api/public/qr/${qrCode.token}`);
    
  } catch (error) {
    console.error('❌ ShortCode Error:', error);
    return res.redirect('https://www.google.com/search?q=Restaurant+Bewertungen');
  }
});

/**
 * Health Check Endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    version: '1.0.0',
    services: {
      database: 'connected',
      email: process.env.SMTP_USER ? 'configured' : 'not configured',
      googleAPI: process.env.GOOGLE_PLACES_API_KEY ? 'configured' : 'NOT CONFIGURED - NO REVIEW DETECTION!'
    }
  });
});

/**
 * Debug Endpoint - Zeigt alle QR-Codes (NUR für Testing!)
 */
router.get('/debug/qrcodes', async (req, res) => {
  try {
    // Sicherheitscheck - nur in Development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }

    const qrCodes = await QRCode.findAll({
      include: [
        { model: Table, as: 'table' },
        { model: Restaurant, as: 'restaurant' }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      count: qrCodes.length,
      qrCodes: qrCodes.map(qr => ({
        id: qr.id,
        token: qr.token,
        short_code: qr.short_code,
        restaurant: qr.restaurant?.name,
        table: qr.table?.table_number,
        scan_count: qr.scan_count,
        is_active: qr.is_active,
        test_url: `${req.protocol}://${req.get('host')}/api/public/qr/${qr.token}`
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test E-Mail Endpoint (nur für Debugging)
 */
router.post('/test-email', async (req, res) => {
  try {
    const { email, adminKey } = req.body;
    
    // Sicherheitscheck
    if (adminKey !== process.env.JWT_SECRET) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const emailService = require('../services/email.service');
    const success = await emailService.sendTestEmail(email);
    
    res.json({ 
      success,
      message: success ? 'Test-E-Mail gesendet' : 'E-Mail-Versand fehlgeschlagen'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Statistiken Endpoint
 */
router.get('/stats/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant nicht gefunden' });
    }

    const tables = await Table.findAll({
      where: { restaurant_id: restaurantId },
      attributes: ['id', 'table_number', 'scan_count']
    });

    // Scans der letzten 24 Stunden
    const recentScans = await Scan.count({
      where: {
        restaurant_id: restaurantId,
        created_at: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    res.json({
      restaurant: {
        name: restaurant.name,
        totalReviews: restaurant.last_review_count || 0,
        googleUrl: restaurant.google_business_url
      },
      scansToday: recentScans,
      tables: tables.map(t => ({
        number: t.table_number,
        scans: t.scan_count || 0
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper Funktion
function detectBrowser(userAgent) {
  if (!userAgent) return 'unknown';
  
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  
  return 'other';
}

module.exports = router;