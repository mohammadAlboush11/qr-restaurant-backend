/**
 * Scan Notification Service - Korrigierte Version
 */
const { Table, Restaurant, ReviewNotification } = require('../models');
const emailService = require('./email.service');

// Logger mit Fallback
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = {
    info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
    warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
    error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
  };
}

class ScanNotificationService {
  constructor() {
    this.recentScans = new Map();
    this.scanCooldown = 5 * 60 * 1000; // 5 Minuten
    this.maxCacheSize = 1000;
    this.cleanupInterval = null;
    this.startCleanupInterval();
  }

  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldScans();
    }, 30 * 60 * 1000); // Every 30 minutes
  }

  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  isRecentScan(tableId) {
    const lastScan = this.recentScans.get(tableId);
    if (!lastScan) return false;
    
    const timeSinceLastScan = Date.now() - lastScan;
    return timeSinceLastScan < this.scanCooldown;
  }

  async handleQRScan(tableId, scanData = {}) {
    try {
      const table = await Table.findByPk(tableId, {
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });

      if (!table || !table.restaurant) {
        logger.warn('Table or Restaurant not found', { tableId });
        return false;
      }

      // Update scan count
      await table.increment('scan_count');
      await table.update({ last_scan_at: new Date() });

      // Check spam protection
      if (!this.isRecentScan(tableId)) {
        this.addScanToCache(tableId);

        // Create notification record
        await ReviewNotification.create({
          restaurant_id: table.restaurant_id,
          table_id: table.id,
          review_author: 'QR-Code Scan',
          review_text: `Tisch ${table.table_number} wurde gescannt.`,
          review_rating: null,
          review_time: new Date(),
          notification_sent: false
        });

        // Send email if configured
        if (emailService.isConfigured) {
          const emailSent = await emailService.sendScanNotification({
            restaurant_name: table.restaurant.name,
            restaurant_email: table.restaurant.notification_email || table.restaurant.email,
            table_number: table.table_number,
            table_description: table.description || '',
            scan_time: new Date().toLocaleString('de-DE'),
            ip_address: scanData.ip_address || 'unknown',
            user_agent: scanData.user_agent || 'unknown',
            google_review_url: table.restaurant.google_review_url
          });

          if (emailSent) {
            logger.info('Scan notification sent', { 
              tableId, 
              restaurantId: table.restaurant_id 
            });
          }
        }
      } else {
        logger.info('Scan skipped due to cooldown', { tableId });
      }

      return true;
    } catch (error) {
      logger.error('QR Scan Handler Error:', error);
      return false;
    }
  }

  addScanToCache(tableId) {
    if (this.recentScans.size >= this.maxCacheSize) {
      const entriesToRemove = Math.floor(this.maxCacheSize * 0.2);
      const sortedEntries = Array.from(this.recentScans.entries())
        .sort((a, b) => a[1] - b[1]);
      
      for (let i = 0; i < entriesToRemove; i++) {
        this.recentScans.delete(sortedEntries[i][0]);
      }
      
      logger.info('Cache pruned', { 
        removed: entriesToRemove, 
        remaining: this.recentScans.size 
      });
    }

    this.recentScans.set(tableId, Date.now());
  }

  cleanupOldScans() {
    const now = Date.now();
    const expirationTime = this.scanCooldown * 2;
    let cleanedCount = 0;

    for (const [tableId, timestamp] of this.recentScans.entries()) {
      if (now - timestamp > expirationTime) {
        this.recentScans.delete(tableId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Old scans cleaned', { 
        cleaned: cleanedCount, 
        remaining: this.recentScans.size 
      });
    }
  }

  getCacheStats() {
    return {
      size: this.recentScans.size,
      maxSize: this.maxCacheSize,
      cooldownMs: this.scanCooldown,
      oldestEntry: this.recentScans.size > 0 ? 
        Math.min(...Array.from(this.recentScans.values())) : null,
      newestEntry: this.recentScans.size > 0 ? 
        Math.max(...Array.from(this.recentScans.values())) : null
    };
  }

  clearCache() {
    const size = this.recentScans.size;
    this.recentScans.clear();
    logger.info('Cache cleared', { previousSize: size });
  }
}

module.exports = new ScanNotificationService();