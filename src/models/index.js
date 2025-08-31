/**
 * Models Index - Korrigierte Associations
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

// Restaurant Owner Association (KORRIGIERT)
Restaurant.belongsTo(User, {
  foreignKey: 'owner_id',
  as: 'owner'
});

User.hasMany(Restaurant, {
  foreignKey: 'owner_id',
  as: 'owned_restaurants'
});

// Restaurant Users (Staff)
Restaurant.hasMany(User, { 
  foreignKey: 'restaurant_id', 
  as: 'users' 
});

User.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant -> Tables
Restaurant.hasMany(Table, { 
  foreignKey: 'restaurant_id', 
  as: 'tables',
  onDelete: 'CASCADE' 
});

Table.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Table -> QRCodes
Table.hasMany(QRCode, { 
  foreignKey: 'table_id', 
  as: 'qrcodes',
  onDelete: 'CASCADE' 
});

QRCode.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});

// QRCode -> Restaurant (Direct)
QRCode.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

Restaurant.hasMany(QRCode, {
  foreignKey: 'restaurant_id',
  as: 'qrcodes'
});

// Active QR Code
Table.hasOne(QRCode, {
  foreignKey: 'table_id',
  as: 'qrcode_data',
  scope: { is_active: true }
});

// Scans
QRCode.hasMany(Scan, { 
  foreignKey: 'qr_code_id', 
  as: 'scans' 
});

Scan.belongsTo(QRCode, { 
  foreignKey: 'qr_code_id', 
  as: 'qrcode' 
});

Table.hasMany(Scan, { 
  foreignKey: 'table_id', 
  as: 'scans' 
});

Scan.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});

Restaurant.hasMany(Scan, { 
  foreignKey: 'restaurant_id', 
  as: 'scans' 
});

Scan.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Payments
Restaurant.hasMany(Payment, { 
  foreignKey: 'restaurant_id', 
  as: 'payments',
  onDelete: 'CASCADE' 
});

Payment.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

User.hasMany(Payment, { 
  foreignKey: 'created_by', 
  as: 'created_payments' 
});

Payment.belongsTo(User, { 
  foreignKey: 'created_by', 
  as: 'creator' 
});

// Subscription
Restaurant.hasOne(Subscription, { 
  foreignKey: 'restaurant_id', 
  as: 'subscription' 
});

Subscription.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

Plan.hasMany(Subscription, { 
  foreignKey: 'plan_id', 
  as: 'subscriptions' 
});

Subscription.belongsTo(Plan, { 
  foreignKey: 'plan_id', 
  as: 'plan' 
});

// Activity Logs (KORRIGIERT)
User.hasMany(ActivityLog, { 
  foreignKey: 'user_id', 
  as: 'activities' 
});

ActivityLog.belongsTo(User, { 
  foreignKey: 'user_id', 
  as: 'user' 
});

Restaurant.hasMany(ActivityLog, { 
  foreignKey: 'restaurant_id', 
  as: 'activity_logs' 
});

ActivityLog.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' // KORRIGIERT von 'log_restaurant'
});

// Review Notifications
Restaurant.hasMany(ReviewNotification, { 
  foreignKey: 'restaurant_id', 
  as: 'review_notifications' 
});

ReviewNotification.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

Table.hasMany(ReviewNotification, { 
  foreignKey: 'table_id', 
  as: 'review_notifications' 
});

ReviewNotification.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});


// Debugging: Log all associations
if (process.env.NODE_ENV === 'development') {
  console.log('Model Associations:');
  console.log('- QRCode belongsTo Table');
  console.log('- QRCode belongsTo Restaurant');
  console.log('- Table hasOne QRCode (as qrcode_data)');
  console.log('- Table belongsTo Restaurant');
  console.log('- Restaurant hasMany Tables');
}

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