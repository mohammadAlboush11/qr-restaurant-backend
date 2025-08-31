/**
 * Validation Middleware - MIT OPTIONALEM EXPRESS-VALIDATOR
 * Speichern als: backend/src/middleware/validation.middleware.js
 */

// Versuche express-validator zu laden
let validationResult, body, param, query, check;
let hasExpressValidator = false;

try {
  const expressValidator = require('express-validator');
  validationResult = expressValidator.validationResult;
  body = expressValidator.body;
  param = expressValidator.param;
  query = expressValidator.query;
  check = expressValidator.check;
  hasExpressValidator = true;
  console.log('✅ express-validator geladen');
} catch (error) {
  console.log('⚠️ express-validator nicht verfügbar - verwende Basis-Validierung');
}

class ValidationMiddleware {
  // Generische Validierungs-Handler
  handleValidationErrors(req, res, next) {
    if (hasExpressValidator) {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validierungsfehler',
          errors: errors.array()
        });
      }
    }
    next();
  }

  // Login Validierung
  validateLogin() {
    if (hasExpressValidator) {
      return [
        body('email')
          .isEmail()
          .normalizeEmail()
          .withMessage('Gültige E-Mail-Adresse erforderlich'),
        body('password')
          .notEmpty()
          .withMessage('Passwort erforderlich'),
        this.handleValidationErrors
      ];
    }
    
    // Fallback ohne express-validator
    return [(req, res, next) => {
      const { email, password } = req.body;
      const errors = [];

      if (!email || !this.isValidEmail(email)) {
        errors.push({ msg: 'Gültige E-Mail-Adresse erforderlich', path: 'email' });
      }
      if (!password) {
        errors.push({ msg: 'Passwort erforderlich', path: 'password' });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validierungsfehler',
          errors
        });
      }
      next();
    }];
  }

  // Restaurant Registrierung
  validateRestaurantRegistration() {
    if (hasExpressValidator) {
      return [
        body('name')
          .notEmpty()
          .trim()
          .isLength({ min: 2, max: 100 })
          .withMessage('Restaurant-Name erforderlich (2-100 Zeichen)'),
        body('email')
          .isEmail()
          .normalizeEmail()
          .withMessage('Gültige E-Mail-Adresse erforderlich'),
        body('password')
          .isLength({ min: 6 })
          .withMessage('Passwort muss mindestens 6 Zeichen lang sein'),
        body('phone')
          .optional()
          .isMobilePhone('de-DE')
          .withMessage('Gültige Telefonnummer erforderlich'),
        this.handleValidationErrors
      ];
    }

    // Fallback
    return [(req, res, next) => {
      const { name, email, password, phone } = req.body;
      const errors = [];

      if (!name || name.length < 2 || name.length > 100) {
        errors.push({ msg: 'Restaurant-Name erforderlich (2-100 Zeichen)', path: 'name' });
      }
      if (!email || !this.isValidEmail(email)) {
        errors.push({ msg: 'Gültige E-Mail-Adresse erforderlich', path: 'email' });
      }
      if (!password || password.length < 6) {
        errors.push({ msg: 'Passwort muss mindestens 6 Zeichen lang sein', path: 'password' });
      }
      if (phone && !this.isValidPhone(phone)) {
        errors.push({ msg: 'Gültige Telefonnummer erforderlich', path: 'phone' });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validierungsfehler',
          errors
        });
      }
      next();
    }];
  }

  // Tisch erstellen
  validateTableCreation() {
    if (hasExpressValidator) {
      return [
        body('table_number')
          .isInt({ min: 1 })
          .withMessage('Tischnummer muss eine positive Zahl sein'),
        body('description')
          .optional()
          .trim()
          .isLength({ max: 200 })
          .withMessage('Beschreibung darf maximal 200 Zeichen lang sein'),
        this.handleValidationErrors
      ];
    }

    // Fallback
    return [(req, res, next) => {
      const { table_number, description } = req.body;
      const errors = [];

      if (!table_number || table_number < 1 || !Number.isInteger(Number(table_number))) {
        errors.push({ msg: 'Tischnummer muss eine positive Zahl sein', path: 'table_number' });
      }
      if (description && description.length > 200) {
        errors.push({ msg: 'Beschreibung darf maximal 200 Zeichen lang sein', path: 'description' });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validierungsfehler',
          errors
        });
      }
      next();
    }];
  }

  // ID Parameter Validierung
  validateIdParam() {
    if (hasExpressValidator) {
      return [
        param('id')
          .isInt()
          .withMessage('Ungültige ID'),
        this.handleValidationErrors
      ];
    }

    // Fallback
    return [(req, res, next) => {
      const { id } = req.params;
      if (!id || !Number.isInteger(Number(id))) {
        return res.status(400).json({
          success: false,
          message: 'Ungültige ID'
        });
      }
      next();
    }];
  }

  // Passwort ändern
  validatePasswordChange() {
    if (hasExpressValidator) {
      return [
        body('currentPassword')
          .notEmpty()
          .withMessage('Aktuelles Passwort erforderlich'),
        body('newPassword')
          .isLength({ min: 6 })
          .withMessage('Neues Passwort muss mindestens 6 Zeichen lang sein'),
        this.handleValidationErrors
      ];
    }

    // Fallback
    return [(req, res, next) => {
      const { currentPassword, newPassword } = req.body;
      const errors = [];

      if (!currentPassword) {
        errors.push({ msg: 'Aktuelles Passwort erforderlich', path: 'currentPassword' });
      }
      if (!newPassword || newPassword.length < 6) {
        errors.push({ msg: 'Neues Passwort muss mindestens 6 Zeichen lang sein', path: 'newPassword' });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validierungsfehler',
          errors
        });
      }
      next();
    }];
  }

  // Hilfsmethoden für Fallback-Validierung
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidPhone(phone) {
    // Einfache deutsche Telefonnummer-Validierung
    const phoneRegex = /^(\+49|0)[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  // Generische Validierung für Updates
  validateUpdate(fields) {
    return (req, res, next) => {
      const errors = [];
      const data = req.body;

      // Prüfe nur die angegebenen Felder
      for (const field of fields) {
        const value = data[field.name];
        
        if (field.required && !value) {
          errors.push({ 
            msg: `${field.label || field.name} ist erforderlich`, 
            path: field.name 
          });
          continue;
        }

        if (value !== undefined && value !== null) {
          // Typ-Validierung
          if (field.type === 'email' && !this.isValidEmail(value)) {
            errors.push({ 
              msg: `${field.label || field.name} muss eine gültige E-Mail sein`, 
              path: field.name 
            });
          }
          
          if (field.type === 'number' && isNaN(Number(value))) {
            errors.push({ 
              msg: `${field.label || field.name} muss eine Zahl sein`, 
              path: field.name 
            });
          }
          
          // Längen-Validierung
          if (field.minLength && value.length < field.minLength) {
            errors.push({ 
              msg: `${field.label || field.name} muss mindestens ${field.minLength} Zeichen lang sein`, 
              path: field.name 
            });
          }
          
          if (field.maxLength && value.length > field.maxLength) {
            errors.push({ 
              msg: `${field.label || field.name} darf maximal ${field.maxLength} Zeichen lang sein`, 
              path: field.name 
            });
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validierungsfehler',
          errors
        });
      }
      
      next();
    };
  }
}

module.exports = new ValidationMiddleware();