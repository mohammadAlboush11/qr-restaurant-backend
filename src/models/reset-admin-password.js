/**
 * Admin Password Reset Script
 * Datei: backend/reset-admin-password.js
 * Ausführen mit: node reset-admin-password.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./src/models');

async function resetAdminPassword() {
  try {
    console.log('========================================');
    console.log('🔐 Admin Passwort Reset');
    console.log('========================================\n');

    // Datenbankverbindung
    await sequelize.authenticate();
    console.log('✅ Datenbankverbindung hergestellt\n');

    // Admin-Daten aus ENV oder Standard
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@lt-express.de';
    const newPassword = process.env.ADMIN_PASSWORD || 'Admin123!@#';

    // Suche Admin
    let admin = await User.findOne({
      where: { 
        email: adminEmail,
        role: 'admin'
      }
    });

    if (!admin) {
      console.log('❌ Admin-Account nicht gefunden!');
      console.log('📌 Erstelle neuen Admin-Account...\n');
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      admin = await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: 'Super Admin',
        role: 'admin',
        is_active: true
      });

      console.log('✅ Admin-Account erstellt!');
    } else {
      console.log('✅ Admin-Account gefunden');
      console.log('🔄 Setze Passwort zurück...\n');
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await admin.update({ 
        password: hashedPassword,
        is_active: true // Stelle sicher dass Account aktiv ist
      });
      
      console.log('✅ Passwort erfolgreich zurückgesetzt!');
    }

    console.log('\n========================================');
    console.log('📋 Login-Daten:');
    console.log('========================================');
    console.log(`E-Mail:   ${adminEmail}`);
    console.log(`Passwort: ${newPassword}`);
    console.log('========================================\n');

    // Zeige alle Benutzer
    const allUsers = await User.findAll({
      attributes: ['id', 'email', 'name', 'role', 'is_active']
    });

    console.log('📊 Alle Benutzer in der Datenbank:');
    console.log('========================================');
    allUsers.forEach(user => {
      console.log(`${user.role === 'admin' ? '👑' : '🏪'} ${user.email} (${user.role}) - ${user.is_active ? 'Aktiv' : 'Inaktiv'}`);
    });
    console.log('========================================\n');

    await sequelize.close();
    console.log('✅ Fertig!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

// Führe Reset aus
resetAdminPassword();
