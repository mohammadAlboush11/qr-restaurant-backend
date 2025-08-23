/**
 * Database Models Index
 * Datei: backend/src/models/index.js
 */

const { Sequelize } = require('sequelize');
const path = require('path');

// Datenbank-Konfiguration
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Models importieren
const User = require('./User')(sequelize);
const Restaurant = require('./Restaurant')(sequelize);
const Table = require('./Table')(sequelize);
const Payment = require('./Payment')(sequelize);
const ReviewNotification = require('./ReviewNotification')(sequelize);

// Assoziationen definieren

// User <-> Restaurant (1:1)
User.hasOne(Restaurant, { 
  foreignKey: 'user_id', 
  as: 'restaurant' 
});
Restaurant.belongsTo(User, { 
  foreignKey: 'user_id', 
  as: 'user' 
});

// Restaurant <-> Tables (1:n)
Restaurant.hasMany(Table, { 
  foreignKey: 'restaurant_id', 
  as: 'tables' 
});
Table.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant <-> Payments (1:n)
Restaurant.hasMany(Payment, { 
  foreignKey: 'restaurant_id', 
  as: 'payments' 
});
Payment.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Restaurant <-> ReviewNotifications (1:n)
Restaurant.hasMany(ReviewNotification, { 
  foreignKey: 'restaurant_id', 
  as: 'notifications' 
});
ReviewNotification.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id', 
  as: 'restaurant' 
});

// Table <-> ReviewNotifications (1:n) - Optional
Table.hasMany(ReviewNotification, { 
  foreignKey: 'table_id', 
  as: 'notifications' 
});
ReviewNotification.belongsTo(Table, { 
  foreignKey: 'table_id', 
  as: 'table' 
});

module.exports = {
  sequelize,
  Sequelize,
  User,
  Restaurant,
  Table,
  Payment,
  ReviewNotification
};
