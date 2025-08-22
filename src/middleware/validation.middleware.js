/**
 * Validation Middleware
 * Speichern als: backend/src/middleware/validation.middleware.js
 */

const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

// Check validation results
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => ({
            field: error.param,
            message: error.msg
        }));

        return res.status(400).json({
            success: false,
            message: 'Validierungsfehler',
            errors: errorMessages
        });
    }
    next();
};

// Auth validations
const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein'),
    body('password')
        .notEmpty()
        .withMessage('Passwort ist erforderlich'),
    validate
];

const validateRegister = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Passwort muss mindestens 6 Zeichen lang sein')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Passwort muss mindestens einen Großbuchstaben, einen Kleinbuchstaben und eine Zahl enthalten'),
    body('first_name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Vorname muss zwischen 2 und 100 Zeichen lang sein'),
    body('last_name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Nachname muss zwischen 2 und 100 Zeichen lang sein'),
    validate
];

// Restaurant validations
const validateCreateRestaurant = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Restaurant Name ist erforderlich')
        .isLength({ min: 2, max: 255 })
        .withMessage('Name muss zwischen 2 und 255 Zeichen lang sein'),
    body('google_reviews_url')
        .trim()
        .notEmpty()
        .withMessage('Google Reviews URL ist erforderlich')
        .isURL()
        .withMessage('Bitte geben Sie eine gültige URL ein'),
    body('owner_email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein'),
    body('owner_password')
        .isLength({ min: 6 })
        .withMessage('Passwort muss mindestens 6 Zeichen lang sein'),
    validate
];

const validateUpdateRestaurant = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 255 })
        .withMessage('Name muss zwischen 2 und 255 Zeichen lang sein'),
    body('google_reviews_url')
        .optional()
        .trim()
        .isURL()
        .withMessage('Bitte geben Sie eine gültige URL ein'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active muss ein Boolean sein'),
    validate
];

// Table validations
const validateCreateTable = [
    body('number')
        .trim()
        .notEmpty()
        .withMessage('Tischnummer ist erforderlich')
        .isLength({ max: 50 })
        .withMessage('Tischnummer darf maximal 50 Zeichen lang sein'),
    body('name')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Name darf maximal 100 Zeichen lang sein'),
    body('capacity')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Kapazität muss zwischen 1 und 100 liegen'),
    body('location')
        .optional()
        .isIn(['indoor', 'outdoor', 'terrace', 'bar', 'vip', 'other'])
        .withMessage('Ungültiger Standorttyp'),
    validate
];

// Subscription validations
const validateCreateSubscription = [
    body('restaurant_id')
        .isUUID()
        .withMessage('Ungültige Restaurant ID'),
    body('plan_id')
        .isUUID()
        .withMessage('Ungültige Plan ID'),
    body('billing_cycle')
        .optional()
        .isIn(['monthly', 'yearly', 'lifetime'])
        .withMessage('Ungültiger Abrechnungszyklus'),
    validate
];

// Payment validations
const validateCreatePayment = [
    body('subscription_id')
        .isUUID()
        .withMessage('Ungültige Subscription ID'),
    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Betrag muss eine positive Zahl sein'),
    body('payment_method')
        .isIn(['manual', 'stripe', 'paypal', 'bank_transfer', 'cash', 'invoice'])
        .withMessage('Ungültige Zahlungsmethode'),
    validate
];

// ID validations
const validateUUID = (paramName = 'id') => [
    param(paramName)
        .isUUID()
        .withMessage('Ungültige ID'),
    validate
];

// Pagination validations
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Seite muss eine positive Zahl sein'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit muss zwischen 1 und 100 liegen'),
    query('sort')
        .optional()
        .isIn(['asc', 'desc', 'ASC', 'DESC'])
        .withMessage('Sortierung muss asc oder desc sein'),
    validate
];

// Date range validations
const validateDateRange = [
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Startdatum muss im ISO 8601 Format sein'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('Enddatum muss im ISO 8601 Format sein')
        .custom((value, { req }) => {
            if (req.query.start_date && value) {
                return new Date(value) >= new Date(req.query.start_date);
            }
            return true;
        })
        .withMessage('Enddatum muss nach dem Startdatum liegen'),
    validate
];

// Bulk operations validations
const validateBulkDelete = [
    body('ids')
        .isArray({ min: 1 })
        .withMessage('IDs müssen ein Array mit mindestens einem Element sein'),
    body('ids.*')
        .isUUID()
        .withMessage('Alle IDs müssen gültige UUIDs sein'),
    validate
];

// QR Code validations
const validateQRCodeStyle = [
    body('style.color')
        .optional()
        .matches(/^#[0-9A-F]{6}$/i)
        .withMessage('Farbe muss ein gültiger Hex-Code sein'),
    body('style.backgroundColor')
        .optional()
        .matches(/^#[0-9A-F]{6}$/i)
        .withMessage('Hintergrundfarbe muss ein gültiger Hex-Code sein'),
    body('style.width')
        .optional()
        .isInt({ min: 100, max: 1000 })
        .withMessage('Breite muss zwischen 100 und 1000 Pixel liegen'),
    validate
];

module.exports = {
    validate,
    validateLogin,
    validateRegister,
    validateCreateRestaurant,
    validateUpdateRestaurant,
    validateCreateTable,
    validateCreateSubscription,
    validateCreatePayment,
    validateUUID,
    validatePagination,
    validateDateRange,
    validateBulkDelete,
    validateQRCodeStyle
};