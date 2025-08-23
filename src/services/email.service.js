let nodemailer;
try {
  nodemailer = require('nodemailer');
  console.log('✅ nodemailer Modul geladen');
} catch (error) {
  console.error('❌ nodemailer nicht installiert! Installiere mit: npm install nodemailer');
  nodemailer = null;
}

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    // Sofort initialisieren, nicht verzögert
    this.initTransporter();
  }

  initTransporter() {
    try {
      // Check ob nodemailer verfügbar
      if (!nodemailer) {
        console.error('❌ nodemailer Modul nicht verfügbar!');
        this.isConfigured = false;
        return;
      }

      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️  E-Mail-Service nicht konfiguriert (SMTP_USER oder SMTP_PASS fehlt)');
        this.isConfigured = false;
        return;
      }

      console.log('📧 Initialisiere E-Mail-Service...');
      console.log('   SMTP_USER:', process.env.SMTP_USER);
      console.log('   SMTP_HOST:', process.env.SMTP_HOST || 'smtp.strato.de');
      console.log('   SMTP_PORT:', process.env.SMTP_PORT || 465);

      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.strato.de',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000
      });

      // Async Verification ohne await
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ E-Mail-Service Verifikation fehlgeschlagen:');
          console.error('   Fehler:', error.message);
          console.error('   Code:', error.code);
          this.isConfigured = false;
        } else {
          console.log('✅ E-Mail-Service bereit und verifiziert!');
          this.isConfigured = true;
        }
      });

      // Trotzdem als konfiguriert markieren für erste Versuche
      this.isConfigured = true;
      
    } catch (error) {
      console.error('❌ E-Mail-Service Initialisierung fehlgeschlagen:', error.message);
      this.isConfigured = false;
    }
  }

  // NEUE METHODE: NUR für echte Bewertungen!
  async sendNewReviewNotification(restaurant, table, reviewData) {
    console.log(`🌟 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);

    if (!nodemailer) {
      console.error('❌ nodemailer nicht installiert!');
      return false;
    }

    if (!this.transporter) {
      console.error('❌ E-Mail Transporter nicht initialisiert');
      // Versuche nochmal zu initialisieren
      this.initTransporter();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!this.transporter) {
        console.error('❌ E-Mail Service konnte nicht initialisiert werden');
        return false;
      }
    }

    try {
      const ratingStars = reviewData.rating ? '⭐'.repeat(reviewData.rating) : '';
      
      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: restaurant.email,
        subject: `🎉 Neue Google Bewertung erhalten! ${ratingStars}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px; }
              .review-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
              .rating { font-size: 28px; color: #ffc107; margin: 10px 0; }
              .author { font-weight: bold; color: #495057; font-size: 18px; margin-bottom: 10px; }
              .review-text { color: #6c757d; font-style: italic; line-height: 1.5; margin: 15px 0; }
              .table-info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin-top: 20px; border: 1px solid #90caf9; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0; color: #6c757d; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🎉 Neue Google Bewertung!</h1>
                <p style="margin: 10px 0 0 0; font-size: 18px;">${restaurant.name} wurde bewertet</p>
              </div>
              <div class="content">
                <div class="review-box">
                  ${reviewData.rating ? `<div class="rating">${'⭐'.repeat(reviewData.rating)}</div>` : ''}
                  ${reviewData.author ? `<div class="author">Von: ${reviewData.author}</div>` : ''}
                  ${reviewData.text ? `<div class="review-text">"${reviewData.text}"</div>` : ''}
                  <div style="color: #999; font-size: 14px; margin-top: 10px;">
                    ${new Date().toLocaleString('de-DE')}
                  </div>
                </div>
                ${table ? `
                <div class="table-info">
                  <strong>📍 Wahrscheinlich von Tisch ${table.table_number}</strong><br>
                  <small style="color: #666;">Der Gast hat kürzlich den QR-Code dieses Tisches gescannt</small>
                </div>
                ` : ''}
                <div class="footer">
                  <p><strong>${restaurant.name}</strong></p>
                  <p>QR Restaurant System</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      console.log('📨 Versuche E-Mail zu senden...');
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ E-Mail erfolgreich gesendet!');
      console.log('   Message ID:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ E-Mail Versand fehlgeschlagen:', error.message);
      console.error('   Code:', error.code);
      console.error('   Response:', error.response);
      return false;
    }
  }

  // Test-E-Mail
  async sendTestEmail(to) {
    console.log(`📧 Test-E-Mail an ${to}`);
    
    if (!nodemailer) {
      console.error('❌ nodemailer nicht installiert!');
      return false;
    }

    if (!this.transporter) {
      console.error('❌ E-Mail Transporter nicht initialisiert');
      this.initTransporter();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!this.transporter) {
        console.error('❌ E-Mail Service konnte nicht initialisiert werden');
        return false;
      }
    }

    try {
      console.log('📨 Sende Test-E-Mail...');
      const info = await this.transporter.sendMail({
        from: `"QR Restaurant Test" <${process.env.SMTP_USER}>`,
        to: to,
        subject: 'Test E-Mail - QR Restaurant System',
        text: 'Test E-Mail erfolgreich!',
        html: `
          <h2>Test E-Mail erfolgreich!</h2>
          <p>Der E-Mail-Versand funktioniert korrekt.</p>
          <p>Zeit: ${new Date().toLocaleString('de-DE')}</p>
        `
      });
      console.log('✅ Test-E-Mail gesendet!');
      console.log('   Message ID:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Test-E-Mail fehlgeschlagen:');
      console.error('   Fehler:', error.message);
      console.error('   Code:', error.code);
      console.error('   Command:', error.command);
      console.error('   Response:', error.response);
      return false;
    }
  }
}

module.exports = new EmailService();