const { QRCode, Table, Restaurant } = require('../../models');
const QRCodeLib = require('qrcode');
const crypto = require('crypto');

class QRCodeController {
  generateUniqueCode() {
    const timestamp = Date.now().toString(36);
    const randomStr = crypto.randomBytes(4).toString('hex');
    return `${timestamp}${randomStr}`.toUpperCase();
  }

  // Hauptmethode für einzelne QR-Code Generierung
  async generateQRCode(req, res) {
    try {
      const tableId = req.params.table_id || req.params.tableId;
      const restaurantId = req.user.restaurant_id;

      console.log(`Generating QR for Table ${tableId}, Restaurant ${restaurantId}`);

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

      // Check if QR code already exists
      let qrCode = await QRCode.findOne({
        where: { 
          table_id: tableId,
          restaurant_id: restaurantId
        }
      });

      let code;
      
      if (qrCode && qrCode.code) {
        // USE EXISTING CODE - DON'T GENERATE NEW ONE
        code = qrCode.code;
        console.log(`Using existing QR-Code: ${code}`);
        
        // Just update to ensure it's active
        await qrCode.update({ is_active: true });
      } else {
        // Generate new code only if none exists
        code = this.generateUniqueCode();
        
        if (qrCode) {
          await qrCode.update({
            code: code,
            is_active: true
          });
          console.log(`Updated QR-Code with new code: ${code}`);
        } else {
          qrCode = await QRCode.create({
            table_id: tableId,
            restaurant_id: restaurantId,
            code: code,
            redirect_url: table.restaurant.google_review_url || 'https://google.com',
            is_active: true
          });
          console.log(`Created new QR-Code: ${code}`);
        }
      }

      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
      const scanUrl = `${backendUrl}/api/public/scan/${code}`;

      // Generate QR image
      const qrImage = await QRCodeLib.toDataURL(scanUrl, {
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      console.log(`✅ QR-Code ready: ${code} for Table ${table.table_number}`);

      res.json({
        success: true,
        data: {
          id: qrCode.id,
          code: code,
          scan_url: scanUrl,
          qr_image: qrImage,
          table_number: table.table_number,
          restaurant: table.restaurant.name
        }
      });

    } catch (error) {
      console.error('Generate QR Code Error:', error);
      res.status(500).json({
        success: false,
        message: 'QR-Code konnte nicht generiert werden',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Methode für alle QR-Codes - WICHTIG: NICHT NEUE CODES GENERIEREN!
  async generateAllQRCodes(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;

      const tables = await Table.findAll({
        where: { 
          restaurant_id: restaurantId,
          is_active: true
        },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (tables.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Keine aktiven Tische gefunden'
        });
      }

      const qrCodes = [];
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

      for (const table of tables) {
        let qrCode = await QRCode.findOne({
          where: { 
            table_id: table.id,
            restaurant_id: restaurantId
          }
        });

        let code;
        
        if (qrCode && qrCode.code) {
          // USE EXISTING CODE - DON'T GENERATE NEW ONE!
          code = qrCode.code;
          console.log(`Table ${table.table_number}: Using existing code ${code}`);
          
          // Just ensure it's active
          await qrCode.update({ is_active: true });
        } else {
          // Only generate new code if none exists
          code = this.generateUniqueCode();
          
          if (qrCode) {
            // Update existing record with new code
            await qrCode.update({
              code: code,
              is_active: true
            });
          } else {
            // Create new record
            qrCode = await QRCode.create({
              table_id: table.id,
              restaurant_id: restaurantId,
              code: code,
              redirect_url: table.restaurant.google_review_url || 'https://google.com',
              is_active: true
            });
          }
          console.log(`Table ${table.table_number}: Generated new code ${code}`);
        }

        const scanUrl = `${backendUrl}/api/public/scan/${code}`;

        qrCodes.push({
          id: qrCode.id,
          table_id: table.id,
          table_number: table.table_number,
          code: code,
          scan_url: scanUrl
        });
      }

      console.log(`✅ Processed ${qrCodes.length} QR codes for restaurant ${restaurantId}`);

      res.json({
        success: true,
        data: qrCodes,
        message: `${qrCodes.length} QR-Codes verarbeitet`
      });

    } catch (error) {
      console.error('Generate All QR Codes Error:', error);
      res.status(500).json({
        success: false,
        message: 'QR-Codes konnten nicht generiert werden'
      });
    }
  }

  // Toggle Status
  async toggleQRCodeStatus(req, res) {
    try {
      const qrId = req.params.qr_id || req.params.id;
      const restaurantId = req.user.restaurant_id;

      const qrCode = await QRCode.findOne({
        where: { 
          id: qrId,
          restaurant_id: restaurantId
        }
      });

      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'QR-Code nicht gefunden'
        });
      }

      await qrCode.update({
        is_active: !qrCode.is_active
      });

      res.json({
        success: true,
        data: qrCode,
        message: `QR-Code ${qrCode.is_active ? 'aktiviert' : 'deaktiviert'}`
      });

    } catch (error) {
      console.error('Toggle QR Code Error:', error);
      res.status(500).json({
        success: false,
        message: 'Status konnte nicht geändert werden'
      });
    }
  }

  // Get single QR Code
  async getQRCode(req, res) {
    try {
      const qrId = req.params.id || req.params.qr_id;
      const restaurantId = req.user.restaurant_id;

      const qrCode = await QRCode.findOne({
        where: { 
          id: qrId,
          restaurant_id: restaurantId
        },
        include: [{
          model: Table,
          as: 'table'
        }]
      });

      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'QR-Code nicht gefunden'
        });
      }

      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
      const scanUrl = `${backendUrl}/api/public/scan/${qrCode.code}`;

      const qrImage = await QRCodeLib.toDataURL(scanUrl, {
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      res.json({
        success: true,
        data: {
          ...qrCode.toJSON(),
          scan_url: scanUrl,
          qr_image: qrImage
        }
      });

    } catch (error) {
      console.error('Get QR Code Error:', error);
      res.status(500).json({
        success: false,
        message: 'QR-Code konnte nicht geladen werden'
      });
    }
  }

  // Download QR Code (Placeholder)
  async downloadQRCode(req, res) {
    res.status(501).json({
      success: false,
      message: 'Download noch nicht implementiert'
    });
  }

  // Download all QR Codes (Placeholder)
  async downloadAllQRCodes(req, res) {
    res.status(501).json({
      success: false,
      message: 'Download noch nicht implementiert'
    });
  }

  // Alias-Methoden für Kompatibilität
  async generateForTable(req, res) {
    return this.generateQRCode(req, res);
  }

  async generateForAllTables(req, res) {
    return this.generateAllQRCodes(req, res);
  }

  async toggleStatus(req, res) {
    return this.toggleQRCodeStatus(req, res);
  }
}

module.exports = new QRCodeController();