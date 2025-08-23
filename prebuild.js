/**
 * Render Build Hook - Automatische Dependency Installation
 * Speichern als: backend/prebuild.js
 * 
 * Fügen Sie zu package.json hinzu:
 * "scripts": {
 *   "prebuild": "node prebuild.js",
 *   "build": "npm run prebuild && npm install"
 * }
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔧 Render Pre-Build Hook gestartet...');
console.log('================================');

// Liste aller benötigten Dependencies
const requiredDependencies = {
  // Core
  'express': '^4.18.2',
  'cors': '^2.8.5',
  'dotenv': '^16.3.1',
  
  // Auth & Security
  'bcryptjs': '^2.4.3',
  'jsonwebtoken': '^9.0.2',
  'express-rate-limit': '^7.1.5',
  'express-validator': '^7.0.1',
  'validator': '^13.11.0',
  
  // Database
  'sequelize': '^6.35.0',
  'sqlite3': '^5.1.6',
  
  // Features
  'axios': '^1.6.2',
  'nodemailer': '^6.9.7',
  'qrcode': '^1.5.3',
  'pdfkit': '^0.14.0',
  'multer': '^1.4.5-lts.1',
  'uuid': '^9.0.1'
};

// Lese aktuelle package.json
let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
} catch (error) {
  console.error('❌ Konnte package.json nicht lesen:', error.message);
  process.exit(1);
}

// Stelle sicher, dass dependencies existiert
if (!packageJson.dependencies) {
  packageJson.dependencies = {};
}

// Prüfe und füge fehlende Dependencies hinzu
let updated = false;
for (const [pkg, version] of Object.entries(requiredDependencies)) {
  if (!packageJson.dependencies[pkg]) {
    console.log(`➕ Füge hinzu: ${pkg}@${version}`);
    packageJson.dependencies[pkg] = version;
    updated = true;
  }
}

// Speichere aktualisierte package.json
if (updated) {
  try {
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    console.log('✅ package.json aktualisiert');
  } catch (error) {
    console.error('❌ Konnte package.json nicht schreiben:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Alle Dependencies bereits in package.json');
}

// Prüfe ob node_modules existiert und lösche es für saubere Installation
if (fs.existsSync('node_modules')) {
  console.log('🧹 Lösche alte node_modules...');
  try {
    execSync('rm -rf node_modules', { stdio: 'inherit' });
  } catch (error) {
    console.log('⚠️ Konnte node_modules nicht löschen');
  }
}

// Lösche package-lock.json für frische Installation
if (fs.existsSync('package-lock.json')) {
  console.log('🧹 Lösche package-lock.json...');
  try {
    fs.unlinkSync('package-lock.json');
  } catch (error) {
    console.log('⚠️ Konnte package-lock.json nicht löschen');
  }
}

console.log('================================');
console.log('✅ Pre-Build abgeschlossen');
console.log('📦 npm install wird jetzt ausgeführt...');
console.log('================================');