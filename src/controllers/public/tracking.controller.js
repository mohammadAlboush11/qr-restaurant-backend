/**
 * Tracking Controller
 * Speichern als: backend/src/controllers/public/tracking.controller.js
 */

const { QRCode, Scan, Table, Restaurant } = require('../../models');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// Track QR code scan and redirect
const trackScan = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { ref, source } = req.query;

    try {
        // Find QR code by token
        const qrCode = await QRCode.findOne({
            where: { token },
            include: [
                {
                    model: Table,
                    as: 'table'
                },
                {
                    model: Restaurant,
                    as: 'restaurant'
                }
            ]
        });

        if (!qrCode) {
            logger.warn(`Invalid QR code token: ${token}`);
            return res.redirect(`${process.env.FRONTEND_URL}/error?code=invalid_qr`);
        }

        if (!qrCode.is_active) {
            return res.redirect(`${process.env.FRONTEND_URL}/error?code=inactive_qr`);
        }

        if (!qrCode.restaurant.is_active) {
            return res.redirect(`${process.env.FRONTEND_URL}/error?code=inactive_restaurant`);
        }

        // Create scan record
        const scan = await Scan.create({
            qr_code_id: qrCode.id,
            table_id: qrCode.table_id,
            restaurant_id: qrCode.restaurant_id,
            ip_address: req.ip || req.connection.remoteAddress,
            user_agent: req.get('user-agent'),
            referer: ref || req.get('referer'),
            source: source || 'direct',
            language: req.get('accept-language')?.split(',')[0],
            device_info: this.parseDeviceInfo(req.get('user-agent')),
            location_data: await this.getLocationFromIP(req.ip)
        });

        // Update QR code statistics
        await qrCode.incrementScanCount();
        
        // Update table statistics
        if (qrCode.table) {
            await qrCode.table.incrementScanCount();
        }

        // Build redirect URL with tracking parameters
        let redirectUrl = qrCode.restaurant.google_reviews_url;
        
        if (!redirectUrl) {
            redirectUrl = `${process.env.FRONTEND_URL}/restaurant/${qrCode.restaurant.slug}/review`;
        }

        // Add UTM parameters for tracking
        const url = new URL(redirectUrl);
        url.searchParams.set('utm_source', 'qr_code');
        url.searchParams.set('utm_medium', 'table');
        url.searchParams.set('utm_campaign', qrCode.restaurant.slug);
        url.searchParams.set('table', qrCode.table?.number || 'unknown');

        logger.info(`QR scan tracked`, {
            restaurantId: qrCode.restaurant_id,
            tableId: qrCode.table_id,
            scanId: scan.id
        });

        // Redirect to Google Reviews or custom review page
        res.redirect(url.toString());

    } catch (error) {
        logger.error('Error tracking scan', error);
        res.redirect(`${process.env.FRONTEND_URL}/error?code=tracking_error`);
    }
});

// Helper methods
const parseDeviceInfo = (userAgent) => {
    if (!userAgent) return null;

    const deviceInfo = {
        type: 'unknown',
        os: 'unknown',
        browser: 'unknown'
    };

    // Detect device type
    if (/mobile/i.test(userAgent)) {
        deviceInfo.type = 'mobile';
    } else if (/tablet/i.test(userAgent)) {
        deviceInfo.type = 'tablet';
    } else {
        deviceInfo.type = 'desktop';
    }

    // Detect OS
    if (/android/i.test(userAgent)) {
        deviceInfo.os = 'Android';
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
        deviceInfo.os = 'iOS';
    } else if (/windows/i.test(userAgent)) {
        deviceInfo.os = 'Windows';
    } else if (/mac/i.test(userAgent)) {
        deviceInfo.os = 'macOS';
    } else if (/linux/i.test(userAgent)) {
        deviceInfo.os = 'Linux';
    }

    // Detect browser
    if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) {
        deviceInfo.browser = 'Chrome';
    } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
        deviceInfo.browser = 'Safari';
    } else if (/firefox/i.test(userAgent)) {
        deviceInfo.browser = 'Firefox';
    } else if (/edge/i.test(userAgent)) {
        deviceInfo.browser = 'Edge';
    }

    return deviceInfo;
};

const getLocationFromIP = async (ip) => {
    // In Production würde hier ein IP-Geolocation Service verwendet
    // Für Demo-Zwecke geben wir null zurück
    return null;
};

// Public stats endpoint (optional)
const getPublicStats = asyncHandler(async (req, res) => {
    const { token } = req.params;

    const qrCode = await QRCode.findOne({
        where: { token },
        attributes: ['scan_count', 'last_scan_at'],
        include: [{
            model: Restaurant,
            as: 'restaurant',
            attributes: ['name', 'slug']
        }]
    });

    if (!qrCode) {
        throw new AppError('QR-Code nicht gefunden', 404);
    }

    res.json({
        success: true,
        data: {
            restaurant: qrCode.restaurant.name,
            totalScans: qrCode.scan_count,
            lastScan: qrCode.last_scan_at
        }
    });
});

module.exports = {
    trackScan,
    getPublicStats,
    parseDeviceInfo,
    getLocationFromIP
};