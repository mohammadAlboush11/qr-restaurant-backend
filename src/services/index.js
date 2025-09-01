/**
 * Service Loader - KORRIGIERTE VERSION
 * Nur Review-Monitor aktiv, keine Scan-E-Mails!
 * Speichern als: backend/src/services/index.js
 */

const services = {};

// 1. Email Service zuerst laden (wird für Review-Benachrichtigungen benötigt)
try {
  services.emailService = require('./email.service');
  console.log('✅ Email Service geladen (nur für Review-Benachrichtigungen)');
} catch (error) {
  console.error('❌ Email Service Ladefehler:', error.message);
  services.emailService = null;
}

// 2. Review Monitor Service - DER EINZIGE SERVICE DER E-MAILS SENDET!
try {
  services.reviewMonitor = require('./review-monitor.service');
  console.log('✅ Review Monitor Service geladen (sendet NUR bei neuen Reviews)');
} catch (error) {
  console.error('❌ Review Monitor Ladefehler:', error.message);
  services.reviewMonitor = null;
}

// 3. Keep-Alive Service (optional, sendet keine E-Mails)
try {
  services.keepAliveService = require('./keep-alive.service');
  console.log('✅ Keep-Alive Service geladen');
} catch (error) {
  console.error('⚠️ Keep-Alive Service nicht gefunden');
  services.keepAliveService = null;
}

// ====== DEAKTIVIERTE SERVICES - DIESE SENDEN E-MAILS BEIM SCAN! ======

// DEAKTIVIERT: QR Code Service (sendet E-Mails beim Scan!)
// try {
//   services.qrcodeService = require('./qrcode.service');
//   console.log('✅ QR Code Service geladen');
// } catch (error) {
//   services.qrcodeService = null;
// }
services.qrcodeService = null;
console.log('🚫 QR Code Service DEAKTIVIERT (sendete E-Mails beim Scan)');

// DEAKTIVIERT: Scan Notification Service (sendet E-Mails beim Scan!)
// try {
//   services.scanNotificationService = require('./scan-notification.service');
//   console.log('✅ Scan Notification Service geladen');
// } catch (error) {
//   services.scanNotificationService = null;
// }
services.scanNotificationService = null;
console.log('🚫 Scan Notification Service DEAKTIVIERT (sendete E-Mails beim Scan)');

// DEAKTIVIERT: Smart Review Service (alternativer Service)
// try {
//   services.smartReviewService = require('./smart-review-notification.service');
//   console.log('✅ Smart Review Service geladen');
// } catch (error) {
//   services.smartReviewService = null;
// }
services.smartReviewService = null;
console.log('🚫 Smart Review Service DEAKTIVIERT (alternativer Service)');

// DEAKTIVIERT: Google Reviews Service
// try {
//   services.googleReviewsService = require('./google-reviews.service');
//   console.log('✅ Google Reviews Service geladen');
// } catch (error) {
//   services.googleReviewsService = null;
// }
services.googleReviewsService = null;

console.log('');
console.log('='.repeat(60));
console.log('📧 E-MAIL KONFIGURATION:');
console.log('   ❌ KEINE E-Mails beim QR-Code Scan');
console.log('   ✅ E-Mail NUR bei neuer Google-Bewertung');
console.log('='.repeat(60));

module.exports = services;