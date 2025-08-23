/**
 * Email Service - KORRIGIERTE VERSION
 * Speichern als: backend/src/services/email.service.js
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Prüfe ob alle erforderlichen Umgebungsvariablen vorhanden sind
      const requiredVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.error('❌ E-Mail-Service nicht konfiguriert. Fehlende Variablen:', missingVars.join(', '));
        this.isConfigured = false;
        return;
      }

      console.log('📧 Initialisiere E-Mail-Service...');
      console.log('   SMTP_HOST:', process.env.SMTP_HOST);
      console.log('   SMTP_PORT:', process.env.SMTP_PORT);
      console.log('   SMTP_USER:', process.env.SMTP_USER);

      // WICHTIG: createTransport statt createTransporter!
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_PORT == 465, // true für Port 465
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false, // für selbst-signierte Zertifikate
          minVersion: 'TLSv1.2'
        },
        connectionTimeout: 30000, // 30 Sekunden
        greetingTimeout: 30000,
        socketTimeout: 30000
      });

      // Verifiziere die Verbindung
      try {
        await this.transporter.verify();
        console.log('✅ E-Mail-Service erfolgreich initialisiert und verifiziert!');
        this.isConfigured = true;
      } catch (verifyError) {
        console.error('⚠️ E-Mail-Service Verifikation fehlgeschlagen:', verifyError.message);
        console.log('   Versuche trotzdem E-Mails zu senden...');
        this.isConfigured = true; // Trotzdem als konfiguriert markieren
      }
      
    } catch (error) {
      console.error('❌ E-Mail-Service Initialisierung fehlgeschlagen:', error.message);
      this.isConfigured = false;
    }
  }

  async sendNewReviewNotification(restaurant, table, reviewData) {
    console.log(`🌟 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);

    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail Service nicht bereit');
      await this.initializeTransporter(); // Versuche erneut zu initialisieren
      
      if (!this.isConfigured) {
        return false;
      }
    }

    try {
      const ratingStars = reviewData.rating ? '⭐'.repeat(Math.min(reviewData.rating, 5)) : '';
      
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
              body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: #f5f5f5;
              }
              .header { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                padding: 40px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 28px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
              }
              .header p {
                margin: 10px 0 0 0;
                font-size: 18px;
                opacity: 0.95;
              }
              .content { 
                background: #fff; 
                padding: 30px; 
              }
              .review-box { 
                background: #f8f9fa; 
                padding: 25px; 
                border-radius: 10px; 
                margin: 20px 0; 
                border-left: 5px solid #667eea;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
              }
              .rating { 
                font-size: 32px; 
                color: #ffc107; 
                margin: 10px 0;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
              }
              .author { 
                font-weight: bold; 
                color: #495057; 
                font-size: 20px; 
                margin-bottom: 10px;
              }
              .review-text { 
                color: #6c757d; 
                font-style: italic; 
                line-height: 1.8; 
                margin: 15px 0;
                padding: 15px;
                background: white;
                border-radius: 5px;
                border: 1px solid #e9ecef;
              }
              .table-info { 
                background: #e3f2fd; 
                padding: 15px 20px; 
                border-radius: 8px; 
                margin-top: 20px; 
                border: 1px solid #90caf9;
              }
              .table-info strong {
                color: #1976d2;
                font-size: 16px;
              }
              .table-info small {
                color: #64b5f6;
                display: block;
                margin-top: 5px;
              }
              .timestamp {
                color: #999; 
                font-size: 14px; 
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #e9ecef;
              }
              .footer { 
                text-align: center; 
                margin-top: 30px; 
                padding: 20px;
                background: #f8f9fa;
                color: #6c757d; 
                font-size: 13px;
              }
              .footer strong {
                color: #495057;
                font-size: 16px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Neue Google Bewertung erhalten!</h1>
                <p>${restaurant.name}</p>
              </div>
              <div class="content">
                <div class="review-box">
                  ${reviewData.rating ? `<div class="rating">${'⭐'.repeat(Math.min(reviewData.rating, 5))}</div>` : ''}
                  ${reviewData.author ? `<div class="author">Bewertet von: ${reviewData.author}</div>` : ''}
                  ${reviewData.text ? `<div class="review-text">"${reviewData.text}"</div>` : '<div class="review-text">Keine Textbewertung hinterlassen</div>'}
                  <div class="timestamp">
                    📅 Erhalten am: ${new Date().toLocaleString('de-DE', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                ${table ? `
                <div class="table-info">
                  <strong>🍽️ Wahrscheinlich von Tisch ${table.table_number}</strong>
                  <small>Der Gast hat kürzlich den QR-Code dieses Tisches gescannt</small>
                </div>
                ` : ''}
              </div>
              <div class="footer">
                <strong>${restaurant.name}</strong><br>
                QR Restaurant Review System<br>
                <small>Diese E-Mail wurde automatisch generiert</small>
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
      console.log('   Response:', info.response);
      return true;
      
    } catch (error) {
      console.error('❌ E-Mail Versand fehlgeschlagen:', error.message);
      console.error('   Details:', {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
      return false;
    }
  }

  async sendTestEmail(to) {
    console.log(`📧 Sende Test-E-Mail an ${to}`);
    
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail Service nicht bereit');
      await this.initializeTransporter();
      
      if (!this.isConfigured) {
        return false;
      }
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"QR Restaurant Test" <${process.env.SMTP_USER}>`,
        to: to,
        subject: 'Test E-Mail - QR Restaurant System',
        text: 'Test E-Mail erfolgreich empfangen!',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">✅ Test E-Mail erfolgreich!</h2>
            <p>Der E-Mail-Versand funktioniert korrekt.</p>
            <p><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-DE')}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 12px;">
              Diese Test-E-Mail wurde vom QR Restaurant System gesendet.
            </p>
          </div>
        `
      });
      
      console.log('✅ Test-E-Mail erfolgreich gesendet!');
      console.log('   Message ID:', info.messageId);
      return true;
      
    } catch (error) {
      console.error('❌ Test-E-Mail fehlgeschlagen:', error.message);
      return false;
    }
  }

  // Methode zum erneuten Initialisieren (falls Verbindung verloren geht)
  async reconnect() {
    console.log('🔄 Versuche E-Mail-Service neu zu verbinden...');
    this.transporter = null;
    this.isConfigured = false;
    await this.initializeTransporter();
    return this.isConfigured;
  }
}

// Singleton-Pattern
module.exports = new EmailService();