const logger = {
  info: (message, meta = {}) => {
    console.log(`ℹ️ INFO: ${message}`, meta);
  },
  
  error: (message, error = null) => {
    console.error(`❌ ERROR: ${message}`, error);
  },
  
  warn: (message, meta = {}) => {
    console.warn(`⚠️ WARN: ${message}`, meta);
  },
  
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 DEBUG: ${message}`, meta);
    }
  }
};

module.exports = logger;