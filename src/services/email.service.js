const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initTransporter();
  }

  initTransporter() {
    try {
      // Prüfen ob SMTP konfiguriert ist
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️  E-Mail-Service nicht konfiguriert (SMTP_USER oder SMTP_PASS fehlt)');
        return;
      }

      // Transporter erstellen
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.strato.de',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: true, // true für Port 465
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false // Für selbst-signierte Zertifikate
        }
      });

      // Verbindung testen
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ E-Mail-Service Fehler:', error.message);
          this.isConfigured = false;
        } else {
          console.log('✅ E-Mail-Service bereit');
          this.isConfigured = true;
        }
      });
    } catch (error) {
      console.error('❌ E-Mail-Service Initialisierung fehlgeschlagen:', error);
      this.isConfigured = false;
    }
  }

  async sendReviewNotification(restaurant, table, reviewData = {}) {
    console.log(`📧 Versuche E-Mail zu senden an ${restaurant.email}...`);

    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail-Service nicht konfiguriert');
      return false;
    }

    try {
      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: restaurant.email,
        subject: `🔔 QR-Code Scan - Tisch ${table.table_number}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f8f9fa; padding: 30px; border: 1px solid #dee2e6; border-radius: 0 0 10px 10px; }
              .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .table-number { font-size: 24px; font-weight: bold; color: #667eea; }
              .timestamp { color: #6c757d; font-size: 14px; margin-top: 10px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; color: #6c757d; font-size: 12px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎯 QR-Code wurde gescannt!</h1>
              </div>
              
              <div class="content">
                <div class="info-box">
                  <div class="table-number">Tisch ${table.table_number}</div>
                  <div class="timestamp">⏰ ${new Date().toLocaleString('de-DE', { 
                    timeZone: 'Europe/Berlin',
                    day: '2-digit',
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} Uhr</div>
                </div>
                
                <p><strong>Was ist passiert?</strong></p>
                <p>Ein Gast hat soeben den QR-Code von <strong>Tisch ${table.table_number}</strong> gescannt und wurde zu Ihrer Google Business Seite weitergeleitet.</p>
                
                <p><strong>Was bedeutet das?</strong></p>
                <ul>
                  <li>Der Gast kann jetzt eine Bewertung abgeben</li>
                  <li>Die Bewertung erscheint direkt bei Google</li>
                  <li>Positive Bewertungen verbessern Ihr Ranking</li>
                </ul>
                
                <p><strong>Tipp:</strong> Bedanken Sie sich persönlich beim Gast für die Bewertung!</p>
                
                <div style="text-align: center;">
                  <a href="${restaurant.google_business_url}" class="button">Zu Google Reviews →</a>
                </div>
                
                <div class="footer">
                  <p>Diese E-Mail wurde automatisch vom QR Restaurant System generiert.</p>
                  <p>Restaurant: ${restaurant.name}</p>
                  <p>Gesamte Scans heute: ${table.scan_count || 1}</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ E-Mail erfolgreich gesendet:', info.messageId);
      console.log('   An:', restaurant.email);
      console.log('   Response:', info.response);
      return true;
    } catch (error) {
      console.error('❌ E-Mail Versand fehlgeschlagen:', error);
      console.error('   Details:', error.message);
      return false;
    }
  }

  async sendTestEmail(to) {
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail-Service nicht konfiguriert');
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"QR Restaurant Test" <${process.env.SMTP_USER}>`,
        to: to,
        subject: 'Test E-Mail - QR Restaurant System',
        html: `
          <h2>Test E-Mail erfolgreich!</h2>
          <p>Wenn Sie diese E-Mail erhalten, funktioniert der E-Mail-Versand korrekt.</p>
          <p>Zeit: ${new Date().toLocaleString('de-DE')}</p>
        `
      });
      console.log('✅ Test-E-Mail gesendet:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Test-E-Mail fehlgeschlagen:', error);
      return false;
    }
  }
}

module.exports = new EmailService();