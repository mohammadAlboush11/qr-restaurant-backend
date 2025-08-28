/**
 * Public Routes Index
 * Speichern als: backend/src/routes/public/index.js
 */

const express = require('express');
const router = express.Router();
const { Table, Restaurant, QRCode, Scan } = require('../../models');
const emailService = require('../../services/email.service');

// QR Code Scan Handler
router.get('/scan/:code', async (req, res) => {
  try {
    const { code } = req.params;
    console.log(`📱 QR-Code Scan: ${code}`);

    // Find QR code
    const qrCode = await QRCode.findOne({
      where: { 
        code: code,
        is_active: true 
      },
      include: [{
        model: Table,
        as: 'table',
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      }]
    });

    if (!qrCode) {
      console.log(`❌ QR-Code nicht gefunden oder inaktiv: ${code}`);
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>❌ QR-Code ungültig</h1>
            <p>Dieser QR-Code ist nicht mehr aktiv oder existiert nicht.</p>
            <p>Bitte wenden Sie sich an das Personal.</p>
          </body>
        </html>
      `);
    }

    const table = qrCode.table;
    const restaurant = table?.restaurant;

    if (!restaurant || !restaurant.is_active) {
      console.log(`❌ Restaurant inaktiv für QR-Code: ${code}`);
      return res.status(403).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>❌ Restaurant nicht verfügbar</h1>
            <p>Dieses Restaurant ist derzeit nicht aktiv.</p>
          </body>
        </html>
      `);
    }

    // Log scan
    await Scan.create({
      qr_code_id: qrCode.id,
      table_id: table.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    });

    // Update scan count
    await table.increment('scan_count');

    // Send email notification
    if (emailService.isConfigured() && restaurant.notification_email) {
      await emailService.sendScanNotification(
        restaurant.notification_email,
        restaurant.name,
        table.table_number,
        new Date()
      );
      console.log(`📧 E-Mail gesendet an ${restaurant.notification_email}`);
    }

    // Redirect to Google Business
    if (restaurant.google_business_url) {
      console.log(`✅ Weiterleitung zu: ${restaurant.google_business_url}`);
      return res.redirect(restaurant.google_business_url);
    } else {
      return res.status(200).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>✅ QR-Code gescannt</h1>
            <p>Restaurant: ${restaurant.name}</p>
            <p>Tisch: ${table.table_number}</p>
            <p>Keine Google Business URL konfiguriert.</p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Scan Error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Fehler</h1>
          <p>Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.</p>
        </body>
      </html>
    `);
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'public',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;