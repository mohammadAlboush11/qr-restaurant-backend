const nodemailer = require('nodemailer');

// E-Mail Transporter konfigurieren
let transporter = null;

const initTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.strato.de',
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // Für Strato wichtig
      }
    });
  }
  return transporter;
};

// E-Mail bei QR-Code Scan (OHNE Google API)
const sendScanNotification = async (restaurant, table) => {
  try {
    const transport = initTransporter();
    
    const mailOptions = {
      from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
      to: restaurant.email,
      subject: `🔔 QR-Code gescannt - Tisch ${table.table_number}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
            .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎯 QR-Code Scan Benachrichtigung</h1>
            </div>
            
            <div class="content">
              <h2>Ein Gast möchte Ihr Restaurant bewerten!</h2>
              
              <div class="info-box">
                <p><strong>📍 Tisch:</strong> ${table.table_number}</p>
                <p><strong>🕐 Zeit:</strong> ${new Date().toLocaleString('de-DE')}</p>
                <p><strong>📊 Scan-Nummer:</strong> #${table.scan_count || 1}</p>
              </div>
              
              <p>Ein Gast hat den QR-Code auf <strong>Tisch ${table.table_number}</strong> gescannt und wurde zu Ihrer Google Bewertungsseite weitergeleitet.</p>
              
              <p><strong>Was bedeutet das?</strong></p>
              <ul>
                <li>Der Gast ist interessiert, eine Bewertung abzugeben</li>
                <li>In den nächsten Minuten könnte eine neue Google-Bewertung erscheinen</li>
                <li>Dies ist eine gute Gelegenheit, den Gast persönlich zu bedanken</li>
              </ul>
              
              <div style="background-color: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 20px;">
                <p style="margin: 0;"><strong>💡 Tipp:</strong> Bedanken Sie sich beim Gast für sein Interesse. Ein persönliches Dankeschön kann zu einer positiveren Bewertung führen!</p>
              </div>
            </div>
            
            <div class="footer">
              <p>Diese Benachrichtigung wurde automatisch generiert.</p>
              <p>QR Restaurant System - ${new Date().getFullYear()}</p>
              <p style="color: #999;">Spam-Schutz: Mehrfache Scans innerhalb von 5 Minuten lösen keine weitere E-Mail aus.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log('✅ Scan-Benachrichtigung gesendet:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ E-Mail Fehler:', error);
    return false;
  }
};

// Willkommens-E-Mail
const sendWelcomeEmail = async (restaurant, loginCredentials) => {
  try {
    const transport = initTransporter();
    
    const mailOptions = {
      from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
      to: restaurant.email,
      subject: '✨ Willkommen beim QR Restaurant System',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
            .credentials { background-color: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Willkommen ${restaurant.name}!</h1>
            </div>
            
            <div class="content">
              <p>Ihr Restaurant wurde erfolgreich im QR Restaurant System registriert.</p>
              
              <div class="credentials">
                <h3>🔐 Ihre Zugangsdaten:</h3>
                <p><strong>URL:</strong> https://lt-express.de</p>
                <p><strong>E-Mail:</strong> ${loginCredentials.email}</p>
                <p><strong>Passwort:</strong> ${loginCredentials.password}</p>
                <p style="color: red;"><strong>Wichtig:</strong> Bitte ändern Sie Ihr Passwort nach dem ersten Login!</p>
              </div>
              
              <h3>📋 Erste Schritte:</h3>
              <ol>
                <li>Melden Sie sich mit Ihren Zugangsdaten an</li>
                <li>Gehen Sie zu "Einstellungen" und tragen Sie Ihre Google Business URL ein</li>
                <li>Erstellen Sie unter "Tische & QR-Codes" Ihre Tisch-QR-Codes</li>
                <li>Drucken Sie die QR-Codes aus und platzieren Sie sie auf den Tischen</li>
              </ol>
              
              <h3>🎯 So funktioniert's:</h3>
              <ul>
                <li>Gäste scannen den QR-Code auf ihrem Tisch</li>
                <li>Sie werden direkt zu Ihrer Google Bewertungsseite weitergeleitet</li>
                <li>Sie erhalten eine E-Mail-Benachrichtigung bei jedem Scan</li>
                <li>Verfolgen Sie die Anzahl der Scans in Ihrem Dashboard</li>
              </ul>
            </div>
            
            <div class="footer">
              <p>Bei Fragen wenden Sie sich an den Administrator.</p>
              <p>QR Restaurant System - ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log('✅ Willkommens-E-Mail gesendet:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ E-Mail Fehler:', error);
    return false;
  }
};

// Test E-Mail
const sendTestEmail = async (toEmail) => {
  try {
    const transport = initTransporter();
    
    const mailOptions = {
      from: `"QR Restaurant System" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: '✅ Test E-Mail - QR Restaurant System',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test E-Mail erfolgreich!</h2>
          <p>Wenn Sie diese E-Mail erhalten, funktioniert der E-Mail-Versand korrekt.</p>
          <p>Zeitstempel: ${new Date().toLocaleString('de-DE')}</p>
        </div>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log('✅ Test-E-Mail gesendet:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Test-E-Mail Fehler:', error);
    throw error;
  }
};

module.exports = {
  sendScanNotification,
  sendWelcomeEmail,
  sendTestEmail,
  sendReviewNotification: sendScanNotification // Alias für Kompatibilität
};