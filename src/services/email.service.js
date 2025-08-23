/**
 * Email Service – vollständig & kompatibel
 * Datei: backend/src/services/email.service.js
 */

let nodemailer;
try {
  nodemailer = require("nodemailer");
  console.log("✅ nodemailer Modul erfolgreich geladen");
} catch (err) {
  console.error("❌ KRITISCH: nodemailer konnte nicht geladen werden.");
  console.error("   Bitte ausführen: npm install nodemailer");
  process.exit(1);
}

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initTransporter(); // sofort versuchen zu initialisieren

    // 🔁 Rückwärtskompatibel: alter Methodenname als Alias
    // (einige alte server.js rufen initializeTransporter() auf)
    this.initializeTransporter = this.initTransporter.bind(this);
  }

  /**
   * Richtige Initialisierung (synchron).
   */
  initTransporter() {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_SECURE,
    } = process.env;

    this.isConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

    if (!this.isConfigured) {
      console.warn("⚠️  E-Mail nicht konfiguriert (SMTP_* Variablen fehlen).");
      this.transporter = null;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 465,
        secure:
          typeof SMTP_SECURE !== "undefined"
            ? String(SMTP_SECURE).toLowerCase() === "true"
            : Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });

      console.log("📧 Initialisiere E-Mail-Service...");
      console.log("   SMTP_USER:", SMTP_USER);
      console.log("   SMTP_HOST:", SMTP_HOST);
      console.log("   SMTP_PORT:", SMTP_PORT);
    } catch (err) {
      console.error("❌ Fehler beim Initialisieren des Mail-Transporters:", err);
      this.transporter = null;
    }
  }

  /**
   * Optionaler Connectivity-Check
   */
  async verify() {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      console.warn("⚠️  SMTP Verify fehlgeschlagen:", err?.message || err);
      return false;
    }
  }

  /**
   * Generischer Mail-Sender
   */
  async sendMail({ to, subject, html, text }) {
    if (!this.transporter) {
      console.warn("⚠️  Kein Mail-Transporter vorhanden – E-Mail wird übersprungen.");
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      console.error("❌ Fehler beim Senden der E-Mail:", err);
      return false;
    }
  }

  /**
   * Bereits existierender Versand: neue Bewertung
   */
  async sendNewReviewNotification(toEmail, reviewData = {}) {
    const subject = `⭐ Neue Bewertung erhalten`;
    const html = `
      <h2>Neue Google-Bewertung</h2>
      <p><b>Restaurant:</b> ${reviewData.restaurant_name || "-"}</p>
      <p><b>Sterne:</b> ${reviewData.rating || "-"}</p>
      <p><b>Kommentar:</b> ${reviewData.text || "-"}</p>
      <p><b>Zeit:</b> ${reviewData.time || new Date().toLocaleString("de-DE")}</p>
    `;
    return this.sendMail({ to: toEmail, subject, html });
  }

  /**
   * Wrapper 1 – von Services genutzt
   * Formen:
   *  A) (toEmail, emailData)
   *  B) (restaurantObj, tableObj)
   */
  async sendScanNotification(arg1, arg2 = {}) {
    // Form A
    if (typeof arg1 === "string") {
      const to = arg1;
      const d = arg2 || {};
      const subject = `🔔 QR-Code gescannt – Tisch ${d.table_number || d.tableNumber || "Unbekannt"}`;
      const html = `
        <h2>Neuer QR-Scan</h2>
        <p><b>Restaurant:</b> ${d.restaurant_name || d.restaurant || "-"}</p>
        <p><b>Tisch:</b> ${d.table_name || d.tableName || d.table_number || d.tableNumber || "-"}</p>
        <p><b>Zeit:</b> ${d.scan_time || new Date().toLocaleString("de-DE")}</p>
      `;
      return this.sendMail({ to, subject, html });
    }

    // Form B
    const restaurant = arg1 || {};
    const table = arg2 || {};
    const to =
      restaurant.email ||
      restaurant.ownerEmail ||
      process.env.NOTIFICATION_EMAIL ||
      process.env.SMTP_USER;

    const subject = `🔔 QR-Code gescannt – Tisch ${table.table_number ?? table.number ?? "Unbekannt"}`;
    const html = `
      <h2>Neuer QR-Scan</h2>
      <p><b>Restaurant:</b> ${restaurant.name || "-"}</p>
      <p><b>Tisch:</b> ${table.name || table.table_number || table.number || "-"}</p>
      <p><b>Zeit:</b> ${new Date().toLocaleString("de-DE")}</p>
    `;
    return this.sendMail({ to, subject, html });
  }

  /**
   * Wrapper 2 – von Services genutzt
   */
  async sendReviewProbability(toOrRestaurant, data = {}) {
    const to =
      typeof toOrRestaurant === "string"
        ? toOrRestaurant
        : (toOrRestaurant?.email ||
           toOrRestaurant?.ownerEmail ||
           process.env.NOTIFICATION_EMAIL ||
           process.env.SMTP_USER);

    const prob = data.probability || "MITTEL";
    const subject = `📈 Wahrscheinlichkeit einer Google-Bewertung: ${prob}`;
    const html = `
      <h2>Einschätzung Bewertung</h2>
      <p><b>Restaurant:</b> ${data.restaurant_name || data.restaurant || "-"}</p>
      <p><b>Tisch:</b> ${data.table_name || data.tableNumber || data.table_number || "-"}</p>
      <p><b>Scan-Zeit:</b> ${data.scan_time || data.scanTime || "-"}</p>
      <p><b>Einschätzung:</b> <strong>${prob}</strong></p>
    `;
    return this.sendMail({ to, subject, html });
  }

  /**
   * Statusausgabe
   */
  getStatus() {
    return {
      isConfigured: this.isConfigured,
      hasTransporter: Boolean(this.transporter),
      smtpHost: process.env.SMTP_HOST || "smtp.strato.de",
      smtpPort: Number(process.env.SMTP_PORT) || 465,
      smtpUser: process.env.SMTP_USER || "—",
    };
  }
}

module.exports = new EmailService();
