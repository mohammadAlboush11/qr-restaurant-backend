// backend/src/config/database.js
// KOMPLETT NEUE VERSION - NUTZT PERSISTENT DISK!

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// KRITISCH: Nutze Environment Variable für persistenten Speicher
const getDatabasePath = () => {
  // WICHTIG: Prüfe zuerst Environment Variable für Render
  if (process.env.DATABASE_PATH) {
    const dbPath = path.resolve(process.env.DATABASE_PATH);
    console.log(`📁 Using DATABASE_PATH from ENV: ${dbPath}`);
    
    // Stelle sicher, dass das Verzeichnis existiert
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`📁 Created database directory: ${dbDir}`);
    }
    
    return dbPath;
  }
  
  // Fallback für Render (falls DATABASE_PATH nicht gesetzt)
  if (process.env.RENDER) {
    const renderPath = '/opt/render/project/src/data/database.sqlite';
    const renderDir = path.dirname(renderPath);
    
    if (!fs.existsSync(renderDir)) {
      fs.mkdirSync(renderDir, { recursive: true });
      console.log(`📁 Created Render persistent directory: ${renderDir}`);
    }
    
    console.log(`🚀 Using Render persistent disk: ${renderPath}`);
    return renderPath;
  }
  
  // Fallback für lokale Entwicklung
  const localPath = path.join(__dirname, '../../database.sqlite');
  console.log(`💻 Using local database: ${localPath}`);
  return localPath;
};

// SQLite Datenbank-Konfiguration
const databasePath = getDatabasePath();

// Überprüfe ob Datenbank existiert und zeige Info
const dbExists = fs.existsSync(databasePath);
console.log(`📊 Database exists: ${dbExists}`);
if (dbExists) {
  const stats = fs.statSync(databasePath);
  console.log(`📊 Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📊 Last modified: ${stats.mtime.toISOString()}`);
} else {
  console.log(`🆕 New database will be created at: ${databasePath}`);
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: databasePath, // NUTZT JETZT DEN KORREKTEN PFAD!
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  // Wichtig für Produktions-Stabilität
  retry: {
    max: 5,
    match: [
      /SQLITE_BUSY/,
      /SQLITE_LOCKED/,
      /database is locked/
    ]
  }
});

// Exportiere auch den Pfad für Backup-Zwecke
sequelize.databasePath = databasePath;

// Zeige beim Start wichtige Info
console.log('='.repeat(60));
console.log('📍 DATABASE CONFIGURATION:');
console.log(`   Path: ${databasePath}`);
console.log(`   Exists: ${dbExists}`);
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('='.repeat(60));

module.exports = sequelize;