/**
 * Simple Logger Utility
 */
class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  info(message, data = {}) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
  }

  warn(message, data = {}) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data);
  }

  error(message, error = null) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  }

  debug(message, data = {}) {
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data);
    }
  }
}

module.exports = new Logger();