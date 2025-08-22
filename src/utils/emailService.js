/**
 * Email Service
 * Speichern als: backend/src/utils/emailService.js
 */

const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class EmailService {
    constructor() {
        this.transporter = this.createTransporter();
        this.templates = {};
        this.loadTemplates();
    }

    createTransporter() {
        if (process.env.NODE_ENV === 'production') {
            // Production email configuration
            return nodemailer.createTransporter({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                }
            });
        } else {
            // Development - use Ethereal Email
            return nodemailer.createTransporter({
                host: 'smtp.ethereal.email',
                port: 587,
                auth: {
                    user: process.env.SMTP_USER || 'ethereal.user',
                    pass: process.env.SMTP_PASSWORD || 'ethereal.pass'
                }
            });
        }
    }

    async loadTemplates() {
        const templateDir = path.join(__dirname, '../templates/emails');
        
        try {
            // Load and compile templates
            const templates = {
                welcome: 'welcome.hbs',
                passwordReset: 'password-reset.hbs',
                subscriptionCreated: 'subscription-created.hbs',
                subscriptionExpiring: 'subscription-expiring.hbs',
                paymentSuccess: 'payment-success.hbs',
                paymentFailed: 'payment-failed.hbs',
                restaurantActivated: 'restaurant-activated.hbs',
                restaurantDeactivated: 'restaurant-deactivated.hbs'
            };

            // Note: In production, you would load actual template files
            // For now, we'll use simple templates
            this.templates = {
                welcome: this.getWelcomeTemplate(),
                passwordReset: this.getPasswordResetTemplate(),
                subscriptionCreated: this.getSubscriptionCreatedTemplate(),
                // Add more templates as needed
            };
        } catch (error) {
            logger.error('Failed to load email templates:', error);
        }
    }

    async sendMail(options) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_FROM || 'QR Restaurant <noreply@qr-restaurant.com>',
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            logger.logEmail(options.to, options.subject, 'sent');
            
            if (process.env.NODE_ENV === 'development') {
                logger.info('Email preview URL:', nodemailer.getTestMessageUrl(result));
            }
            
            return result;
        } catch (error) {
            logger.logEmail(options.to, options.subject, 'failed', error);
            throw error;
        }
    }

    async sendWelcomeEmail(user, restaurant, password) {
        const template = handlebars.compile(this.templates.welcome);
        const html = template({
            user,
            restaurant,
            password,
            loginUrl: `${process.env.FRONTEND_URL}/login`,
            year: new Date().getFullYear()
        });

        return this.sendMail({
            to: user.email,
            subject: 'Willkommen bei QR Restaurant',
            html
        });
    }

    async sendPasswordResetEmail(user, resetToken) {
        const template = handlebars.compile(this.templates.passwordReset);
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        const html = template({
            user,
            resetUrl,
            year: new Date().getFullYear()
        });

        return this.sendMail({
            to: user.email,
            subject: 'Passwort zurücksetzen - QR Restaurant',
            html
        });
    }

    async sendSubscriptionCreatedEmail(user, subscription, plan) {
        const template = handlebars.compile(this.templates.subscriptionCreated);
        const html = template({
            user,
            subscription,
            plan,
            dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
            year: new Date().getFullYear()
        });

        return this.sendMail({
            to: user.email,
            subject: 'Abonnement aktiviert - QR Restaurant',
            html
        });
    }

    async sendSubscriptionExpiringEmail(user, subscription, daysRemaining) {
        const subject = `Ihr Abonnement läuft in ${daysRemaining} Tagen ab`;
        const html = `
            <h2>Ihr Abonnement läuft bald ab</h2>
            <p>Hallo ${user.first_name || 'Kunde'},</p>
            <p>Ihr QR Restaurant Abonnement läuft in ${daysRemaining} Tagen ab.</p>
            <p>Bitte kontaktieren Sie uns, um Ihr Abonnement zu verlängern.</p>
        `;

        return this.sendMail({
            to: user.email,
            subject,
            html
        });
    }

    async sendPaymentSuccessEmail(user, payment, invoice) {
        const subject = `Zahlung erhalten - Rechnung ${invoice.invoice_number}`;
        const html = `
            <h2>Zahlung erfolgreich</h2>
            <p>Hallo ${user.first_name || 'Kunde'},</p>
            <p>Wir haben Ihre Zahlung in Höhe von €${payment.total_amount} erhalten.</p>
            <p>Rechnungsnummer: ${invoice.invoice_number}</p>
        `;

        return this.sendMail({
            to: user.email,
            subject,
            html
        });
    }

    // Template generators (simplified)
    getWelcomeTemplate() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f4f4f4; }
                    .footer { text-align: center; padding: 20px; color: #666; }
                    .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Willkommen bei QR Restaurant!</h1>
                    </div>
                    <div class="content">
                        <h2>Hallo {{user.first_name}}!</h2>
                        <p>Ihr Restaurant-Account wurde erfolgreich erstellt.</p>
                        <p><strong>Restaurant:</strong> {{restaurant.name}}</p>
                        <p><strong>E-Mail:</strong> {{user.email}}</p>
                        <p><strong>Passwort:</strong> {{password}}</p>
                        <p>Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.</p>
                        <p style="text-align: center; margin-top: 30px;">
                            <a href="{{loginUrl}}" class="button">Jetzt anmelden</a>
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; {{year}} QR Restaurant. Alle Rechte vorbehalten.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    getPasswordResetTemplate() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f4f4f4; }
                    .footer { text-align: center; padding: 20px; color: #666; }
                    .button { display: inline-block; padding: 10px 20px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Passwort zurücksetzen</h1>
                    </div>
                    <div class="content">
                        <h2>Hallo {{user.first_name}}!</h2>
                        <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.</p>
                        <p>Klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:</p>
                        <p style="text-align: center; margin-top: 30px;">
                            <a href="{{resetUrl}}" class="button">Passwort zurücksetzen</a>
                        </p>
                        <p><small>Dieser Link ist 30 Minuten gültig.</small></p>
                        <p>Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie bitte diese E-Mail.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; {{year}} QR Restaurant. Alle Rechte vorbehalten.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    getSubscriptionCreatedTemplate() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #28a745; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f4f4f4; }
                    .footer { text-align: center; padding: 20px; color: #666; }
                    .button { display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Abonnement aktiviert!</h1>
                    </div>
                    <div class="content">
                        <h2>Hallo {{user.first_name}}!</h2>
                        <p>Ihr {{plan.name}} Abonnement wurde erfolgreich aktiviert.</p>
                        <ul>
                            <li><strong>Plan:</strong> {{plan.name}}</li>
                            <li><strong>Preis:</strong> €{{plan.price_monthly}}/Monat</li>
                            <li><strong>Max. Tische:</strong> {{plan.limits.max_tables}}</li>
                            <li><strong>Max. Scans:</strong> {{plan.limits.max_scans_per_month}}/Monat</li>
                        </ul>
                        <p style="text-align: center; margin-top: 30px;">
                            <a href="{{dashboardUrl}}" class="button">Zum Dashboard</a>
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; {{year}} QR Restaurant. Alle Rechte vorbehalten.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
}

module.exports = new EmailService();