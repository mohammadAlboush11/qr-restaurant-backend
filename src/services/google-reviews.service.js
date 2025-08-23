/**
 * Google Reviews Integration Service - KORRIGIERT
 * Speichern als: backend/src/services/google-reviews.service.js
 */

const axios = require('axios');
const { Restaurant, Scan, ActivityLog, Table } = require('../models');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class GoogleReviewsService {
    constructor() {
        this.checkInterval = process.env.REVIEW_CHECK_INTERVAL || 120000; // 2 Minuten
        this.isMonitoring = false;
        this.processedScans = new Set(); // Verhindert doppelte E-Mails
        this.lastReviewCounts = new Map(); // Speichert letzte bekannte Review-Zahlen
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        
        // Initial Check nach 10 Sekunden
        setTimeout(() => {
            this.checkForNewScans();
        }, 10000);
        
        // Dann alle 2 Minuten
        this.monitoringInterval = setInterval(() => {
            this.checkForNewScans();
        }, this.checkInterval);

        logger.info('âœ… Google Review Monitoring gestartet');
        logger.info(`   PrÃ¼fintervall: ${this.checkInterval / 60000} Minuten`);
        logger.info('   E-Mails nur bei neuen Scans (nicht bei QR-Erstellung)');
    }

    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        clearInterval(this.monitoringInterval);
        this.isMonitoring = false;
        this.processedScans.clear();
        
        logger.info('Google Reviews monitoring stopped');
    }

    /**
     * PrÃ¼ft auf neue Scans und sendet E-Mails
     */
    async checkForNewScans() {
        try {
            // Hole alle Scans der letzten 2 Minuten
            const recentScans = await Scan.findAll({
                where: {
                    created_at: {
                        [Op.gte]: new Date(Date.now() - this.checkInterval)
                    }
                },
                include: [
                    {
                        model: Table,
                        as: 'table',
                        required: false
                    },
                    {
                        model: Restaurant,
                        as: 'restaurant',
                        required: true,
                        where: {
                            is_active: true
                        }
                    }
                ],
                order: [['created_at', 'DESC']]
            });

            // Verarbeite jeden Scan
            for (const scan of recentScans) {
                // Skip wenn bereits verarbeitet
                if (this.processedScans.has(scan.id)) {
                    continue;
                }

                // Markiere als verarbeitet
                this.processedScans.add(scan.id);

                // Sende Scan-Benachrichtigung
                await this.sendScanNotification(scan);

                // Plane Follow-up nach 5 Minuten
                this.scheduleFollowUp(scan);
            }

            // Bereinige alte processedScans (Ã¤lter als 1 Stunde)
            if (this.processedScans.size > 100) {
                this.processedScans.clear();
            }

        } catch (error) {
            logger.error('Error checking for new scans:', error);
        }
    }

    /**
     * Sendet E-Mail-Benachrichtigung fÃ¼r neuen Scan
     */
    async sendScanNotification(scan) {
        try {
            const restaurant = scan.restaurant;
            const table = scan.table;
            
            // Bestimme E-Mail-EmpfÃ¤nger
            const recipientEmail = restaurant.contact?.email || 
                                 restaurant.owner?.email || 
                                 process.env.NOTIFICATION_EMAIL || 
                                 'mohammadalboush8@gmail.com';

            const emailData = {
                restaurant_name: restaurant.name,
                table_number: table?.number || 'Unbekannt',
                table_name: table?.name || `Tisch ${table?.number || 'Unbekannt'}`,
                scan_time: new Date(scan.created_at).toLocaleString('de-DE'),
                scan_id: scan.id,
                device_info: scan.device_info,
                google_url: restaurant.google_reviews_url
            };

            // Sende E-Mail
            await emailService.sendScanNotification(recipientEmail, emailData);
            
            logger.info(`ðŸ“§ Scan-Benachrichtigung gesendet an ${recipientEmail} fÃ¼r Tisch ${emailData.table_number}`);

            // Log Activity
            await ActivityLog.create({
                restaurant_id: restaurant.id,
                action: 'scan_notification_sent',
                category: 'email',
                metadata: {
                    table: emailData.table_number,
                    recipient: recipientEmail,
                    scan_id: scan.id
                }
            });

        } catch (error) {
            logger.error('Error sending scan notification:', error);
        }
    }

    /**
     * Plant Follow-up E-Mail nach 5 Minuten
     */
    scheduleFollowUp(scan) {
        setTimeout(async () => {
            try {
                const restaurant = scan.restaurant;
                const table = scan.table;
                
                const recipientEmail = restaurant.contact?.email || 
                                     restaurant.owner?.email || 
                                     process.env.NOTIFICATION_EMAIL || 
                                     'mohammadalboush8@gmail.com';

                const emailData = {
                    restaurant_name: restaurant.name,
                    table_number: table?.number || 'Unbekannt',
                    scan_time: new Date(scan.created_at).toLocaleString('de-DE'),
                    minutes_passed: 5,
                    probability: 'HOCH',
                    google_url: restaurant.google_reviews_url
                };

                // Sende Follow-up E-Mail
                await emailService.sendReviewProbability(recipientEmail, emailData);
                
                logger.info(`ðŸ“§ Follow-up E-Mail gesendet fÃ¼r Tisch ${emailData.table_number}`);

            } catch (error) {
                logger.error('Error sending follow-up email:', error);
            }
        }, 5 * 60 * 1000); // 5 Minuten
    }

    /**
     * DEAKTIVIERT: Alte fehlerhafte Methode
     */
    async checkRestaurantReviews(restaurant) {
        // Diese Methode ist deaktiviert, da sie falsche E-Mails sendet
        logger.debug('checkRestaurantReviews ist deaktiviert');
        return;
    }

    /**
     * Manuelle PrÃ¼fung fÃ¼r ein Restaurant (Admin-Funktion)
     */
    async manualCheck(restaurantId) {
        try {
            const restaurant = await Restaurant.findByPk(restaurantId, {
                include: ['owner']
            });

            if (!restaurant) {
                throw new Error('Restaurant nicht gefunden');
            }

            // Hole die letzten 5 Scans
            const recentScans = await Scan.findAll({
                where: {
                    restaurant_id: restaurantId,
                    created_at: {
                        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Letzte 24 Stunden
                    }
                },
                include: ['table'],
                order: [['created_at', 'DESC']],
                limit: 5
            });

            logger.info(`Manual check for ${restaurant.name}: ${recentScans.length} scans in last 24h`);

            return {
                restaurant: restaurant.name,
                scans_24h: recentScans.length,
                last_scan: recentScans[0]?.created_at || null
            };

        } catch (error) {
            logger.error('Error in manual check:', error);
            throw error;
        }
    }
}

module.exports = new GoogleReviewsService();