const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initTransporter();
  }

  initTransporter() {
    try {
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️ E-Mail-Service nicht konfiguriert (SMTP Credentials fehlen)');
        this.isConfigured = false;
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.strato.de',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      this.transporter.verify((error, success) => {
        if (error) {
          console.error('⚠️ E-Mail-Service Verifikation fehlgeschlagen:', error.message);
        } else {
          console.log('✅ E-Mail-Service erfolgreich initialisiert');
          this.isConfigured = true;
        }
      });

      this.isConfigured = true;
      
    } catch (error) {
      console.error('❌ E-Mail-Service Initialisierung fehlgeschlagen:', error);
      this.isConfigured = false;
    }
  }

  // HAUPTFUNKTION: E-Mail bei QR-Code Scan
  async sendScanNotification(data) {
    if (!this.isConfigured || !this.transporter) {
      console.log('⚠️ E-Mail-Service nicht konfiguriert, keine E-Mail gesendet');
      return false;
    }

    try {
      const {
        restaurant_name,
        restaurant_email,
        table_number,
        table_description,
        scan_time,
        ip_address,
        user_agent,
        google_review_url
      } = data;

      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: restaurant_email,
        subject: `🔔 QR-Code Scan: Tisch ${table_number} - Potenzielle Bewertung`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-radius: 10px 10px 0 0;
              }
              .content {
                background: #ffffff;
                padding: 30px;
                border: 1px solid #ddd;
                border-radius: 0 0 10px 10px;
              }
              .info-box {
                background: #f8f9fa;
                border-left: 4px solid #667eea;
                padding: 15px;
                margin: 20px 0;
              }
              .table-info {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #eee;
              }
              .important {
                background: #fff3cd;
                border: 1px solid #ffc107;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
              }
              .button {
                display: inline-block;
                background: #28a745;
                color: white;
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 5px;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                padding: 20px;
                color: #666;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📱 QR-Code wurde gescannt!</h1>
              <p style="margin: 0; font-size: 18px;">${restaurant_name}</p>
            </div>
            
            <div class="content">
              <div class="important">
                <strong>🎯 Potenzielle Google-Bewertung!</strong><br>
                Ein Gast hat gerade den QR-Code von <strong>Tisch ${table_number}</strong> gescannt 
                und wurde zu Ihrer Google-Bewertungsseite weitergeleitet.
              </div>

              <div class="info-box">
                <h3>📊 Scan-Details:</h3>
                <div class="table-info">
                  <strong>Tisch:</strong>
                  <span>${table_number} ${table_description ? `(${table_description})` : ''}</span>
                </div>
                <div class="table-info">
                  <strong>Zeitpunkt:</strong>
                  <span>${scan_time}</span>
                </div>
                <div class="table-info">
                  <strong>IP-Adresse:</strong>
                  <span>${ip_address}</span>
                </div>
                <div class="table-info">
                  <strong>Gerät:</strong>
                  <span>${this.parseUserAgent(user_agent)}</span>
                </div>
              </div>

              <div style="background: #e7f5ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>💡 Was bedeutet das?</strong><br>
                Der Gast wurde zu Ihrer Google-Bewertungsseite weitergeleitet. 
                Erfahrungsgemäß hinterlassen etwa 30-40% der Gäste, die den QR-Code scannen, 
                tatsächlich eine Bewertung.
              </div>

              <div style="text-align: center;">
                <a href="${google_review_url}" class="button">
                  Google-Bewertungen ansehen →
                </a>
              </div>
            </div>

            <div class="footer">
              <p>Diese Benachrichtigung wurde automatisch vom QR Restaurant System generiert.</p>
              <p>© ${new Date().getFullYear()} QR Restaurant System. Alle Rechte vorbehalten.</p>
            </div>
          </body>
          </html>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Scan-Benachrichtigung gesendet an ${restaurant_email}`);
      return true;
      
    } catch (error) {
      console.error('❌ E-Mail-Versand fehlgeschlagen:', error);
      return false;
    }
  }

  // Restaurant deaktiviert Benachrichtigung
  async sendRestaurantDeactivatedNotification(restaurant) {
    if (!this.isConfigured || !this.transporter) {
      return false;
    }

    try {
      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: restaurant.email,
        subject: `⚠️ Ihr Restaurant wurde deaktiviert`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .warning { background: #f8d7da; padding: 20px; border: 1px solid #f5c6cb; border-radius: 5px; }
            </style>
          </head>
          <body>
            <div class="warning">
              <h2>⚠️ Restaurant deaktiviert</h2>
              <p>Ihr Restaurant "${restaurant.name}" wurde deaktiviert.</p>
              <p><strong>Was bedeutet das?</strong></p>
              <ul>
                <li>Alle QR-Codes sind deaktiviert</li>
                <li>Keine neuen Scans werden erfasst</li>
                <li>Keine E-Mail-Benachrichtigungen</li>
              </ul>
              <p>Bitte kontaktieren Sie den Administrator für weitere Informationen.</p>
            </div>
          </body>
          </html>
        `
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Deactivation Email Error:', error);
      return false;
    }
  }

  // Hilfsfunktion: User-Agent parsen
  parseUserAgent(ua) {
    if (!ua) return 'Unbekannt';
    
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Mac')) return 'Mac';
    
    return 'Mobiles Gerät';
  }

  // Test E-Mail
  async sendTestEmail(to) {
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail Service nicht konfiguriert');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"QR Restaurant Test" <${process.env.SMTP_USER}>`,
        to: to,
        subject: '✅ Test E-Mail - QR Restaurant System',
        text: 'Diese Test-E-Mail bestätigt, dass der E-Mail-Versand funktioniert!',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #667eea;">✅ Test E-Mail erfolgreich!</h2>
            <p>Der E-Mail-Versand funktioniert korrekt.</p>
            <p><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-DE')}</p>
          </div>
        `
      });
      
      console.log('✅ Test-E-Mail erfolgreich gesendet');
      return true;
      
    } catch (error) {
      console.error('❌ Test-E-Mail fehlgeschlagen:', error);
      return false;
    }
  }
}

module.exports = new EmailService();