/**
 * PostgreSQL Database Initialization - Final Fixed Version
 * Speichern als: backend/src/scripts/init-database-postgres.js
 */

const { sequelize } = require('../config/database');
const { Sequelize } = require('sequelize');
const crypto = require('crypto');

async function initPostgres() {
    try {
        console.log('🔄 Initialisiere PostgreSQL Datenbank...\n');

        // Teste Verbindung
        await sequelize.authenticate();
        console.log('✅ PostgreSQL Verbindung erfolgreich!\n');

        // Lade und registriere ALLE Models ZUERST
        console.log('📦 Lade Models...');
        const models = require('../models');
        console.log('✅ Models geladen\n');

        // Lösche alle Tabellen und erstelle neu
        console.log('🔨 Erstelle Tabellen...');
        await sequelize.sync({ force: true }); // Dies löscht und erstellt alle Tabellen neu
        console.log('✅ Alle Tabellen erstellt\n');

        // Warte kurz, damit die Tabellen sicher erstellt sind
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Extrahiere Models
        const {
            User,
            Restaurant,
            Plan,
            Subscription,
            Table,
            QRCode,
            Payment,
            Scan,
            ActivityLog
        } = models;

        console.log('📝 Füge Daten ein...\n');

        // Erstelle Super Admin
        const admin = await User.create({
            email: 'admin@qr-restaurant.com',
            password: 'Admin123!',
            role: 'super_admin',
            first_name: 'Super',
            last_name: 'Admin',
            is_active: true,
            is_email_verified: true,
            settings: {
                notifications: {
                    email: true,
                    payment_reminders: true,
                    weekly_reports: true
                },
                language: 'de',
                timezone: 'Europe/Berlin'
            }
        });
        console.log('✅ Super Admin erstellt');

        // Erstelle Plans
        const basicPlan = await Plan.create({
            name: 'Basic',
            slug: 'basic',
            price: 29.99,
            interval: 'monthly',
            features: {
                max_tables: 10,
                max_scans_per_month: 1000,
                custom_qr_design: false,
                analytics: true,
                email_notifications: true
            },
            limits: {
                tables: 10,
                monthly_scans: 1000
            },
            is_active: true,
            display_order: 1
        });

        const proPlan = await Plan.create({
            name: 'Professional',
            slug: 'professional',
            price: 59.99,
            interval: 'monthly',
            features: {
                max_tables: 50,
                max_scans_per_month: 10000,
                custom_qr_design: true,
                analytics: true,
                email_notifications: true,
                priority_support: true
            },
            limits: {
                tables: 50,
                monthly_scans: 10000
            },
            is_active: true,
            display_order: 2
        });

        const enterprisePlan = await Plan.create({
            name: 'Enterprise',
            slug: 'enterprise',
            price: 149.99,
            interval: 'monthly',
            features: {
                max_tables: -1,
                max_scans_per_month: -1,
                custom_qr_design: true,
                analytics: true,
                email_notifications: true,
                priority_support: true,
                white_label: true
            },
            limits: {
                tables: -1,
                monthly_scans: -1
            },
            is_active: true,
            display_order: 3
        });
        console.log('✅ Pläne erstellt: Basic, Professional, Enterprise');

        // Erstelle Demo Restaurant Owner
        const demoOwner = await User.create({
            email: 'demo@restaurant.com',
            password: 'Demo123!',
            role: 'restaurant_owner',
            first_name: 'Demo',
            last_name: 'Owner',
            is_active: true,
            is_email_verified: true
        });
        console.log('✅ Demo Restaurant Owner erstellt');

        // Erstelle Demo Restaurant
        const demoRestaurant = await Restaurant.create({
            name: 'Demo Restaurant Berlin',
            slug: 'demo-restaurant',
            owner_id: demoOwner.id,
            google_reviews_url: 'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review',
            address: {
                street: 'Alexanderplatz 1',
                city: 'Berlin',
                zip: '10178',
                state: 'Berlin',
                country: 'Deutschland'
            },
            contact: {
                phone: '+49 30 12345678',
                email: 'info@demo-restaurant.com',
                website: 'https://demo-restaurant.com'
            },
            business_hours: {
                monday: { open: '09:00', close: '22:00' },
                tuesday: { open: '09:00', close: '22:00' },
                wednesday: { open: '09:00', close: '22:00' },
                thursday: { open: '09:00', close: '22:00' },
                friday: { open: '09:00', close: '23:00' },
                saturday: { open: '10:00', close: '23:00' },
                sunday: { open: '10:00', close: '21:00' }
            },
            settings: {
                qr_code_style: {
                    color: '#000000',
                    backgroundColor: '#FFFFFF',
                    errorCorrectionLevel: 'M',
                    margin: 2,
                    width: 256
                },
                notification_email: 'info@demo-restaurant.com',
                scan_limit_per_day: null
            },
            is_active: true,
            created_by: admin.id
        });
        console.log('✅ Demo Restaurant erstellt');

        // Erstelle Subscription für Demo Restaurant
        const subscription = await Subscription.create({
            restaurant_id: demoRestaurant.id,
            plan_id: proPlan.id,
            status: 'active',
            current_period_start: new Date(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            created_by: admin.id
        });
        console.log('✅ Professional Abonnement aktiviert');

        // Erstelle Tische für Demo Restaurant
        const tables = [];
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
        
        for (let i = 1; i <= 10; i++) {
            const table = await Table.create({
                restaurant_id: demoRestaurant.id,
                number: i.toString(),
                name: `Tisch ${i}`,
                capacity: i <= 4 ? 2 : 4,
                location: i <= 6 ? 'indoor' : 'outdoor',
                floor: 0,
                section: i <= 6 ? 'Hauptraum' : 'Terrasse',
                is_active: true,
                created_by: admin.id
            });
            tables.push(table);

            // Prüfe ob bereits ein QR-Code für diesen Tisch existiert
            const existingQRCode = await QRCode.findOne({
                where: { table_id: table.id }
            });

            if (!existingQRCode) {
                // Erstelle QR-Code nur wenn noch keiner existiert
                const token = crypto.randomBytes(32).toString('hex');
                const shortCode = `T${table.number}R${demoRestaurant.id.slice(0, 4).toUpperCase()}`;
                
                const qrCode = await QRCode.create({
                    table_id: table.id,
                    restaurant_id: demoRestaurant.id,
                    token: token,
                    short_code: shortCode,
                    redirect_url: demoRestaurant.google_reviews_url || `https://g.page/review`,
                    tracking_url: `${backendUrl}/track/${token}`,
                    style: demoRestaurant.settings?.qr_code_style || {
                        color: '#000000',
                        backgroundColor: '#FFFFFF',
                        errorCorrectionLevel: 'M',
                        margin: 2,
                        width: 256
                    },
                    is_active: true,
                    created_by: admin.id
                });
                console.log(`  ✓ QR-Code für Tisch ${table.number}: ${backendUrl}/track/${token}`);
            } else {
                console.log(`  ℹ QR-Code für Tisch ${table.number} existiert bereits`);
            }
        }
        console.log('✅ Tische und QR-Codes verarbeitet');

        // Erstelle ein paar Test-Scans
        const qrCodes = await QRCode.findAll({ 
            where: { restaurant_id: demoRestaurant.id },
            limit: 3 
        });

        for (const qrCode of qrCodes) {
            // Erstelle 2-5 zufällige Scans pro QR-Code
            const scanCount = Math.floor(Math.random() * 4) + 2;
            
            for (let i = 0; i < scanCount; i++) {
                await Scan.create({
                    qr_code_id: qrCode.id,
                    table_id: qrCode.table_id,
                    restaurant_id: qrCode.restaurant_id,
                    ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
                    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                    device_info: {
                        type: 'mobile',
                        os: 'iOS',
                        browser: 'Safari'
                    },
                    source: 'direct',
                    created_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000))
                });
            }
        }
        console.log('✅ Test-Scans erstellt');

        // Erstelle Activity Logs
        await ActivityLog.create({
            user_id: admin.id,
            restaurant_id: demoRestaurant.id,
            action: 'restaurant_created',
            category: 'restaurant',
            severity: 'info',
            description: 'Demo Restaurant erstellt',
            metadata: {
                restaurant_name: demoRestaurant.name
            }
        });

        await ActivityLog.create({
            user_id: demoOwner.id,
            restaurant_id: demoRestaurant.id,
            action: 'login_success',
            category: 'auth',
            severity: 'info',
            description: 'Erfolgreiche Anmeldung',
            metadata: {
                ip: '127.0.0.1'
            }
        });
        console.log('✅ Activity Logs erstellt');

        console.log('\n========================================');
        console.log('🎉 PostgreSQL Datenbank erfolgreich initialisiert!');
        console.log('========================================\n');
        console.log('📊 ZUSAMMENFASSUNG:');
        console.log(`  • 2 Benutzer erstellt`);
        console.log(`  • 3 Pläne erstellt`);
        console.log(`  • 1 Restaurant erstellt`);
        console.log(`  • ${tables.length} Tische erstellt`);
        console.log(`  • ${await QRCode.count()} QR-Codes generiert`);
        console.log(`  • ${await Scan.count()} Test-Scans erstellt`);
        console.log('\n========================================');
        console.log('🔐 LOGIN CREDENTIALS:');
        console.log('========================================\n');
        console.log('ADMIN LOGIN:');
        console.log('  Email: admin@qr-restaurant.com');
        console.log('  Passwort: Admin123!\n');
        console.log('DEMO RESTAURANT LOGIN:');
        console.log('  Email: demo@restaurant.com');
        console.log('  Passwort: Demo123!\n');
        console.log('========================================');
        console.log('🔗 ZUGRIFF:');
        console.log('========================================\n');
        console.log('Frontend:  http://localhost:3000');
        console.log('Backend:   http://localhost:3001');
        console.log('Adminer:   http://localhost:8080');
        console.log('\nDatenbank-Zugang (Adminer):');
        console.log('  System: PostgreSQL');
        console.log('  Server: postgres');
        console.log('  Benutzer: qr_user');
        console.log('  Passwort: qr_password');
        console.log('  Datenbank: qr_restaurant');
        console.log('========================================\n');

        return true;

    } catch (error) {
        console.error('❌ Fehler bei der Initialisierung:', error.message);
        
        if (error.name === 'SequelizeValidationError') {
            console.error('\n⚠️  Validierungs-Fehler!');
            error.errors.forEach(err => {
                console.error(`   - ${err.path}: ${err.message}`);
            });
        }
        
        if (error.name === 'SequelizeUniqueConstraintError') {
            console.error('\n⚠️  Unique Constraint Fehler!');
            console.error('   Ein Datensatz mit diesen Werten existiert bereits.');
            console.error('   Lösung: Datenbank neu initialisieren mit HARD_RESET.bat');
        }
        
        if (error.name === 'SequelizeDatabaseError') {
            console.error('\n⚠️  Datenbank-Fehler!');
            console.error('   SQL:', error.sql);
            console.error('   Original:', error.original?.message);
        }
        
        if (error.message.includes('ECONNREFUSED')) {
            console.error('\n⚠️  PostgreSQL ist nicht erreichbar!');
            console.error('   Bitte prüfen Sie:');
            console.error('   1. Läuft Docker? (docker ps)');
            console.error('   2. Ist der Container gestartet? (docker-compose up -d)');
            console.error('   3. Ist Port 5433 frei?');
        }
        
        throw error;
    } finally {
        await sequelize.close();
        console.log('📪 Datenbankverbindung geschlossen');
    }
}

// Führe aus, wenn direkt aufgerufen
if (require.main === module) {
    initPostgres()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { initPostgres };