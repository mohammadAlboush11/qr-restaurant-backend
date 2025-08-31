/**
 * Keep-Alive Service für Render Free Plan - KORRIGIERT
 * Speichern als: backend/src/services/keep-alive.service.js
 */

const { Restaurant, Table } = require('../models');

class KeepAliveService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.pingInterval = 14 * 60 * 1000; // 14 Minuten (Render timeout ist 15 min)
    this.activityLog = [];
    this.startTime = null;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ Keep-Alive Service läuft bereits');
      return;
    }

    // NUR in Production auf Render aktivieren
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

    // Dann alle 14 Minuten
    this.interval = setInterval(() => {
      this.performActivity();
    }, this.pingInterval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      console.log('⛔ Keep-Alive Service gestoppt');
    }
  }

  async performActivity() {
    try {
      console.log(`🏃 Keep-Alive: ${new Date().toLocaleTimeString('de-DE')}`);
      
      // Einfache DB-Query um Verbindung aktiv zu halten
      const [restaurantCount, tableCount] = await Promise.all([
        Restaurant.count({ where: { is_active: true } }),
        Table.count()
      ]);
      
      console.log(`   📊 Stats: ${restaurantCount} Restaurants, ${tableCount} Tische`);
      
      // Memory cleanup
      if (global.gc) {
        global.gc();
        console.log('   🧹 Garbage Collection ausgeführt');
      }

      this.activityLog.push({
        timestamp: new Date(),
        restaurants: restaurantCount,
        tables: tableCount,
        memory: process.memoryUsage().heapUsed / 1024 / 1024
      });

      // Halte nur letzte 20 Einträge
      if (this.activityLog.length > 20) {
        this.activityLog = this.activityLog.slice(-20);
      }

    } catch (error) {
      console.error('❌ Keep-Alive Fehler:', error.message);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000 / 60) : 0,
      lastActivity: this.activityLog[this.activityLog.length - 1],
      totalActivities: this.activityLog.length
    };
  }
}

module.exports = new KeepAliveService();