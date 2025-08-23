/**
 * Keep-Alive Service für Render Free Plan
 * Speichern als: backend/src/services/keep-alive.service.js
 */

const axios = require('axios');
const { Restaurant } = require('../models');

class KeepAliveService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.pingInterval = 10 * 60 * 1000; // 10 Minuten
    this.activityLog = [];
    this.startTime = null;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ Keep-Alive Service läuft bereits');
      return;
    }

    // Nur in Production auf Render aktivieren
    if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
      console.log('ℹ️ Keep-Alive Service nur in Production aktiv');
      return;
    }

    console.log('🔄 Starte Keep-Alive Service...');
    console.log(`   Ping-Intervall: ${this.pingInterval / 1000 / 60} Minuten`);
    
    this.isRunning = true;
    this.startTime = new Date();

    // Erste Aktivität nach 5 Minuten
    setTimeout(() => this.performActivity(), 5 * 60 * 1000);

    // Dann alle 10 Minuten
    this.interval = setInterval(() => {
      this.performActivity();
    }, this.pingInterval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      console.log('⏹️ Keep-Alive Service gestoppt');
    }
  }

  async performActivity() {
    try {
      const activityType = this.getRandomActivity();
      console.log(`🏃 Keep-Alive Aktivität: ${activityType} - ${new Date().toLocaleTimeString('de-DE')}`);

      switch (activityType) {
        case 'database_check':
          await this.checkDatabase();
          break;
        case 'self_ping':
          await this.selfPing();
          break;
        case 'stats_update':
          await this.updateStats();
          break;
        case 'cleanup':
          await this.performCleanup();
          break;
        default:
          await this.checkDatabase();
      }

      this.activityLog.push({
        type: activityType,
        timestamp: new Date(),
        success: true
      });

      // Halte nur die letzten 50 Einträge
      if (this.activityLog.length > 50) {
        this.activityLog = this.activityLog.slice(-50);
      }

    } catch (error) {
      console.error('❌ Keep-Alive Aktivität fehlgeschlagen:', error.message);
      this.activityLog.push({
        type: 'error',
        timestamp: new Date(),
        success: false,
        error: error.message
      });
    }
  }

  getRandomActivity() {
    const activities = [
      'database_check',
      'self_ping',
      'stats_update',
      'cleanup'
    ];
    return activities[Math.floor(Math.random() * activities.length)];
  }

  async checkDatabase() {
    // Einfache Datenbankabfrage
    const count = await Restaurant.count({
      where: { is_active: true }
    });
    console.log(`   📊 Aktive Restaurants: ${count}`);
    return count;
  }

  async selfPing() {
    // Ping eigene API
    if (process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL) {
      const url = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL;
      try {
        const response = await axios.get(`${url}/api/health`, {
          timeout: 5000
        });
        console.log(`   🏓 Self-Ping Status: ${response.status}`);
        return response.status;
      } catch (error) {
        console.log(`   ⚠️ Self-Ping fehlgeschlagen (normal bei ersten Versuchen)`);
      }
    }
  }

  async updateStats() {
    // Statistiken aktualisieren
    const stats = {
      uptime: this.getUptime(),
      activities: this.activityLog.length,
      lastActivity: this.activityLog[this.activityLog.length - 1]?.timestamp
    };
    console.log(`   📈 Uptime: ${stats.uptime} Minuten`);
    return stats;
  }

  async performCleanup() {
    // Alte Session-Daten aufräumen (Beispiel)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 Tage alt

    // Hier könnten alte Logs, temporäre Daten etc. gelöscht werden
    console.log(`   🧹 Cleanup durchgeführt (Cutoff: ${cutoffDate.toLocaleDateString('de-DE')})`);
    
    // Beispiel: Alte Review-Notifications aufräumen
    if (global.models?.ReviewNotification) {
      const { Op } = require('sequelize');
      const deleted = await global.models.ReviewNotification.destroy({
        where: {
          created_at: {
            [Op.lt]: cutoffDate
          },
          notification_sent: true
        }
      });
      if (deleted > 0) {
        console.log(`   🗑️ ${deleted} alte Benachrichtigungen gelöscht`);
      }
    }
  }

  getUptime() {
    if (!this.startTime) return 0;
    const diff = Date.now() - this.startTime.getTime();
    return Math.floor(diff / 1000 / 60); // in Minuten
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: this.getUptime(),
      pingInterval: this.pingInterval,
      lastActivities: this.activityLog.slice(-10),
      totalActivities: this.activityLog.length
    };
  }
}

// Singleton
module.exports = new KeepAliveService();