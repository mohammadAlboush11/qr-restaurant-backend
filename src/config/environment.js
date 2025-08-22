/**
 * Environment Configuration
 * Speichern als: backend/src/config/environment.js
 */

const os = require('os');

class EnvironmentConfig {
    constructor() {
        this.NODE_ENV = process.env.NODE_ENV || 'development';
        this.PORT = process.env.PORT || 3001;
        
        // Bestimme Base URL basierend auf Environment
        this.BASE_URL = this.determineBaseUrl();
        
        // Email Config
        this.EMAIL_CONFIG = {
            service: 'gmail',
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            notificationEmail: process.env.NOTIFICATION_EMAIL || 'qmnachhilfe@gmail.com'
        };
        
        // Google Reviews Base URL (kann pro Restaurant angepasst werden)
        this.GOOGLE_REVIEWS_BASE = 'https://www.google.com/search';
    }

    determineBaseUrl() {
        // 1. Production: Verwende explizite URL
        if (process.env.NODE_ENV === 'production') {
            return process.env.BASE_URL || 'https://qr-restaurant.com';
        }
        
        // 2. Staging/Test: Verwende gesetzte URL
        if (process.env.BASE_URL) {
            return process.env.BASE_URL;
        }
        
        // 3. Development: Verwende ngrok wenn verfügbar
        if (process.env.NGROK_URL) {
            return process.env.NGROK_URL;
        }
        
        // 4. Local Development: Verwende lokale IP
        const localIP = this.getLocalIP();
        return `http://${localIP}:${this.PORT}`;
    }

    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }

    isDevelopment() {
        return this.NODE_ENV === 'development';
    }

    isProduction() {
        return this.NODE_ENV === 'production';
    }

    getTrackingUrl(token) {
        return `${this.BASE_URL}/track/${token}`;
    }

    getQRCodeUrl(restaurant, table, token) {
        // In Production: Verwende Subdomain oder Path
        if (this.isProduction()) {
            // Option 1: Subdomain (restaurant.qr-system.com)
            // return `https://${restaurant.slug}.qr-system.com/t/${token}`;
            
            // Option 2: Path-based
            return `${this.BASE_URL}/r/${restaurant.slug}/t/${token}`;
        }
        
        // Development
        return `${this.BASE_URL}/track/${token}`;
    }
}

module.exports = new EnvironmentConfig();