/**
 * Models Index - Zentrale Model-Verwaltung
 * Speichern als: backend/src/models/index.js
 */

const sequelize = require('../config/database');

// Importiere alle einzelnen Models
const User = require('./User');
const Restaurant = require('./Restaurant');
const Table = require('./Table');
const QRCode = require('./QRCode');
const Scan = require('./Scan');
const Payment = require('./Payment');
const Subscription = require('./Subscription');
const Plan = require('./Plan');
const ActivityLog = require('./ActivityLog');
const ReviewNotification = require('./ReviewNotification');

// ============================
// ASSOCIATIONS DEFINIEREN
// ============================

// User -> Restaurant (Many-to-One)
// Ein Restaurant kann mehrere User haben
Restaurant.hasMany(User, { 
  foreignKey: 'restaurant_id', 
  as: 'users' 
});

User.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant -> Tables (One-to-Many)
Restaurant.hasMany(Table, { 
  foreignKey: 'restaurant_id', 
  as: 'tables',
  onDelete: 'CASCADE' 
});

Table.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Table -> QRCodes (One-to-Many)
Table.hasMany(QRCode, { 
  foreignKey: 'table_id', 
  as: 'qrcodes',
  onDelete: 'CASCADE' 
});

QRCode.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});

// Spezielle Assoziation für aktiven QR-Code
Table.hasOne(QRCode, {
  foreignKey: 'table_id',
  as: 'qrcode_data',
  scope: { is_active: true }
});

// QRCode -> Scans (One-to-Many)
QRCode.hasMany(Scan, { 
  foreignKey: 'qr_code_id', 
  as: 'scans' 
});

Scan.belongsTo(QRCode, { 
  foreignKey: 'qr_code_id', 
  as: 'qrcode' 
});

// Table -> Scans (One-to-Many)
Table.hasMany(Scan, { 
  foreignKey: 'table_id', 
  as: 'scans' 
});

Scan.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});

// Restaurant -> Scans (One-to-Many)
Restaurant.hasMany(Scan, { 
  foreignKey: 'restaurant_id', 
  as: 'scans' 
});

Scan.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant -> Payments (One-to-Many)
Restaurant.hasMany(Payment, { 
  foreignKey: 'restaurant_id', 
  as: 'payments',
  onDelete: 'CASCADE' 
});

Payment.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant -> Subscription (One-to-One)
Restaurant.hasOne(Subscription, { 
  foreignKey: 'restaurant_id', 
  as: 'subscription' 
});

Subscription.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Plan -> Subscriptions (One-to-Many)
Plan.hasMany(Subscription, { 
  foreignKey: 'plan_id', 
  as: 'subscriptions' 
});

Subscription.belongsTo(Plan, { 
  foreignKey: 'plan_id', 
  as: 'plan' 
});

// User -> ActivityLog (One-to-Many)
User.hasMany(ActivityLog, { 
  foreignKey: 'user_id', 
  as: 'activities' 
});

ActivityLog.belongsTo(User, { 
  foreignKey: 'user_id', 
  as: 'user' 
});

// Restaurant -> ActivityLog (One-to-Many)
Restaurant.hasMany(ActivityLog, { 
  foreignKey: 'restaurant_id', 
  as: 'activity_logs' 
});

ActivityLog.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant -> ReviewNotifications (One-to-Many)
Restaurant.hasMany(ReviewNotification, { 
  foreignKey: 'restaurant_id', 
  as: 'review_notifications' 
});

ReviewNotification.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Table -> ReviewNotifications (One-to-Many)
Table.hasMany(ReviewNotification, { 
  foreignKey: 'table_id', 
  as: 'review_notifications' 
});

ReviewNotification.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});

// User (Admin) -> Created Payments
User.hasMany(Payment, { 
  foreignKey: 'created_by', 
  as: 'created_payments' 
});

Payment.belongsTo(User, { 
  foreignKey: 'created_by', 
  as: 'creator' 
});

// Export alles
module.exports = {
  sequelize,
  User,
  Restaurant,
  Table,
  QRCode,
  Scan,
  Payment,
  Subscription,
  Plan,
  ActivityLog,
  ReviewNotification
};