/**
 * Rate Limiting Middleware
 * Speichern als: backend/src/middleware/rateLimiter.js
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

// Create different rate limiters for different endpoints
const createRateLimiter = (options = {}) => {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Zu viele Anfragen von dieser IP, bitte versuchen Sie es später erneut',
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.logSecurity('rate_limit_exceeded', {
                ip: req.ip,
                path: req.path,
                userId: req.user?.id
            });
            
            res.status(429).json({
                success: false,
                message: options.message || 'Zu viele Anfragen, bitte versuchen Sie es später erneut',
                retryAfter: req.rateLimit.resetTime
            });
        }
    };

    const limiterOptions = { ...defaultOptions, ...options };

    // Use Redis store if available
    if (redisClient && redisClient.isOpen) {
        limiterOptions.store = new RedisStore({
            client: redisClient,
            prefix: 'rate_limit:'
        });
    }

    return rateLimit(limiterOptions);
};

// General API rate limiter
const rateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100
});

// Strict rate limiter for auth endpoints
const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Zu viele Anmeldeversuche, bitte versuchen Sie es in 15 Minuten erneut',
    skipSuccessfulRequests: true
});

// Rate limiter for password reset
const passwordResetRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Zu viele Passwort-Reset-Anfragen, bitte versuchen Sie es später erneut'
});

// Rate limiter for QR code generation
const qrCodeRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: 'Zu viele QR-Code-Generierungen, bitte versuchen Sie es später erneut'
});

// Rate limiter for file uploads
const uploadRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: 'Zu viele Upload-Anfragen, bitte versuchen Sie es später erneut'
});

// Rate limiter for public API (QR code tracking)
const publicRateLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Zu viele Anfragen'
});

// Dynamic rate limiter based on user role
const dynamicRateLimiter = (req, res, next) => {
    let maxRequests = 100;
    
    if (req.user) {
        switch (req.user.role) {
            case 'super_admin':
                maxRequests = 1000;
                break;
            case 'restaurant_owner':
                maxRequests = 500;
                break;
            case 'restaurant_staff':
                maxRequests = 200;
                break;
            default:
                maxRequests = 100;
        }
    }

    const limiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: maxRequests
    });

    limiter(req, res, next);
};

// IP-based blocking for suspicious activity
const suspiciousActivityLimiter = createRateLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 1000,
    message: 'Verdächtige Aktivität erkannt. Ihr Zugang wurde temporär gesperrt.',
    handler: async (req, res) => {
        logger.logSecurity('suspicious_activity_blocked', {
            ip: req.ip,
            path: req.path,
            userId: req.user?.id,
            userAgent: req.get('user-agent')
        });

        res.status(429).json({
            success: false,
            message: 'Verdächtige Aktivität erkannt. Bitte kontaktieren Sie den Support.',
            code: 'SUSPICIOUS_ACTIVITY'
        });
    }
});

module.exports = {
    rateLimiter,
    authRateLimiter,
    passwordResetRateLimiter,
    qrCodeRateLimiter,
    uploadRateLimiter,
    publicRateLimiter,
    dynamicRateLimiter,
    suspiciousActivityLimiter,
    createRateLimiter
};