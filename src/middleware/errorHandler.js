/**
 * Error Handler Middleware
 * Speichern als: backend/src/middleware/errorHandler.js
 */

const logger = require('../utils/logger');
const { ActivityLog } = require('../models');

class AppError extends Error {
    constructor(message, statusCode, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Async error wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Main error handler
const errorHandler = async (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    logger.error('Error Handler:', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id
    });

    // Log to database
    await ActivityLog.logError(err, req, req.user?.id);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Ungültige ID';
        error = new AppError(message, 400, 'INVALID_ID');
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `Dieser Wert für ${field} existiert bereits`;
        error = new AppError(message, 400, 'DUPLICATE_VALUE');
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = new AppError(message, 400, 'VALIDATION_ERROR');
    }

    // Sequelize validation error
    if (err.name === 'SequelizeValidationError') {
        const message = err.errors.map(e => e.message).join(', ');
        error = new AppError(message, 400, 'VALIDATION_ERROR');
    }

    // Sequelize unique constraint error
    if (err.name === 'SequelizeUniqueConstraintError') {
        const message = 'Dieser Wert existiert bereits';
        error = new AppError(message, 400, 'DUPLICATE_VALUE');
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error = new AppError('Ungültiger Token', 401, 'INVALID_TOKEN');
    }

    if (err.name === 'TokenExpiredError') {
        error = new AppError('Token abgelaufen', 401, 'TOKEN_EXPIRED');
    }

    // Multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        error = new AppError('Datei ist zu groß', 400, 'FILE_TOO_LARGE');
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        error = new AppError('Unerwartetes Feld', 400, 'UNEXPECTED_FIELD');
    }

    // Default error
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Interner Serverfehler';
    const code = error.code || 'INTERNAL_ERROR';

    res.status(statusCode).json({
        success: false,
        message,
        code,
        ...(process.env.NODE_ENV === 'development' && {
            error: err,
            stack: err.stack
        })
    });
};

// Not found handler
const notFound = (req, res, next) => {
    const message = `Route nicht gefunden - ${req.originalUrl}`;
    const error = new AppError(message, 404, 'NOT_FOUND');
    next(error);
};

// Validation error handler
const validationError = (message, field = null) => {
    const error = new AppError(message, 400, 'VALIDATION_ERROR');
    if (field) error.field = field;
    return error;
};

// Authentication error handler
const authError = (message = 'Nicht autorisiert') => {
    return new AppError(message, 401, 'AUTH_ERROR');
};

// Permission error handler
const permissionError = (message = 'Keine Berechtigung') => {
    return new AppError(message, 403, 'PERMISSION_ERROR');
};

// Database error handler
const dbError = (message = 'Datenbankfehler') => {
    return new AppError(message, 500, 'DATABASE_ERROR');
};

module.exports = {
    AppError,
    asyncHandler,
    errorHandler,
    notFound,
    validationError,
    authError,
    permissionError,
    dbError
};