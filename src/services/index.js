/**
 * Service Loader - Lädt alle Services in der richtigen Reihenfolge
 * Speichern als: backend/src/services/index.js
 */

const services = {};

// 1. Email Service zuerst laden
try {
  services.emailService = require('./email.service');
  console.log('✅ Email Service geladen');
} catch (error) {
  console.error('❌ Email Service Ladefehler:', error.message);
  services.emailService = null;
}

// 2. Review Monitor Service
try {
  services.reviewMonitor = require('./review-monitor.service');
  console.log('✅ Review Monitor Service geladen');
} catch (error) {
  console.error('❌ Review Monitor Ladefehler:', error.message);
  services.reviewMonitor = null;
}

// 3. Keep-Alive Service
try {
  services.keepAliveService = require('./keep-alive.service');
  console.log('✅ Keep-Alive Service geladen');
} catch (error) {
  console.error('⚠️ Keep-Alive Service nicht gefunden');
  services.keepAliveService = null;
}

// 4. QR Code Service (falls vorhanden)
try {
  services.qrcodeService = require('./qrcode.service');
  console.log('✅ QR Code Service geladen');
} catch (error) {
  // Optional - kein Fehler ausgeben
  services.qrcodeService = null;
}

// 5. Scan Notification Service (falls vorhanden)
try {
  services.scanNotificationService = require('./scan-notification.service');
  console.log('✅ Scan Notification Service geladen');
} catch (error) {
  // Optional - kein Fehler ausgeben
  services.scanNotificationService = null;
}

// 6. Google Reviews Service (falls vorhanden)
try {
  services.googleReviewsService = require('./google-reviews.service');
  console.log('✅ Google Reviews Service geladen');
} catch (error) {
  // Optional - kein Fehler ausgeben
  services.googleReviewsService = null;
}

module.exports = services;