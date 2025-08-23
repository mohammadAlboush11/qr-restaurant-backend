const { Table, Restaurant, ReviewNotification } = require('../models');
const emailService = require('./email.service');

class ScanNotificationService {
  constructor() {
    // Speichert letzte Scans um Spam zu vermeiden
    this.recentScans = new Map();
    this.scanCooldown = 5 * 60 * 1000; // 5 Minuten Cooldown pro Tisch
  }

  // PrÃ¼ft ob kÃ¼rzlich gescannt wurde (Spam-Schutz)
  isRecentScan(tableId) {
    const lastScan = this.recentScans.get(tableId);
    if (!lastScan) return false;
    
    const timeSinceLastScan = Date.now() - lastScan;
    return timeSinceLastScan < this.scanCooldown;
  }

  // QR-Code wurde gescannt - E-Mail senden
  async handleQRScan(tableId) {
    try {
      const table = await Table.findByPk(tableId, {
        include: [Restaurant]
      });

      if (!table || !table.Restaurant) {
        console.log('Tisch oder Restaurant nicht gefunden');
        return false;
      }

      // Scan Count erhÃ¶hen
      table.scan_count = (table.scan_count || 0) + 1;
      await table.save();

      // Spam-Schutz: Nur E-Mail senden wenn nicht kÃ¼rzlich gescannt
      if (!this.isRecentScan(tableId)) {
        // Scan Zeit speichern
        this.recentScans.set(tableId, Date.now());

        // Benachrichtigung in DB speichern
        const notification = await ReviewNotification.create({
          restaurant_id: table.restaurant_id,
          table_id: table.id,
          review_author: 'QR-Code Scan',
          review_text: `Tisch ${table.table_number} wurde gescannt und Gast wurde zu Google Reviews weitergeleitet.`,
          review_rating: null,
          review_time: new Date(),
          notification_sent: false
        });

        // E-Mail senden
        const emailSent = await emailService.sendScanNotification(
          table.Restaurant,
          table
        );

        if (emailSent) {
          notification.notification_sent = true;
          await notification.save();
          console.log(`âœ… E-Mail gesendet fÃ¼r Tisch ${table.table_number} an ${table.Restaurant.email}`);
        }
      } else {
        console.log(`â­ï¸ Tisch ${table.table_number} wurde kÃ¼rzlich gescannt - keine E-Mail (Spam-Schutz)`);
      }

      // Alte EintrÃ¤ge aufrÃ¤umen
      this.cleanupOldScans();

      return true;
    } catch (error) {
      console.error('âŒ QR Scan Handler Error:', error);
      return false;
    }
  }

  // Alte Scans aufrÃ¤umen
  cleanupOldScans() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [tableId, timestamp] of this.recentScans.entries()) {
      if (timestamp < oneHourAgo) {
        this.recentScans.delete(tableId);
      }
    }
  }
}

module.exports = new ScanNotificationService();