/**
 * Database Reset Script - Löscht und erstellt die Datenbank neu
 * Speichern als: backend/src/scripts/reset-database.js
 */

const fs = require('fs');
const path = require('path');
const { sequelize, User, Restaurant, Table, QRCode, Payment, Subscription, Plan } = require('../models');
const bcrypt = require('bcryptjs');

async function resetDatabase() {
  try {
    console.log('🔄 Datenbank-Reset wird gestartet...');
    
    // Datenbank-Datei löschen falls vorhanden
    const dbPath = path.join(__dirname, '../../database.sqlite');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('✅ Alte Datenbank gelöscht');
    }

    // Neue Verbindung aufbauen
    await sequelize.authenticate();
    console.log('✅ Neue Datenbank-Verbindung hergestellt');

    // Alle Tabellen neu erstellen
    await sequelize.sync({ force: true });
    console.log('✅ Alle Tabellen wurden neu erstellt');

    // Standard-Admin erstellen
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@lt-express.de';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = await User.create({
      email: adminEmail,
      password: hashedPassword,
      name: 'Super Admin',
      role: 'super_admin',
      is_active: true,
      is_email_verified: true,
      email_verified_at: new Date()
    });
    
    console.log('✅ Super Admin erstellt');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Passwort: ${adminPassword}`);

    // Standard-Pläne erstellen
    const defaultPlans = [
      {
        name: 'Basic',
        price: 29.99,
        duration_months: 1,
        max_tables: 10,
        features: ['QR-Code Generation', 'Email Notifications', 'Basic Analytics'],
        is_active: true,
        display_order: 1
      },
      {
        name: 'Professional',
        price: 59.99,
        duration_months: 1,
        max_tables: 50,
        features: ['QR-Code Generation', 'Email Notifications', 'Advanced Analytics', 'Custom Branding', 'Priority Support'],
        is_active: true,
        display_order: 2
      },
      {
        name: 'Enterprise',
        price: 99.99,
        duration_months: 1,
        max_tables: 999,
        features: ['Unlimited QR-Codes', 'Email Notifications', 'Full Analytics Suite', 'Custom Branding', 'API Access', 'Dedicated Support'],
        is_active: true,
        display_order: 3
      }
    ];
    
    for (const planData of defaultPlans) {
      await Plan.create(planData);
      console.log(`✅ Plan "${planData.name}" erstellt`);
    }

    // Test-Restaurant erstellen (optional)
    if (process.env.CREATE_TEST_DATA === 'true') {
      const testRestaurant = await Restaurant.create({
        name: 'Test Restaurant',
        email: 'test@restaurant.de',
        phone: '0123456789',
        address: 'Teststraße 1, 12345 Teststadt',
        is_active: true,
        subscription_status: 'trial',
        notification_email: 'test@restaurant.de',
        google_business_url: 'https://g.page/test-restaurant'
      });

      const testUser = await User.create({
        email: 'test@restaurant.de',
        password: await bcrypt.hash('test123', 10),
        name: 'Test Restaurant Owner',
        role: 'restaurant',
        restaurant_id: testRestaurant.id,
        is_active: true,
        is_email_verified: true
      });

      await testRestaurant.update({ user_id: testUser.id });

      // Test-Tische erstellen
      for (let i = 1; i <= 5; i++) {
        await Table.create({
          restaurant_id: testRestaurant.id,
          table_number: `${i}`,
          description: `Tisch ${i}`,
          is_active: true,
          scan_count: 0
        });
      }

      console.log('✅ Test-Restaurant mit 5 Tischen erstellt');
      console.log('   Email: test@restaurant.de');
      console.log('   Passwort: test123');
    }

    console.log('\n✅ Datenbank-Reset erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler beim Datenbank-Reset:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Nur ausführen wenn direkt aufgerufen
if (require.main === module) {
  resetDatabase().then(() => {
    process.exit(0);
  });
}

module.exports = resetDatabase;