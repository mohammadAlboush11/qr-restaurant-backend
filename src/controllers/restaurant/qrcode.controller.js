/**
 * QR-Code Controller für Restaurant
 * Speichern als: backend/src/controllers/restaurant/qrcode.controller.js
 */

const { QRCode, Table, Restaurant } = require('../../models');
const QRCodeLib = require('qrcode');
const crypto = require('crypto');
const { Op } = require('sequelize');

class QRCodeController {
  // QR-Code für Tisch generieren
  async generateQRCode(req, res) {
    try {
      const { table_id } = req.params;
      const restaurantId = req.user.restaurant_id;
      
      // Hole Tisch und Restaurant Infos
      const table = await Table.findOne({
        where: { 
          id: table_id,
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
      
      if (!table.restaurant.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Restaurant ist deaktiviert. QR-Codes können nicht generiert werden.'
        });
      }
      
      // Prüfe ob bereits ein QR-Code existiert
      let qrCode = await QRCode.findOne({
        where: { 
          table_id: table_id,
          restaurant_id: restaurantId
        }
      });
      
      // Generiere einzigartigen Code
      const uniqueCode = this.generateUniqueCode();
      
      if (qrCode) {
        // Update existing QR Code
        qrCode.code = uniqueCode;
        qrCode.is_active = true;
        await qrCode.save();
      } else {
        // Create new QR Code
        qrCode = await QRCode.create({
          table_id: table_id,
          restaurant_id: restaurantId,
          code: uniqueCode,
          is_active: true
        });
      }
      
      // WICHTIG: URL muss auf BACKEND zeigen!
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
      const scanUrl = `${backendUrl}/api/public/scan/${uniqueCode}`;
      
      console.log(`📱 QR-Code generiert für Tisch ${table.table_number}`);
      console.log(`   URL: ${scanUrl}`);
      
      // Generiere QR-Code Bild
      const qrCodeImage = await this.generateQRCodeImage(scanUrl, {
        restaurant_name: table.restaurant.name,
        table_number: table.table_number
      });
      
      res.json({
        success: true,
        message: 'QR-Code erfolgreich generiert',
        data: {
          id: qrCode.id,
          code: uniqueCode,
          scan_url: scanUrl,
          qr_image: qrCodeImage,
          table: {
            id: table.id,
            number: table.table_number,
            description: table.description
          }
        }
      });
      
    } catch (error) {
      console.error('Generate QR Code Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Generieren des QR-Codes'
      });
    }
  }
  
  // Alle QR-Codes für Restaurant generieren
  async generateAllQRCodes(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      // Hole Restaurant
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      if (!restaurant.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Restaurant ist deaktiviert. QR-Codes können nicht generiert werden.'
        });
      }
      
      // Hole alle Tische
      const tables = await Table.findAll({
        where: { restaurant_id: restaurantId },
        order: [['table_number', 'ASC']]
      });
      
      const results = [];
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
      
      for (const table of tables) {
        // Prüfe existierenden QR-Code
        let qrCode = await QRCode.findOne({
          where: { table_id: table.id }
        });
        
        const uniqueCode = this.generateUniqueCode();
        
        if (qrCode) {
          qrCode.code = uniqueCode;
          qrCode.is_active = true;
          await qrCode.save();
        } else {
          qrCode = await QRCode.create({
            table_id: table.id,
            restaurant_id: restaurantId,
            code: uniqueCode,
            is_active: true
          });
        }
        
        const scanUrl = `${backendUrl}/api/public/scan/${uniqueCode}`;
        const qrCodeImage = await this.generateQRCodeImage(scanUrl, {
          restaurant_name: restaurant.name,
          table_number: table.table_number
        });
        
        results.push({
          table_id: table.id,
          table_number: table.table_number,
          code: uniqueCode,
          scan_url: scanUrl,
          qr_image: qrCodeImage
        });
      }
      
      console.log(`✅ ${results.length} QR-Codes generiert für ${restaurant.name}`);
      
      res.json({
        success: true,
        message: `${results.length} QR-Codes erfolgreich generiert`,
        data: results
      });
      
    } catch (error) {
      console.error('Generate All QR Codes Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Generieren der QR-Codes'
      });
    }
  }
  
  // QR-Code Bild herunterladen
  async downloadQRCode(req, res) {
    try {
      const { table_id } = req.params;
      const restaurantId = req.user.restaurant_id;
      
      const qrCode = await QRCode.findOne({
        where: { 
          table_id: table_id,
          restaurant_id: restaurantId
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
        return res.status(404).json({
          success: false,
          message: 'QR-Code nicht gefunden'
        });
      }
      
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
      const scanUrl = `${backendUrl}/api/public/scan/${qrCode.code}`;
      
      // Generiere QR-Code als Buffer für Download
      const qrCodeBuffer = await QRCodeLib.toBuffer(scanUrl, {
        type: 'png',
        width: 512,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 
        `attachment; filename="qr-code-tisch-${qrCode.table.table_number}.png"`);
      res.send(qrCodeBuffer);
      
    } catch (error) {
      console.error('Download QR Code Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Herunterladen des QR-Codes'
      });
    }
  }
  
  // Alle QR-Codes als ZIP herunterladen
  async downloadAllQRCodes(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const archiver = require('archiver');
      
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      const qrCodes = await QRCode.findAll({
        where: { restaurant_id: restaurantId },
        include: [{
          model: Table,
          as: 'table'
        }]
      });
      
      if (qrCodes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Keine QR-Codes gefunden'
        });
      }
      
      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });
      
      res.attachment(`qr-codes-${restaurant.slug || restaurant.id}.zip`);
      archive.pipe(res);
      
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
      
      for (const qrCode of qrCodes) {
        const scanUrl = `${backendUrl}/api/public/scan/${qrCode.code}`;
        const qrCodeBuffer = await QRCodeLib.toBuffer(scanUrl, {
          type: 'png',
          width: 512,
          margin: 2
        });
        
        archive.append(qrCodeBuffer, { 
          name: `tisch-${qrCode.table.table_number}.png` 
        });
      }
      
      await archive.finalize();
      
    } catch (error) {
      console.error('Download All QR Codes Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Herunterladen der QR-Codes'
      });
    }
  }
  
  // QR-Code Status toggle
  async toggleQRCodeStatus(req, res) {
    try {
      const { qr_id } = req.params;
      const restaurantId = req.user.restaurant_id;
      
      const qrCode = await QRCode.findOne({
        where: { 
          id: qr_id,
          restaurant_id: restaurantId
        }
      });
      
      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'QR-Code nicht gefunden'
        });
      }
      
      qrCode.is_active = !qrCode.is_active;
      await qrCode.save();
      
      res.json({
        success: true,
        message: `QR-Code ${qrCode.is_active ? 'aktiviert' : 'deaktiviert'}`,
        data: {
          id: qrCode.id,
          is_active: qrCode.is_active
        }
      });
      
    } catch (error) {
      console.error('Toggle QR Code Status Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Ändern des QR-Code Status'
      });
    }
  }
  
  // Hilfsfunktionen
  generateUniqueCode() {
    // Generiere einen einzigartigen 10-stelligen Code
    const timestamp = Date.now().toString(36);
    const randomStr = crypto.randomBytes(4).toString('hex');
    return `${timestamp}${randomStr}`.toUpperCase();
  }
  
  async generateQRCodeImage(url, metadata) {
    try {
      // Generiere QR-Code mit Custom Styling
      const qrCodeDataUrl = await QRCodeLib.toDataURL(url, {
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      
      return qrCodeDataUrl;
    } catch (error) {
      console.error('Generate QR Code Image Error:', error);
      throw error;
    }
  }
}

module.exports = new QRCodeController();