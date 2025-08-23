/**
 * Public Routes - KOMPLETT
 * Speichern als: backend/src/routes/public/index.js
 */

const express = require('express');
const router = express.Router();
const { Table, Restaurant } = require('../../models');
const { v4: uuidv4 } = require('uuid');

// Review Monitor Service (optional)
let reviewMonitor = null;
try {
  reviewMonitor = require('../../services/review-monitor.service');
  console.log('✅ Review Monitor Service geladen');
} catch (error) {
  console.log('⚠️ Review Monitor Service nicht gefunden');
}

// Scan Notification Service (optional)
let scanNotificationService = null;
try {
  scanNotificationService = require('../../services/scan-notification.service');
  console.log('✅ Scan Notification Service geladen');
} catch (error) {
  console.log('⚠️ Scan Notification Service nicht gefunden');
}

// ============================
// TEST ROUTE
// ============================
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Public Routes funktionieren!',
    timestamp: new Date().toISOString()
  });
});

// ============================
// QR CODE TRACKING
// ============================
router.get('/track/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log(`📱 QR-Code Scan: Token ${token}`);
    
    // Tisch anhand des Tokens finden
    const table = await Table.findOne({
      where: { tracking_token: token },
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }]
    });

    if (!table) {
      console.log('❌ Ungültiger QR-Code Token:', token);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Ungültiger QR-Code</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error {
              text-align: center;
              padding: 40px;
              background: white;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            h1 { color: #e74c3c; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>❌ Ungültiger QR-Code</h1>
            <p>Dieser QR-Code ist nicht mehr gültig.</p>
            <p>Bitte wenden Sie sich an das Personal.</p>
          </div>
        </body>
        </html>
      `);
    }

    if (!table.restaurant || !table.restaurant.is_active) {
      console.log('❌ Restaurant inaktiv für Tisch:', table.table_number);
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Restaurant nicht verfügbar</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error {
              text-align: center;
              padding: 40px;
              background: white;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            h1 { color: #e74c3c; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>⚠️ Restaurant nicht verfügbar</h1>
            <p>Dieser Service ist momentan nicht verfügbar.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Scan zählen
    await table.increment('scan_count');
    
    console.log(`✅ Scan ${table.scan_count + 1} für Tisch ${table.table_number}`);
    console.log(`📱 Scan getrackt für Restaurant ${table.restaurant.id}, Tisch ${table.table_number}`);
    
    // Optional: Benachrichtigung über neuen Scan
    if (scanNotificationService && scanNotificationService.notifyScan) {
      scanNotificationService.notifyScan(table.restaurant, table);
    }
    
    // Optional: Review-Check nach Scan planen
    if (reviewMonitor && reviewMonitor.checkForNewReviewAfterScan) {
      reviewMonitor.checkForNewReviewAfterScan(table.restaurant, 2); // Nach 2 Minuten prüfen
    }
    
    // Google Review URL oder Standard-URL
    const reviewUrl = table.restaurant.google_review_url || 
                     `https://www.google.com/search?q=${encodeURIComponent(table.restaurant.name)}+bewertung`;
    
    console.log(`🔄 Weiterleitung zu: ${reviewUrl}`);
    
    // HTML mit automatischer Weiterleitung
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="2;url=${reviewUrl}">
        <title>Weiterleitung zu Google Bewertungen</title>
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
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 30px rgba(0,0,0,0.2);
            max-width: 400px;
          }
          h1 { 
            color: #667eea; 
            margin-bottom: 20px;
          }
          p { 
            color: #666; 
            margin: 15px 0;
          }
          .restaurant-name {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin: 20px 0;
          }
          .table-info {
            background: #f0f0f0;
            padding: 10px;
            border-radius: 5px;
            margin: 20px 0;
          }
          .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✨ Vielen Dank!</h1>
            <div class="restaurant-name">${table.restaurant.name}</div>
            <div class="table-info">Tisch ${table.table_number}</div>
            <p>Sie werden zu Google Bewertungen weitergeleitet...</p>
            <p>
              <span>Bitte warten</span>
              <span class="loading"></span>
            </p>
            <p style="font-size: 14px; color: #999; margin-top: 30px;">
              Falls die Weiterleitung nicht funktioniert,<br>
              <a href="${reviewUrl}" style="color: #667eea;">klicken Sie hier</a>
            </p>
          </div>
        </body>
        </html>
    `);

  } catch (error) {
    console.error('❌ Tracking Fehler:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Fehler</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .error {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          h1 { color: #e74c3c; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>❌ Ein Fehler ist aufgetreten</h1>
          <p>Bitte versuchen Sie es später erneut.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// ============================
// PUBLIC RESTAURANT INFO
// ============================
router.get('/restaurant/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const restaurant = await Restaurant.findOne({
      where: { 
        slug,
        is_active: true
      },
      attributes: ['id', 'name', 'slug', 'description', 'address', 'phone', 'website', 'opening_hours']
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: restaurant
    });

  } catch (error) {
    console.error('Get Restaurant Info Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Restaurant-Informationen'
    });
  }
});

// ============================
// 404 HANDLER
// ============================
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Public Route nicht gefunden',
    path: req.originalUrl
  });
});

console.log('✅ Public Routes Modul geladen');
module.exports = router;