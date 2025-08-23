/**
 * Email Service - KORRIGIERT MIT RICHTIGEM IMPORT
 * Speichern als: backend/src/services/email.service.js
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
  console.log('✅ nodemailer Modul erfolgreich geladen');
} catch (error) {
  console.error('❌ KRITISCH: nodemailer konnte nicht geladen werden!');
  console.error('   Installieren mit: npm install nodemailer');
  process.exit(1); // Beende wenn nodemailer nicht verfügbar
}

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    // Initialisierung beim Start
    this.initTransporter();
  }

  initTransporter() {
    try {
      // Prüfe ob alle erforderlichen Umgebungsvariablen vorhanden sind
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️ E-Mail-Service nicht konfiguriert (SMTP_USER oder SMTP_PASS fehlt)');
        this.isConfigured = false;
        return;
      }

      console.log('📧 Initialisiere E-Mail-Service...');
      console.log('   SMTP_USER:', process.env.SMTP_USER);
      console.log('   SMTP_HOST:', process.env.SMTP_HOST || 'smtp.strato.de');
      console.log('   SMTP_PORT:', process.env.SMTP_PORT || 465);

      // WICHTIG: Verwende createTransport (nicht createTransporter!)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.strato.de',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: true, // true für Port 465
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
      });

      // Verifiziere die Verbindung asynchron
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('⚠️ E-Mail-Service Verifikation fehlgeschlagen:');
          console.error('   Fehler:', error.message);
          console.error('   Code:', error.code);
          console.log('   Versuche trotzdem E-Mails zu senden...');
          this.isConfigured = true; // Trotzdem als konfiguriert markieren
        } else {
          console.log('✅ E-Mail-Service erfolgreich verifiziert!');
          this.isConfigured = true;
        }
      });

      // Sofort als konfiguriert markieren für erste Versuche
      this.isConfigured = true;
      
    } catch (error) {
      console.error('❌ E-Mail-Service Initialisierung fehlgeschlagen:', error.message);
      console.error('   Stack:', error.stack);
      this.isConfigured = false;
    }
  }

  async sendNewReviewNotification(restaurant, table, reviewData) {
    console.log(`🌟 Sende E-Mail für NEUE BEWERTUNG an ${restaurant.email}`);

    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail Service nicht bereit');
      // Versuche erneut zu initialisieren
      this.initTransporter();
      
      if (!this.isConfigured) {
        console.error('❌ E-Mail Service konnte nicht initialisiert werden');
        return false;
      }
    }

    try {
      const ratingStars = reviewData.rating ? '⭐'.repeat(Math.min(reviewData.rating, 5)) : '';
      
      const mailOptions = {
        from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
        to: restaurant.email,
        subject: `🎉 Neue Google Bewertung erhalten! ${ratingStars}`,
        text: `Neue Bewertung erhalten!\n\nVon: ${reviewData.author || 'Anonym'}\nBewertung: ${ratingStars}\nText: ${reviewData.text || 'Keine Textbewertung'}\n\nZeit: ${new Date().toLocaleString('de-DE')}`,
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
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 20px auto; 
                background: white;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
              }
              .header { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                padding: 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 26px;
              }
              .header p {
                margin: 10px 0 0 0;
                font-size: 16px;
                opacity: 0.9;
              }
              .content { 
                padding: 30px; 
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
                line-height: 1.6; 
                margin: 15px 0;
                padding: 15px;
                background: white;
                border-radius: 5px;
              }
              .table-info { 
                background: #e3f2fd; 
                padding: 15px; 
                border-radius: 8px; 
                margin-top: 20px; 
                border: 1px solid #90caf9;
              }
              .footer { 
                text-align: center; 
                padding: 20px;
                background: #f8f9fa;
                color: #6c757d; 
                font-size: 12px;
                border-top: 1px solid #dee2e6;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Neue Google Bewertung!</h1>
                <p>${restaurant.name}</p>
              </div>
              <div class="content">
                <div class="review-box">
                  ${reviewData.rating ? `<div class="rating">${'⭐'.repeat(Math.min(reviewData.rating, 5))}</div>` : ''}
                  ${reviewData.author ? `<div class="author">Von: ${reviewData.author}</div>` : ''}
                  ${reviewData.text ? `<div class="review-text">"${reviewData.text}"</div>` : '<div class="review-text">Keine Textbewertung hinterlassen</div>'}
                  <div style="color: #999; font-size: 14px; margin-top: 15px;">
                    📅 ${new Date().toLocaleString('de-DE', {
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
                  <strong>🍽️ Wahrscheinlich von Tisch ${table.table_number}</strong><br>
                  <small style="color: #666;">QR-Code dieses Tisches wurde kürzlich gescannt</small>
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

      console.log('📨 Sende E-Mail...');
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ E-Mail erfolgreich gesendet!');
      console.log('   Message ID:', info.messageId);
      if (info.response) {
        console.log('   Server Response:', info.response);
      }
      return true;
      
    } catch (error) {
      console.error('❌ E-Mail Versand fehlgeschlagen:', error.message);
      if (error.code) {
        console.error('   Error Code:', error.code);
      }
      if (error.response) {
        console.error('   Server Response:', error.response);
      }
      if (error.command) {
        console.error('   SMTP Command:', error.command);
      }
      return false;
    }
  }

  async sendTestEmail(to) {
    console.log(`📧 Sende Test-E-Mail an ${to}`);
    
    if (!this.isConfigured || !this.transporter) {
      console.error('❌ E-Mail Service nicht bereit');
      this.initTransporter();
      
      // Warte kurz auf Initialisierung
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!this.isConfigured) {
        console.error('❌ E-Mail Service konnte nicht initialisiert werden');
        return false;
      }
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"QR Restaurant Test" <${process.env.SMTP_USER}>`,
        to: to,
        subject: 'Test E-Mail - QR Restaurant System',
        text: 'Diese Test-E-Mail bestätigt, dass der E-Mail-Versand funktioniert!',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
            <h2 style="color: #667eea;">✅ Test E-Mail erfolgreich!</h2>
            <p style="color: #333;">Der E-Mail-Versand funktioniert korrekt.</p>
            <p style="color: #666;"><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-DE')}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
            <p style="color: #999; font-size: 12px;">
              Diese Test-E-Mail wurde vom QR Restaurant System gesendet.<br>
              SMTP-Server: ${process.env.SMTP_HOST || 'smtp.strato.de'}
            </p>
          </div>
        `
      });
      
      console.log('✅ Test-E-Mail erfolgreich gesendet!');
      console.log('   Message ID:', info.messageId);
      if (info.accepted && info.accepted.length > 0) {
        console.log('   Akzeptiert für:', info.accepted.join(', '));
      }
      return true;
      
    } catch (error) {
      console.error('❌ Test-E-Mail fehlgeschlagen:', error.message);
      if (error.code === 'EAUTH') {
        console.error('   → Authentifizierungsfehler: Prüfen Sie SMTP_USER und SMTP_PASS');
      } else if (error.code === 'ECONNECTION') {
        console.error('   → Verbindungsfehler: Prüfen Sie SMTP_HOST und SMTP_PORT');
      }
      return false;
    }
  }

  // Methode zum erneuten Verbinden
  async reconnect() {
    console.log('🔄 E-Mail-Service neu verbinden...');
    this.transporter = null;
    this.isConfigured = false;
    this.initTransporter();
    
    // Warte auf Initialisierung
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return this.isConfigured;
  }

  // Status abrufen
  getStatus() {
    return {
      isConfigured: this.isConfigured,
      hasTransporter: !!this.transporter,
      smtpHost: process.env.SMTP_HOST || 'smtp.strato.de',
      smtpPort: process.env.SMTP_PORT || 465,
      smtpUser: process.env.SMTP_USER || 'nicht konfiguriert'
    };
  }
}

// Singleton-Export
module.exports = new EmailService();