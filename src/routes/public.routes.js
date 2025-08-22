const express = require('express');
const router = express.Router();
const { Table, Restaurant } = require('../models');
const scanNotificationService = require('../services/scan-notification.service');

// QR-Code Scan - OHNE Google API
router.get('/qr/:tableId', async (req, res) => {
  try {
    const table = await Table.findByPk(req.params.tableId, {
      include: [Restaurant]
    });

    // Prüfung ob Tisch existiert
    if (!table) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR-Code nicht gefunden</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background-color: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h2 { color: #d32f2f; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>❌ QR-Code nicht gefunden</h2>
            <p>Dieser QR-Code existiert nicht mehr.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Prüfung ob Tisch aktiv ist
    if (!table.is_active) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR-Code deaktiviert</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background-color: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h2 { color: #f57c00; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>⚠️ QR-Code deaktiviert</h2>
            <p>Dieser QR-Code ist derzeit nicht aktiv.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Prüfung ob Restaurant aktiv ist
    if (!table.Restaurant || !table.Restaurant.is_active) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Service nicht verfügbar</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background-color: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h2 { color: #f57c00; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>🚫 Service nicht verfügbar</h2>
            <p>Das Restaurant nutzt diesen Service derzeit nicht.</p>
            <p style="font-size: 14px; margin-top: 20px;">Bitte kontaktieren Sie das Restaurant-Personal.</p>
          </div>
        </body>
        </html>
      `);
    }

    // E-Mail-Benachrichtigung senden (OHNE Google API)
    await scanNotificationService.handleQRScan(table.id);

    // Weiterleitung zu Google Reviews
    if (table.Restaurant.google_business_url) {
      console.log(`✅ Weiterleitung: Tisch ${table.table_number} -> ${table.Restaurant.google_business_url}`);
      res.redirect(table.Restaurant.google_business_url);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Konfiguration fehlt</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background-color: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h2 { color: #1976d2; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>⚙️ Konfiguration fehlt</h2>
            <p>Die Google Business URL ist noch nicht eingerichtet.</p>
            <p style="font-size: 14px; margin-top: 20px;">Bitte informieren Sie das Restaurant-Personal.</p>
          </div>
        </body>
        </html>
      `);
    }
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
          body { font-family: Arial; text-align: center; padding: 50px; background-color: #f5f5f5; }
          .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
          h2 { color: #d32f2f; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>❌ Ein Fehler ist aufgetreten</h2>
          <p>Bitte versuchen Sie es später erneut.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Health Check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    emailConfigured: !!process.env.SMTP_USER && !!process.env.SMTP_PASS
  });
});

// Test E-Mail Route (nur für Admins)
router.post('/test-email', async (req, res) => {
  try {
    const { email, adminKey } = req.body;
    
    // Sicherheit: Nur mit Admin-Key
    if (adminKey !== process.env.JWT_SECRET) {
      return res.status(403).json({ message: 'Nicht autorisiert' });
    }
    
    const emailService = require('../services/email.service');
    await emailService.sendTestEmail(email);
    
    res.json({ message: 'Test-E-Mail gesendet', success: true });
  } catch (error) {
    console.error('Test-E-Mail Error:', error);
    res.status(500).json({ message: 'E-Mail konnte nicht gesendet werden', error: error.message });
  }
});

module.exports = router;