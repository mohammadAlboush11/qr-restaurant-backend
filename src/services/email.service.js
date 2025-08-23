const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    // WICHTIG: Verzögerte Initialisierung für Environment Variables
    setTimeout(() => {
      this.initTransporter();
    }, 100);
  }

  async initTransporter() {
    try {
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️  E-Mail-Service nicht konfiguriert (SMTP_USER oder SMTP_PASS fehlt)');
        this.isConfigured = false;
        return;
      }

      console.log('📧 Initialisiere E-Mail-Service...');
      console.log('   SMTP_USER:', process.env.SMTP_USER);
      console.log('   SMTP_HOST:', process.env.SMTP_HOST || 'smtp.strato.de');

      this.transporter = nodemailer.createTransporter({
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

      // WICHTIG: Warte auf Verifikation
      try {
        await this.transporter.verify();
        console.log('✅ E-Mail-Service bereit und verifiziert!');
        this.isConfigured = true;
      } catch (verifyError) {
        console.error('❌ E-Mail-Service Verifikation fehlgeschlagen:', verifyError.message);
        console.error('   Prüfen Sie SMTP_USER und SMTP_PASS');
        this.isConfigured = false;
      }
    } catch (error) {
      console.error('❌ E-Mail-Service Initialisierung fehlgeschlagen:', error);
      this.isConfigured = false;
    }
  }

  // Warte bis Service bereit ist
  async waitForReady() {
    if (this.isConfigured) return true;
    
    // Warte max. 5 Sekunden
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.isConfigured) return true;
    }
    
    return false;
  }

  // NEUE METHODE: NUR für echte Bewertungen!
  async sendNewReviewNotification(restaurant, table, reviewData) {
    console.log(`🌟 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);

    // Warte bis Service bereit
    const ready = await this.waitForReady();
    
    if (!ready || !this.transporter) {
      console.error('❌ E-Mail-Service nicht bereit');
      console.error('   isConfigured:', this.isConfigured);
      console.error('   transporter:', !!this.transporter);
      return false;
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
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
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
                border: 1px solid #e0e0e0; 
                border-radius: 0 0 10px 10px; 
              }
              .review-box { 
                background: #f8f9fa; 
                padding: 20px; 
                border-radius: 8px; 
                margin: 20px 0; 
                border-left: 4px solid #667eea;
              }
              .rating { 
                font-size: 28px; 
                color: #ffc107; 
                margin: 10px 0; 
              }
              .author { 
                font-weight: bold; 
                color: #495057; 
                font-size: 18px;
                margin-bottom: 10px; 
              }
              .review-text { 
                color: #6c757d; 
                font-style: italic; 
                line-height: 1.5;
                margin: 15px 0;
              }
              .table-info { 
                background: #e3f2fd; 
                padding: 15px; 
                border-radius: 5px; 
                margin-top: 20px;
                border: 1px solid #90caf9;
              }
              .success-badge {
                display: inline-block;
                background: #28a745;
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                font-weight: bold;
                margin: 10px 0;
              }
              .button {
                display: inline-block;
                padding: 12px 30px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 2px solid #e0e0e0;
                color: #6c757d;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🎉 Neue Google Bewertung!</h1>
                <p style="margin: 10px 0 0 0; font-size: 18px;">
                  ${restaurant.name} wurde bewertet
                </p>
              </div>
              
              <div class="content">
                <div class="success-badge">✅ ECHTE BEWERTUNG ERKANNT</div>
                
                <div class="review-box">
                  ${reviewData.rating ? `<div class="rating">${'⭐'.repeat(reviewData.rating)}</div>` : ''}
                  ${reviewData.author ? `<div class="author">Von: ${reviewData.author}</div>` : ''}
                  ${reviewData.text ? `<div class="review-text">"${reviewData.text}"</div>` : ''}
                  <div style="color: #999; font-size: 14px; margin-top: 10px;">
                    ${reviewData.time ? new Date(reviewData.time).toLocaleString('de-DE') : new Date().toLocaleString('de-DE')}
                  </div>
                </div>
                
                ${table ? `
                <div class="table-info">
                  <strong>📍 Wahrscheinlich von Tisch ${table.table_number}</strong><br>
                  <small style="color: #666;">
                    Der Gast hat kürzlich den QR-Code dieses Tisches gescannt
                  </small>
                </div>
                ` : ''}
                
                <div style="text-align: center;">
                  <a href="${restaurant.google_business_url || '#'}" class="button">
                    Bewertung bei Google ansehen →
                  </a>
                </div>
                
                <div class="footer">
                  <p><strong>${restaurant.name}</strong></p>
                  <p>Diese E-Mail wurde automatisch generiert, weil eine neue Google-Bewertung erkannt wurde.</p>
                  <p>QR Restaurant System - Powered by lt-express.de</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      console.log('📨 Sende E-Mail...');
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Bewertungs-E-Mail erfolgreich gesendet!');
      console.log('   Message ID:', info.messageId);
      console.log('   Response:', info.response);
      return true;
    } catch (error) {
      console.error('❌ E-Mail Versand fehlgeschlagen:', error.message);
      console.error('   Code:', error.code);
      console.error('   Command:', error.command);
      return false;
    }
  }

  // Test-E-Mail
  async sendTestEmail(to) {
    const ready = await this.waitForReady();
    
    if (!ready || !this.transporter) {
      console.error('❌ E-Mail-Service nicht bereit für Test');
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