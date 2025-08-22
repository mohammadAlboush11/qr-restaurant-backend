const express = require('express');
const router = express.Router();
const { Table, Restaurant } = require('../models');
const emailService = require('../services/email.service');

// Spam-Schutz: Verhindert zu viele E-Mails
const recentScans = new Map();

// QR-Code Scan Tracking - KRITISCH: Prüft Aktivierung und sendet E-Mail!
router.get('/qr/:tableId', async (req, res) => {
  try {
    console.log(`📱 QR-Code Scan: Table ID ${req.params.tableId}`);
    
    const table = await Table.findByPk(req.params.tableId, {
      include: [Restaurant]
    });

    // === SCHRITT 1: Existenz prüfen ===
    if (!table) {
      console.log(`❌ Tisch ${req.params.tableId} existiert nicht`);
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
            h1 { color: #dc3545; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; }
            .icon { font-size: 60px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">❌</div>
            <h1>QR-Code ungültig</h1>
            <p>Dieser QR-Code existiert nicht mehr oder wurde gelöscht.</p>
            <p>Bitte wenden Sie sich an das Personal.</p>
          </div>
        </body>
        </html>
      `);
    }

    // === SCHRITT 2: Tisch-Aktivierung prüfen ===
    if (!table.is_active) {
      console.log(`⚠️ Tisch ${table.table_number} ist deaktiviert`);
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR-Code deaktiviert</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 10px; 
              box-shadow: 0 10px 30px rgba(0,0,0,0.3); 
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #ffc107; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; }
            .icon { font-size: 60px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">⚠️</div>
            <h1>QR-Code deaktiviert</h1>
            <p>Dieser QR-Code ist momentan nicht aktiv.</p>
            <p>Bitte wenden Sie sich an das Personal.</p>
          </div>
        </body>
        </html>
      `);
    }

    // === SCHRITT 3: Restaurant-Aktivierung prüfen (KRITISCH!) ===
    if (!table.Restaurant || !table.Restaurant.is_active) {
      console.log(`🚫 Restaurant ${table.Restaurant?.name} ist deaktiviert - ZAHLUNG FEHLT!`);
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
            h1 { color: #dc3545; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; margin: 15px 0; }
            .icon { font-size: 60px; margin-bottom: 20px; }
            .restaurant-name { 
              font-weight: bold; 
              color: #333; 
              font-size: 18px; 
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">🚫</div>
            <h1>Service nicht verfügbar</h1>
            <div class="restaurant-name">${table.Restaurant?.name || 'Restaurant'}</div>
            <p>Der QR-Code Service ist für dieses Restaurant momentan nicht verfügbar.</p>
            <p>Das Restaurant nutzt diesen Service derzeit nicht.</p>
            <p style="font-size: 14px; color: #999; margin-top: 30px;">
              Kontakt: ${table.Restaurant?.email || 'Nicht verfügbar'}
            </p>
          </div>
        </body>
        </html>
      `);
    }

    // === SCHRITT 4: Google URL prüfen ===
    if (!table.Restaurant.google_business_url) {
      console.log(`⚙️ Restaurant ${table.Restaurant.name} hat keine Google URL konfiguriert`);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Konfiguration fehlt</title>
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
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 10px; 
              box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #6c757d; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; }
            .icon { font-size: 60px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">⚙️</div>
            <h1>Konfiguration fehlt</h1>
            <p>Die Google Business URL ist noch nicht eingerichtet.</p>
            <p>Bitte informieren Sie das Restaurant-Management.</p>
          </div>
        </body>
        </html>
      `);
    }

    // === SCHRITT 5: Scan Count erhöhen ===
    table.scan_count = (table.scan_count || 0) + 1;
    await table.save();
    console.log(`✅ Scan Count erhöht: Tisch ${table.table_number} = ${table.scan_count} Scans`);

    // === SCHRITT 6: E-Mail senden (mit Spam-Schutz) ===
    const scanKey = `${table.restaurant_id}_${table.id}`;
    const lastScan = recentScans.get(scanKey);
    const now = Date.now();
    
    // Nur eine E-Mail alle 5 Minuten pro Tisch
    if (!lastScan || (now - lastScan) > 5 * 60 * 1000) {
      console.log(`📧 Sende E-Mail-Benachrichtigung für Tisch ${table.table_number}...`);
      
      const emailSent = await emailService.sendReviewNotification(
        table.Restaurant,
        table,
        {
          scanTime: new Date(),
          totalScans: table.scan_count
        }
      );
      
      if (emailSent) {
        recentScans.set(scanKey, now);
        console.log(`✅ E-Mail gesendet an ${table.Restaurant.email}`);
      } else {
        console.log(`❌ E-Mail konnte nicht gesendet werden`);
      }
    } else {
      const minutesLeft = Math.ceil(((lastScan + 5 * 60 * 1000) - now) / 60000);
      console.log(`⏰ Spam-Schutz: Nächste E-Mail in ${minutesLeft} Minuten möglich`);
    }

    // === SCHRITT 7: Weiterleitung zu Google Reviews ===
    console.log(`🔄 Weiterleitung zu Google Reviews: ${table.Restaurant.google_business_url}`);
    
    // Mit Tracking-Parametern
    const redirectUrl = `${table.Restaurant.google_business_url}${
      table.Restaurant.google_business_url.includes('?') ? '&' : '?'
    }utm_source=qr&utm_medium=table&utm_campaign=table_${table.table_number}`;
    
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('❌ QR Scan Error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fehler</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
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
            box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>😔 Ein Fehler ist aufgetreten</h1>
          <p>Bitte versuchen Sie es später erneut.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Test-Endpoint für E-Mail
router.get('/test-email/:email', async (req, res) => {
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
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    emailService: emailService.isConfigured ? 'configured' : 'not configured'
  });
});

module.exports = router;