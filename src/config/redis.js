/**
 * Redis Config - ENTFERNT/DEAKTIVIERT
 * Speichern als: backend/src/config/redis.js
 * 
 * Redis wird in diesem Projekt NICHT verwendet.
 * Diese Datei existiert nur als Platzhalter falls später Redis benötigt wird.
 */

class RedisConfig {
  constructor() {
    this.client = null;
    this.isEnabled = false;
  }

  // Dummy-Methoden für Kompatibilität
  async get(key) {
    return null;
  }

  async set(key, value, ttl) {
    return true;
  }

  async del(key) {
    return true;
  }

  async flush() {
    return true;
  }

  isConnected() {
    return false;
  }
}

// Export dummy Redis client
module.exports = new RedisConfig();