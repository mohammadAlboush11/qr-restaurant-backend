/**
 * Email Service - Nur für echte Reviews
 * Speichern als: backend/src/services/email.service.js
 */

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
        console.log('⚠️ E-Mail-Service nicht konfiguriert (SMTP_USER oder SMTP_PASS fehlt)');
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

  /**
   * Generische E-Mail senden
   */
  async sendEmail(options) {
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail-Service nicht konfiguriert');
      return false;
    }

    try {
      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ E-Mail erfolgreich gesendet:', info.messageId);
      console.log('   An:', options.to);
      return true;
    } catch (error) {
      console.error('❌ E-Mail Versand fehlgeschlagen:', error);
      return false;
    }
  }

  /**
   * NUR für echte Google Reviews - Benachrichtigung senden
   */
  async sendReviewNotification(restaurant, table, reviewData = {}) {
    console.log(`📧 Sende Review-Benachrichtigung an ${restaurant.email}...`);

    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail-Service nicht konfiguriert');
      return false;
    }

    try {
      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: restaurant.email,
        subject: `🌟 Neue ${reviewData.rating}-Sterne Bewertung von ${reviewData.author || 'Gast'}`,
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
              .review-box { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
              .rating { font-size: 28px; color: #fbbf24; margin: 10px 0; }
              .author { font-weight: bold; color: #667eea; font-size: 20px; margin-bottom: 10px; }
              .review-text { margin-top: 15px; font-size: 16px; line-height: 1.5; color: #4b5563; background: #f3f4f6; padding: 15px; border-radius: 5px; }
              .table-info { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 20px; border-radius: 4px; }
              .stats { display: flex; justify-content: space-around; margin-top: 25px; background: white; padding: 20px; border-radius: 8px; }
              .stat-box { text-align: center; }
              .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
              .stat-label { font-size: 12px; color: #6b7280; margin-top: 5px; text-transform: uppercase; }
              .button { display: inline-block; padding: 14px 32px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin-top: 25px; font-weight: 500; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; color: #6c757d; font-size: 12px; }
              .success-badge { display: inline-block; background: #10b981; color: white; padding: 5px 12px; border-radius: 15px; font-size: 12px; margin-left: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Neue Google Bewertung erhalten!</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">${restaurant.name}</p>
              </div>
              
              <div class="content">
                ${table ? `
                <div class="table-info">
                  <strong>📍 Wahrscheinlich von Tisch ${table.table_number}</strong>
                  ${table.name ? `(${table.name})` : ''}
                  <span class="success-badge">QR-Code genutzt</span>
                  <div style="margin-top: 5px; font-size: 12px; color: #92400e;">
                    Basierend auf kürzlichem QR-Code Scan
                  </div>
                </div>
                ` : ''}
                
                <div class="review-box">
                  <div class="author">
                    ${reviewData.author || 'Anonymer Gast'}
                  </div>
                  <div class="rating">
                    ${'⭐'.repeat(reviewData.rating || 5)}
                    <span style="color: #6b7280; font-size: 16px; margin-left: 10px;">
                      ${reviewData.rating}/5 Sterne
                    </span>
                  </div>
                  ${reviewData.text ? `
                    <div class="review-text">
                      <strong style="color: #374151;">Bewertungstext:</strong><br>
                      "${reviewData.text}"
                    </div>
                  ` : `
                    <div style="margin-top: 15px; color: #9ca3af; font-style: italic;">
                      Der Gast hat keine schriftliche Bewertung hinterlassen.
                    </div>
                  `}
                  <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                    <small style="color: #9ca3af;">
                      Bewertung erhalten am: ${new Date(reviewData.time || Date.now()).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })} Uhr
                    </small>
                  </div>
                </div>
                
                <div class="stats">
                  <div class="stat-box">
                    <div class="stat-value">${reviewData.totalReviews || '?'}</div>
                    <div class="stat-label">Bewertungen Total</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-value">${reviewData.averageRating ? reviewData.averageRating.toFixed(1) : '?'}</div>
                    <div class="stat-label">⭐ Durchschnitt</div>
                  </div>
                  ${table ? `
                  <div class="stat-box">
                    <div class="stat-value">${table.scan_count || 1}</div>
                    <div class="stat-label">Scans Tisch ${table.table_number}</div>
                  </div>
                  ` : ''}
                </div>
                
                <div style="text-align: center;">
                  <a href="${restaurant.google_business_url || 'https://business.google.com'}" class="button">
                    Bewertung auf Google ansehen →
                  </a>
                </div>
                
                <div style="margin-top: 30px; padding: 20px; background: #f0fdf4; border-radius: 8px; border: 1px solid #86efac;">
                  <h3 style="color: #166534; margin-top: 0;">💡 Tipp für maximale Wirkung:</h3>
                  <ul style="color: #166534; margin: 10px 0;">
                    <li>Antworten Sie zeitnah auf die Bewertung</li>
                    <li>Bedanken Sie sich persönlich beim Gast</li>
                    <li>Zeigen Sie, dass Ihnen Feedback wichtig ist</li>
                  </ul>
                </div>
                
                <div class="footer">
                  <p>Diese E-Mail wurde automatisch generiert, weil eine neue Google-Bewertung erkannt wurde.</p>
                  <p><strong>QR Restaurant Review Monitoring System</strong></p>
                  <p>Powered by Google Places API</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Review-Benachrichtigung erfolgreich gesendet');
      console.log('   An:', restaurant.email);
      console.log('   Betreff:', mailOptions.subject);
      return true;
    } catch (error) {
      console.error('❌ Review-Benachrichtigung fehlgeschlagen:', error);
      return false;
    }
  }

  /**
   * Test-E-Mail senden (für Debugging)
   */
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
          <hr>
          <p><strong>Konfiguration:</strong></p>
          <ul>
            <li>SMTP Host: ${process.env.SMTP_HOST}</li>
            <li>SMTP Port: ${process.env.SMTP_PORT}</li>
            <li>SMTP User: ${process.env.SMTP_USER}</li>
            <li>Google API: ${process.env.GOOGLE_PLACES_API_KEY ? '✅ Konfiguriert' : '❌ Fehlt'}</li>
          </ul>
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