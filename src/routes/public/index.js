const express = require('express');
const router = express.Router();
const { QRCode, Scan, Table, Restaurant } = require('../../models');
const { Op } = require('sequelize');
const emailService = require('../../services/email.service');

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date(),
    version: '1.0.0'
  });
});

// QR Code Scan Handler - VOLLSTÄNDIG KORRIGIERT
router.get('/scan/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const upperCode = code.toUpperCase();
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    
    console.log(`📱 QR-Code Scan: ${upperCode} from IP: ${ipAddress}`);
    
    // Find QR code with proper associations
    const qrCode = await QRCode.findOne({
      where: { 
        code: upperCode,
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

    // If QR code not found or inactive
    if (!qrCode) {
      console.log(`❌ QR-Code not found or inactive: ${upperCode}`);
      
      // Check if code exists but is inactive
      const inactiveCode = await QRCode.findOne({
        where: { code: upperCode }
      });
      
      if (inactiveCode) {
        console.log(`⚠️ QR-Code found but inactive: ${upperCode}`);
      }
      
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR-Code ungültig</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .error-box {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 400px;
              margin: 20px;
            }
            h1 { 
              color: #e53e3e; 
              margin-bottom: 10px;
              font-size: 24px;
            }
            p { 
              color: #718096; 
              line-height: 1.6;
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>⚠️ QR-Code ungültig</h1>
            <p>Dieser QR-Code ist nicht mehr aktiv oder existiert nicht.</p>
            <p>Bitte wenden Sie sich an das Personal.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Check if table and restaurant exist
    if (!qrCode.table || !qrCode.table.restaurant) {
      console.log(`❌ Table or Restaurant not found for QR-Code: ${upperCode}`);
      return res.status(404).send(`
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
              min-height: 100vh;
              background: #f5f5f5;
            }
            .error { 
              text-align: center; 
              padding: 40px;
              background: white;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #e53e3e; }
            p { color: #4a5568; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>❌ Fehler</h1>
            <p>Tisch oder Restaurant nicht gefunden.</p>
          </div>
        </body>
        </html>
      `);
    }

    const restaurant = qrCode.table.restaurant;
    const table = qrCode.table;

    // Check if restaurant is active
    if (!restaurant.is_active) {
      console.log(`⚠️ Restaurant inactive: ${restaurant.name}`);
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Restaurant nicht verfügbar</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f7fafc;
            }
            .info-box {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 400px;
              margin: 20px;
            }
            h1 { color: #e53e3e; }
            p { color: #4a5568; }
          </style>
        </head>
        <body>
          <div class="info-box">
            <h1>⚠️ Restaurant nicht verfügbar</h1>
            <p>${restaurant.name} ist derzeit nicht aktiv.</p>
          </div>
        </body>
        </html>
      `);
    }

    // WICHTIG: URL-Konstruktion für Google Reviews
    let redirectUrl = '';
    
    // Priorität 1: Direkte Google Review URL
    if (restaurant.google_review_url) {
      redirectUrl = restaurant.google_review_url;
      
      // Stelle sicher, dass die URL gültig ist
      if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
        redirectUrl = 'https://' + redirectUrl;
      }
    } 
    // Priorität 2: Google Business URL (falls vorhanden)
    else if (restaurant.google_business_url) {
      redirectUrl = restaurant.google_business_url;
      
      if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
        redirectUrl = 'https://' + redirectUrl;
      }
    }
    // Priorität 3: Google Maps Place ID (falls vorhanden)
    else if (restaurant.google_place_id) {
      redirectUrl = `https://search.google.com/local/writereview?placeid=${restaurant.google_place_id}`;
    }
    // Priorität 4: Generische Google-Suche nach Bewertungen
    else {
      const searchQuery = encodeURIComponent(
        `${restaurant.name} ${restaurant.address || restaurant.city || ''} Bewertung schreiben`
      );
      redirectUrl = `https://www.google.com/search?q=${searchQuery}`;
    }

    console.log(`🔄 Redirecting to: ${redirectUrl}`);

    // Log scan BEVOR der Weiterleitung
    try {
      await Scan.create({
        qr_code_id: qrCode.id,
        table_id: table.id,
        restaurant_id: restaurant.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        redirected_to: redirectUrl
      });

      // Update scan counters
      await qrCode.increment('scan_count');
      await qrCode.update({ last_scanned_at: new Date() });
      await table.increment('scan_count');
      await table.update({ last_scan_at: new Date() });

      console.log(`✅ Scan #${qrCode.scan_count + 1} for ${restaurant.name} - Table ${table.table_number}`);

      // Send email notification if configured
      if (emailService && emailService.isConfigured) {
        // Email senden aber nicht auf Response warten
        emailService.sendScanNotification({
          restaurant_name: restaurant.name,
          restaurant_email: restaurant.notification_email || restaurant.email,
          table_number: table.table_number,
          table_description: table.description || '',
          scan_time: new Date().toLocaleString('de-DE'),
          ip_address: ipAddress,
          user_agent: userAgent,
          google_review_url: redirectUrl
        }).catch(emailError => {
          console.error('Email error:', emailError.message);
        });
      }
    } catch (logError) {
      console.error('Error logging scan:', logError);
      // Weitermachen auch wenn Logging fehlschlägt
    }

    // KRITISCH: Explizite 302 Weiterleitung mit vollständiger URL
    return res.redirect(302, redirectUrl);

  } catch (error) {
    console.error('Scan Error:', error);
    return res.status(500).send(`
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
            min-height: 100vh;
            margin: 0;
          }
          .error { 
            text-align: center; 
            padding: 40px;
            background: #fff5f5;
            border: 1px solid #feb2b2;
            border-radius: 8px;
          }
          h1 { color: #c53030; }
          p { color: #4a5568; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>❌ Fehler</h1>
          <p>Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// API endpoint for code validation
router.post('/validate-code', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'QR-Code erforderlich'
      });
    }

    const upperCode = code.toUpperCase();
    console.log(`Validating code: ${upperCode}`);

    // Suche QR-Code mit Associations
    const qrCode = await QRCode.findOne({
      where: { 
        code: upperCode,
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

    if (!qrCode || !qrCode.table || !qrCode.table.restaurant) {
      console.log(`Code not found or invalid: ${upperCode}`);
      return res.json({
        success: true,
        data: {
          valid: false,
          restaurant_name: null,
          table_number: null
        }
      });
    }

    const isValid = qrCode.table.restaurant.is_active;

    console.log(`Code ${upperCode} validation result: ${isValid}`);

    res.json({
      success: true,
      data: {
        valid: isValid,
        restaurant_name: isValid ? qrCode.table.restaurant.name : null,
        table_number: isValid ? qrCode.table.table_number : null,
        subscription_status: isValid ? qrCode.table.restaurant.subscription_status : null
      }
    });

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validierung fehlgeschlagen'
    });
  }
});

// Get public statistics
router.get('/stats/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const upperCode = code.toUpperCase();
    
    console.log(`Getting stats for code: ${upperCode}`);
    
    // Suche QR-Code mit Associations
    const qrCode = await QRCode.findOne({
      where: { code: upperCode },
      attributes: ['id', 'table_id', 'scan_count', 'last_scanned_at'],
      include: [{
        model: Table,
        as: 'table',
        attributes: ['table_number'],
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: ['name']
        }]
      }]
    });

    if (!qrCode || !qrCode.table || !qrCode.table.restaurant) {
      console.log(`Code not found for stats: ${upperCode}`);
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
        total_scans: qrCode.scan_count || 0,
        last_scan: qrCode.last_scanned_at
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Statistiken'
    });
  }
});

module.exports = router;