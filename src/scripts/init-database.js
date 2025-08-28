const sequelize = require('../config/database');
const { 
  User, 
  Restaurant, 
  Table, 
  Payment, 
  Subscription, 
  Plan, 
  QRCode, 
  Scan, 
  ActivityLog 
} = require('../models');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  try {
    console.log('🚀 Initialisiere SQLite Datenbank...');
    
    // Datenbankverbindung testen
    await sequelize.authenticate();
    console.log('✅ Verbindung zur SQLite-Datenbank hergestellt');
    
    // Tabellen erstellen (force: true löscht existierende Tabellen!)
    const syncOptions = process.env.NODE_ENV === 'production' 
      ? { alter: true } 
      : { force: true };
    
    await sequelize.sync(syncOptions);
    console.log('✅ Alle Tabellen wurden erstellt/aktualisiert');
    
    // Standard-Admin erstellen
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@lt-express.de';
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
    
    const existingAdmin = await User.findOne({
      where: { email: adminEmail }
    });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const admin = await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: 'Super Admin',
        role: 'super_admin',
        is_active: true,
        is_email_verified: true
      });
      
      console.log('✅ Super Admin erstellt');
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Passwort: ${adminPassword}`);
    } else {
      console.log('ℹ️ Super Admin existiert bereits');
    }
    
    // Standard-Pläne erstellen
    const defaultPlans = [
      {
        name: 'Basic',
        price: 29.99,
        duration_months: 1,
        max_tables: 10,
        features: JSON.stringify(['QR-Code Generation', 'Email Notifications', 'Basic Analytics']),
        is_active: true
      },
      {
        name: 'Professional',
        price: 59.99,
        duration_months: 1,
        max_tables: 50,
        features: JSON.stringify(['QR-Code Generation', 'Email Notifications', 'Advanced Analytics', 'Custom Branding', 'Priority Support']),
        is_active: true
      },
      {
        name: 'Enterprise',
        price: 99.99,
        duration_months: 1,
        max_tables: 999,
        features: JSON.stringify(['Unlimited QR-Codes', 'Email Notifications', 'Full Analytics Suite', 'Custom Branding', 'API Access', 'Dedicated Support']),
        is_active: true
      }
    ];
    
    for (const planData of defaultPlans) {
      const existingPlan = await Plan.findOne({
        where: { name: planData.name }
      });
      
      if (!existingPlan) {
        await Plan.create(planData);
        console.log(`✅ Plan "${planData.name}" erstellt`);
      }
    }
    
    console.log('\n✅ Datenbank-Initialisierung abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler bei der Datenbank-Initialisierung:', error);
    process.exit(1);
  }
}

// Nur ausführen wenn direkt aufgerufen
if (require.main === module) {
  initDatabase().then(() => {
    process.exit(0);
  });
}

module.exports = initDatabase;