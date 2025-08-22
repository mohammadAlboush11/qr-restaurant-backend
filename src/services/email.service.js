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

  // ... vorheriger Code ...

async sendNewReviewNotification(restaurant, table, reviewData) {
  console.log(`🌟 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);

  if (!this.isConfigured || !this.transporter) {
    console.error('❌ E-Mail-Service nicht konfiguriert');
    return false;
  }

  try {
    const mailOptions = {
      from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
      to: restaurant.email,
      subject: `⭐ Neue Google Bewertung erhalten! ${reviewData.rating ? '- ' + '⭐'.repeat(reviewData.rating) : ''}`,
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
            .review-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .rating { font-size: 24px; color: #ffc107; margin: 10px 0; }
            .author { font-weight: bold; color: #495057; margin-bottom: 10px; }
            .review-text { color: #6c757d; font-style: italic; }
            .table-info { background: #e9ecef; padding: 15px; border-radius: 5px; margin-top: 20px; }
            .success { color: #28a745; font-weight: bold; font-size: 18px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Neue Google Bewertung!</h1>
            </div>
            
            <div class="content">
              <p class="success">✅ Ein Gast hat Ihr Restaurant bewertet!</p>
              
              <div class="review-box">
                ${reviewData.rating ? `<div class="rating">${'⭐'.repeat(reviewData.rating)}</div>` : ''}
                ${reviewData.author ? `<div class="author">Von: ${reviewData.author}</div>` : ''}
                ${reviewData.text ? `<div class="review-text">"${reviewData.text}"</div>` : ''}
              </div>
              
              ${table ? `
              <div class="table-info">
                <strong>Wahrscheinlich von:</strong> Tisch ${table.table_number}<br>
                <small>Der Gast hat den QR-Code dieses Tisches gescannt.</small>
              </div>
              ` : ''}
              
              <p style="margin-top: 30px;">
                <strong>Was sollten Sie jetzt tun?</strong>
              </p>
              <ul>
                <li>Antworten Sie auf die Bewertung bei Google</li>
                <li>Bedanken Sie sich beim Gast persönlich</li>
                <li>Teilen Sie positive Bewertungen in Social Media</li>
              </ul>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${restaurant.google_business_url}" style="display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px;">
                  Bewertung bei Google ansehen →
                </a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await this.transporter.sendMail(mailOptions);
    console.log('✅ Bewertungs-E-Mail gesendet:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ E-Mail Versand fehlgeschlagen:', error);
    return false;
  }
}

// ... rest des Codes ...

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