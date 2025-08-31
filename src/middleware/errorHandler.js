/**
 * Global Error Handler Middleware
 * Speichern als: backend/src/middleware/errorHandler.js
 */

const logger = require('../utils/logger');

// Async Handler Wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom Error Class
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message } = err;
  let code = err.code || 'INTERNAL_ERROR';

  // Log error
  logger.error('Error Handler:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    user: req.user?.id
  });

  // Sequelize Validation Errors
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = err.errors.map(e => e.message).join(', ');
    code = 'VALIDATION_ERROR';
  }

  // Sequelize Unique Constraint Errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    message = 'Dieser Wert existiert bereits';
    code = 'DUPLICATE_ERROR';
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Ungültiger Token';
    code = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token abgelaufen';
    code = 'TOKEN_EXPIRED';
  }

  // Mongoose CastError (falls MongoDB später verwendet wird)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Ungültige ID';
    code = 'INVALID_ID';
  }

  // Development vs Production Response
  const response = {
    success: false,
    message,
    code
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = {
      message: err.message,
      stack: err.stack,
      raw: err
    };
  }

  res.status(statusCode).json(response);
};

// Not Found Handler
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route nicht gefunden: ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(error);
};

module.exports = {
  asyncHandler,
  AppError,
  errorHandler,
  notFoundHandler
};