module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  
  // Produktions-URLs verwenden
  BACKEND_URL: process.env.BACKEND_URL || 'https://qr-restaurant-backend.onrender.com',
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://lt-express.de',
  
  DATABASE: {
    URL: process.env.DATABASE_URL || process.env.DATABASE_PATH,
    LOGGING: process.env.NODE_ENV === 'development'
  },
  
  JWT: {
    SECRET: process.env.JWT_SECRET,
    EXPIRES_IN: '7d'
  },
  
  EMAIL_CONFIG: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    notificationEmail: process.env.NOTIFICATION_EMAIL 
  },
  
  getQRCodeUrl(code) {
    return `${this.BACKEND_URL}/api/public/scan/${code}`;
  }
};