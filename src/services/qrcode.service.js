/**
 * QR Code Service
 * Speichern als: backend/src/services/qrcode.service.js
 */

const crypto = require('crypto');
const { QRCode, Table, Restaurant, Scan } = require('../models');
const environment = require('../config/environment');
const emailService = require('./email.service');

class QRCodeService {
    /**
     * Erstelle QR-Code fÃ¼r Tisch
     */
    async createQRCode(tableId, restaurantId, userId) {
        try {
            // Generiere einzigartigen Token
            const token = this.generateToken();
            
            // Hole Restaurant-Details
            const restaurant = await Restaurant.findByPk(restaurantId);
            const table = await Table.findByPk(tableId);
            
            if (!restaurant || !table) {
                throw new Error('Restaurant oder Tisch nicht gefunden');
            }
            
            // Erstelle tracking URL basierend auf Environment
            const trackingUrl = environment.getQRCodeUrl(restaurant, table, token);
            
            // Erstelle QR-Code Eintrag
            const qrCode = await QRCode.create({
                table_id: tableId,
                restaurant_id: restaurantId,
                token: token,
                short_code: `${restaurant.slug}-T${table.number}`,
                tracking_url: trackingUrl,
                redirect_url: restaurant.google_reviews_url || this.getDefaultGoogleUrl(restaurant),
                style: {
                    color: '#000000',
                    backgroundColor: '#FFFFFF',
                    errorCorrectionLevel: 'M',
                    margin: 2,
                    width: 256
                },
                is_active: true,
                created_by: userId
            });
            
            console.log(`âœ… QR-Code erstellt fÃ¼r ${restaurant.name} - Tisch ${table.number}`);
            console.log(`   Tracking URL: ${trackingUrl}`);
            
            return qrCode;
            
        } catch (error) {
            console.error('Fehler beim Erstellen des QR-Codes:', error);
            throw error;
        }
    }
    
    /**
     * Verarbeite QR-Code Scan
     */
    async processScan(token, request) {
        try {
            // Finde QR-Code mit allen Details
            const qrCode = await QRCode.findOne({
                where: { token, is_active: true },
                include: [
                    { 
                        model: Table, 
                        as: 'table',
                        attributes: ['id', 'number', 'name', 'location']
                    },
                    { 
                        model: Restaurant, 
                        as: 'restaurant',
                        attributes: ['id', 'name', 'slug', 'google_reviews_url', 'settings']
                    }
                ]
            });
            
            if (!qrCode) {
                console.log(`âš ï¸ QR-Code nicht gefunden: ${token}`);
                return {
                    success: false,
                    redirectUrl: this.getFallbackUrl()
                };
            }
            
            // Erstelle Scan-Eintrag
            const scan = await this.recordScan(qrCode, request);
            
            // Sende Benachrichtigung
            await this.sendScanNotification(qrCode, scan, request);
            
            // Plane Follow-up
            this.scheduleFollowUp(qrCode, scan);
            
            return {
                success: true,
                redirectUrl: qrCode.redirect_url || qrCode.restaurant.google_reviews_url,
                restaurant: qrCode.restaurant.name,
                table: qrCode.table.number
            };
            
        } catch (error) {
            console.error('Fehler beim Verarbeiten des Scans:', error);
            return {
                success: false,
                redirectUrl: this.getFallbackUrl()
            };
        }
    }
    
    /**
     * Zeichne Scan auf
     */
    async recordScan(qrCode, request) {
        const scan = await Scan.create({
            qr_code_id: qrCode.id,
            table_id: qrCode.table_id,
            restaurant_id: qrCode.restaurant_id,
            ip_address: request.ip || 'unknown',
            user_agent: request.get('user-agent') || 'unknown',
            device_info: this.parseDeviceInfo(request.get('user-agent')),
            created_at: new Date()
        });
        
        // Update QR-Code Statistiken
        await qrCode.increment('scan_count');
        await qrCode.update({ last_scan_at: new Date() });
        
        console.log(`ðŸ“Š Scan #${qrCode.scan_count + 1} fÃ¼r ${qrCode.restaurant.name} - Tisch ${qrCode.table.number}`);
        
        return scan;
    }
    
    /**
     * Sende Scan-Benachrichtigung
     */
    async sendScanNotification(qrCode, scan, request) {
        const emailData = {
            restaurant: qrCode.restaurant.name,
            tableNumber: qrCode.table.number,
            tableName: qrCode.table.name,
            scanCount: qrCode.scan_count + 1,
            timestamp: new Date(),
            device: this.parseDeviceInfo(request.get('user-agent')),
            ip: request.ip
        };
        
        // Sende an Restaurant-spezifische Email oder Default
        const notificationEmail = qrCode.restaurant.settings?.notification_email || 
                                 environment.EMAIL_CONFIG.notificationEmail;
        
        await emailService.sendScanNotification(notificationEmail, emailData);
    }
    
    /**
     * Plane Follow-up Check
     */
    scheduleFollowUp(qrCode, scan) {
        // Nach 5 Minuten prÃ¼fen
        setTimeout(async () => {
            await emailService.sendReviewProbability(
                qrCode.restaurant.settings?.notification_email || environment.EMAIL_CONFIG.notificationEmail,
                {
                    restaurant: qrCode.restaurant.name,
                    tableNumber: qrCode.table.number,
                    scanTime: scan.created_at,
                    probability: 'HOCH'
                }
            );
        }, 5 * 60 * 1000);
    }
    
    /**
     * Generiere sicheren Token
     */
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    /**
     * Parse Device Info
     */
    parseDeviceInfo(userAgent) {
        const isMobile = /mobile/i.test(userAgent);
        let browser = 'Unknown';
        
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Edge')) browser = 'Edge';
        
        return {
            type: isMobile ? 'mobile' : 'desktop',
            browser: browser,
            userAgent: userAgent
        };
    }
    
    /**
     * Get Default Google URL
     */
    getDefaultGoogleUrl(restaurant) {
        // Generiere Google Suche URL basierend auf Restaurant Name
        const searchQuery = encodeURIComponent(restaurant.name);
        return `https://www.google.com/search?q=${searchQuery}+reviews`;
    }
    
    /**
     * Fallback URL wenn nichts funktioniert
     */
    getFallbackUrl() {
        return 'https://www.google.com/search?q=chilln+beef+reviews';
    }
}

module.exports = new QRCodeService();