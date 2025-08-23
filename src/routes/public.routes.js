/**
 * Public Routes - QR-Code Tracking OHNE E-Mail
 * Speichern als: backend/src/routes/public.routes.js
 */

const express = require('express');
const router = express.Router();
const { QRCode, Table, Restaurant, Scan } = require('../models');
const { Op } = require('sequelize');

/**
 * QR-Code Scan Handler - NUR Tracking, KEINE E-Mail!
 */
router.get('/qr/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log(`📱 QR-Code gescannt: ${token}`);
    
    // QR-Code mit Details laden
    const qrCode = await QRCode.findOne({
      where: { 
        token: token,
        is_active: true 
      },
      include: [
        {
          model: Table,
          as: 'table',
          required: true
        },
        {
          model: Restaurant,
          as: 'restaurant',
          required: true,
          where: {
            is_active: true
          }
        }
      ]
    });

    if (!qrCode) {
      console.log('❌ QR-Code nicht gefunden oder inaktiv');
      return res.redirect('https://www.google.com/maps/search/restaurants+near+me');
    }

    // Scan in Datenbank speichern (für spätere Zuordnung)
    const scan = await Scan.create({
      qr_code_id: qrCode.id,
      table_id: qrCode.table_id,
      restaurant_id: qrCode.restaurant_id,
      ip_address: req.ip || req.connection.remoteAddress || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      device_info: {
        browser: detectBrowser(req.get('user-agent')),
        isMobile: /mobile/i.test(req.get('user-agent'))
      },
      created_at: new Date()
    });

    // QR-Code Statistiken aktualisieren
    await qrCode.increment('scan_count');
    await qrCode.update({ last_scan_at: new Date() });

    // Tisch Statistiken aktualisieren
    if (qrCode.table) {
      await qrCode.table.increment('scan_count');
    }

    console.log(`✅ Scan getrackt für ${qrCode.restaurant.name} - Tisch ${qrCode.table.table_number}`);
    console.log(`   Scan #${qrCode.scan_count + 1}`);
    console.log(`   KEINE E-Mail gesendet (nur bei echter Bewertung)`);
    
    // Redirect URL bestimmen
    const redirectUrl = qrCode.redirect_url || 
                       qrCode.restaurant.google_business_url ||
                       `https://www.google.com/search?q=${encodeURIComponent(qrCode.restaurant.name)}+reviews`;

    console.log(`   Weiterleitung zu: ${redirectUrl}`);
    
    // Weiterleitung zu Google Reviews
    return res.redirect(redirectUrl);

  } catch (error) {
    console.error('❌ QR-Code Scan Fehler:', error);
    return res.redirect('https://www.google.com/maps/search/restaurants+near+me');
  }
});

/**
 * Health Check Endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    services: {
      email: process.env.SMTP_USER ? 'configured' : 'not configured',
      googleAPI: process.env.GOOGLE_PLACES_API_KEY ? 'configured' : 'not configured'
    }
  });
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
 * Statistiken Endpoint (öffentlich)
 */
router.get('/stats/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const restaurant = await Restaurant.findByPk(restaurantId, {
      attributes: ['name', 'last_review_count'],
      include: [{
        model: Table,
        as: 'tables',
        attributes: ['table_number', 'scan_count']
      }]
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant nicht gefunden' });
    }

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
      restaurant: restaurant.name,
      totalReviews: restaurant.last_review_count || 0,
      scansToday: recentScans,
      tables: restaurant.tables.map(t => ({
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