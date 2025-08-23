/**
 * QR Code Controller - MIT OPTIONALEM PDFKIT
 * Speichern als: backend/src/controllers/restaurant/qrcode.controller.js
 */

const QRCode = require('qrcode');
const { Table, Restaurant } = require('../../models');
const path = require('path');
const fs = require('fs').promises;

// PDFKit optional laden
let PDFDocument;
try {
  PDFDocument = require('pdfkit');
  console.log('✅ PDFKit geladen - PDF Export verfügbar');
} catch (error) {
  console.log('⚠️ PDFKit nicht verfügbar - PDF Export deaktiviert');
  PDFDocument = null;
}

class QRCodeController {
  // QR-Code für einen Tisch generieren
  async generateQRCode(req, res) {
    try {
      const { tableId } = req.params;
      const restaurantId = req.user.restaurant_id;

      const table = await Table.findOne({
        where: { 
          id: tableId,
          restaurant_id: restaurantId
        },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Tisch nicht gefunden'
        });
      }

      // QR-Code Daten
      const trackingUrl = `${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}/api/public/track/${table.tracking_token}`;
      
      // QR-Code als Data URL generieren
      const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // QR-Code in Datenbank speichern
      await table.update({ 
        qr_code: qrCodeDataUrl,
        qr_code_url: trackingUrl
      });

      res.json({
        success: true,
        data: {
          table_id: table.id,
          table_number: table.table_number,
          qr_code: qrCodeDataUrl,
          tracking_url: trackingUrl
        }
      });

    } catch (error) {
      console.error('QR-Code Generierung Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Generieren des QR-Codes'
      });
    }
  }

  // Alle QR-Codes für ein Restaurant generieren
  async generateAllQRCodes(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;

      const tables = await Table.findAll({
        where: { restaurant_id: restaurantId },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (tables.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Keine Tische gefunden'
        });
      }

      const qrCodes = [];
      
      for (const table of tables) {
        const trackingUrl = `${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}/api/public/track/${table.tracking_token}`;
        
        const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          width: 300,
          margin: 2
        });

        await table.update({ 
          qr_code: qrCodeDataUrl,
          qr_code_url: trackingUrl
        });

        qrCodes.push({
          table_id: table.id,
          table_number: table.table_number,
          qr_code: qrCodeDataUrl,
          tracking_url: trackingUrl
        });
      }

      res.json({
        success: true,
        message: `${qrCodes.length} QR-Codes generiert`,
        data: qrCodes
      });

    } catch (error) {
      console.error('Batch QR-Code Generierung Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Generieren der QR-Codes'
      });
    }
  }

  // QR-Code als Bild herunterladen
  async downloadQRCode(req, res) {
    try {
      const { tableId } = req.params;
      const { format = 'png' } = req.query;
      const restaurantId = req.user.restaurant_id;

      const table = await Table.findOne({
        where: { 
          id: tableId,
          restaurant_id: restaurantId
        },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Tisch nicht gefunden'
        });
      }

      const trackingUrl = table.qr_code_url || `${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}/api/public/track/${table.tracking_token}`;

      if (format === 'png') {
        // PNG Format
        const buffer = await QRCode.toBuffer(trackingUrl, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          width: 500,
          margin: 3
        });

        res.set({
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="qr-tisch-${table.table_number}.png"`
        });
        res.send(buffer);

      } else if (format === 'svg') {
        // SVG Format
        const svg = await QRCode.toString(trackingUrl, {
          errorCorrectionLevel: 'M',
          type: 'svg',
          width: 500,
          margin: 3
        });

        res.set({
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `attachment; filename="qr-tisch-${table.table_number}.svg"`
        });
        res.send(svg);

      } else {
        return res.status(400).json({
          success: false,
          message: 'Ungültiges Format. Verwende png oder svg'
        });
      }

    } catch (error) {
      console.error('QR-Code Download Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Herunterladen des QR-Codes'
      });
    }
  }

  // PDF mit allen QR-Codes generieren
  async downloadAllQRCodesPDF(req, res) {
    try {
      // Prüfe ob PDFKit verfügbar ist
      if (!PDFDocument) {
        return res.status(503).json({
          success: false,
          message: 'PDF-Export ist derzeit nicht verfügbar. Bitte verwenden Sie den einzelnen QR-Code Download.'
        });
      }

      const restaurantId = req.user.restaurant_id;

      const restaurant = await Restaurant.findByPk(restaurantId, {
        include: [{
          model: Table,
          as: 'tables',
          order: [['table_number', 'ASC']]
        }]
      });

      if (!restaurant || restaurant.tables.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Keine Tische gefunden'
        });
      }

      // PDF erstellen
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      // Response Headers
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="qr-codes-${restaurant.slug || restaurant.id}.pdf"`
      });

      // Pipe PDF to response
      doc.pipe(res);

      // PDF Header
      doc.fontSize(24)
         .text(restaurant.name, { align: 'center' })
         .fontSize(14)
         .text('QR-Codes für Google Bewertungen', { align: 'center' })
         .moveDown(2);

      // QR-Codes generieren (2 pro Zeile)
      let xPos = 50;
      let yPos = 150;
      let count = 0;

      for (const table of restaurant.tables) {
        if (count > 0 && count % 2 === 0) {
          xPos = 50;
          yPos += 280;
          
          // Neue Seite wenn nötig
          if (yPos > 600) {
            doc.addPage();
            yPos = 50;
          }
        }

        const trackingUrl = table.qr_code_url || 
          `${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}/api/public/track/${table.tracking_token}`;

        // QR-Code als Buffer generieren
        const qrBuffer = await QRCode.toBuffer(trackingUrl, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          width: 200,
          margin: 2
        });

        // QR-Code zum PDF hinzufügen
        doc.image(qrBuffer, xPos, yPos, { width: 200, height: 200 });
        
        // Tischnummer
        doc.fontSize(14)
           .text(`Tisch ${table.table_number}`, xPos, yPos + 210, {
             width: 200,
             align: 'center'
           });

        xPos += 250;
        count++;
      }

      // Footer
      doc.fontSize(10)
         .text(`Generiert am ${new Date().toLocaleDateString('de-DE')}`, 50, 750, {
           align: 'center'
         });

      // PDF finalisieren
      doc.end();

    } catch (error) {
      console.error('PDF Generierung Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Generieren der PDF'
      });
    }
  }

  // QR-Code Vorschau
  async previewQRCode(req, res) {
    try {
      const { tableId } = req.params;
      const restaurantId = req.user.restaurant_id;

      const table = await Table.findOne({
        where: { 
          id: tableId,
          restaurant_id: restaurantId
        },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Tisch nicht gefunden'
        });
      }

      // HTML-Vorschau generieren
      const trackingUrl = table.qr_code_url || 
        `${process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com'}/api/public/track/${table.tracking_token}`;
      
      const qrCodeDataUrl = table.qr_code || await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 2
      });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>QR-Code - Tisch ${table.table_number}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #333; margin-bottom: 10px; }
            h2 { color: #667eea; margin-bottom: 30px; }
            .qr-code { margin: 20px 0; }
            .info { 
              margin-top: 20px; 
              padding: 15px;
              background: #f8f9fa;
              border-radius: 5px;
            }
            .url {
              word-break: break-all;
              color: #666;
              font-size: 12px;
              margin-top: 10px;
            }
            .download-btn {
              display: inline-block;
              margin: 10px;
              padding: 10px 20px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${table.restaurant.name}</h1>
            <h2>Tisch ${table.table_number}</h2>
            <div class="qr-code">
              <img src="${qrCodeDataUrl}" alt="QR-Code" />
            </div>
            <div class="info">
              <strong>Scannen für Google Bewertung</strong>
              <div class="url">${trackingUrl}</div>
            </div>
            <div>
              <a href="/api/restaurant/qrcode/${table.id}/download?format=png" class="download-btn">
                Download PNG
              </a>
              <a href="/api/restaurant/qrcode/${table.id}/download?format=svg" class="download-btn">
                Download SVG
              </a>
            </div>
          </div>
        </body>
        </html>
      `;

      res.send(html);

    } catch (error) {
      console.error('QR-Code Vorschau Fehler:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Anzeigen der Vorschau'
      });
    }
  }
}

module.exports = new QRCodeController();