const express = require('express');
const router = express.Router();
const { Table, Restaurant } = require('../models');
const reviewMonitor = require('../services/review-monitor.service');

// QR-Code Scan - NUR Tracking, KEINE E-Mail!
router.get('/qr/:tableId', async (req, res) => {
  try {
    console.log(`📱 QR-Code Scan: Table ID ${req.params.tableId}`);
    
    const table = await Table.findByPk(req.params.tableId, {
      include: [Restaurant]
    });

    // === Validierungen ===
    if (!table) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR-Code ungültig</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
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
              box-shadow: 0 10px 30px rgba(0,0,0,0.3); 
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #dc3545; }
            .icon { font-size: 60px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">❌</div>
            <h1>QR-Code ungültig</h1>
            <p>Dieser QR-Code existiert nicht mehr.</p>
          </div>
        </body>
        </html>
      `);
    }

    if (!table.is_active || !table.Restaurant?.is_active) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Service nicht verfügbar</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              background: linear-gradient(135deg, #FA8BFF 0%, #2BD2FF 52%, #2BFF88 90%); 
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 10px; 
              box-shadow: 0 10px 30px rgba(0,0,0,0.3); 
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #dc3545; }
            .icon { font-size: 60px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">🚫</div>
            <h1>Service nicht verfügbar</h1>
            <p>Der QR-Code Service ist momentan deaktiviert.</p>
          </div>
        </body>
        </html>
      `);
    }

    if (!table.Restaurant.google_business_url) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Konfiguration fehlt</title>
        </head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial;">
            <h1>⚙️ Konfiguration fehlt</h1>
            <p>Google Business URL nicht eingerichtet.</p>
          </div>
        </body>
        </html>
      `);
    }

    // === Scan Count erhöhen ===
    table.scan_count = (table.scan_count || 0) + 1;
    await table.save();
    console.log(`✅ Scan ${table.scan_count} für Tisch ${table.table_number}`);

    // === WICHTIG: NUR Tracking, KEINE E-Mail! ===
    if (process.env.GOOGLE_PLACES_API_KEY && table.Restaurant.google_place_id) {
      // MIT Google API: Tracking für spätere Review-Prüfung
      console.log('🔍 Scan getrackt für Review-Monitoring');
      reviewMonitor.trackScan(table.restaurant_id, table.id);
      
      // KEINE E-Mail hier! E-Mail kommt NUR wenn Review erkannt wird!
    } else {
      console.log('⚠️ Google API nicht konfiguriert - keine Review-Erkennung möglich');
    }

    // === Weiterleitung zu Google Reviews ===
    console.log(`🔄 Weiterleitung zu: ${table.Restaurant.google_business_url}`);
    res.redirect(table.Restaurant.google_business_url);
    
  } catch (error) {
    console.error('❌ QR Scan Error:', error);
    res.status(500).send('Ein Fehler ist aufgetreten');
  }
});

// Test-Endpoint für E-Mail
router.get('/test-email/:email', async (req, res) => {
  const emailService = require('../services/email.service');
  const email = req.params.email;
  console.log(`📧 Test-E-Mail an ${email}`);
  
  const sent = await emailService.sendTestEmail(email);
  
  if (sent) {
    res.json({ success: true, message: `Test-E-Mail gesendet an ${email}` });
  } else {
    res.status(500).json({ success: false, message: 'E-Mail konnte nicht gesendet werden' });
  }
});

// Health Check
router.get('/health', (req, res) => {
  const reviewMonitor = require('../services/review-monitor.service');
  res.json({ 
    status: 'OK',
    timestamp: new Date(),
    services: {
      googleAPI: process.env.GOOGLE_PLACES_API_KEY ? 'configured' : 'not configured',
      reviewMonitor: reviewMonitor.isRunning ? 'running' : 'stopped'
    }
  });
});

module.exports = router;