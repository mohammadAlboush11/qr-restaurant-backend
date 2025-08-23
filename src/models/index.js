const sequelize = require('../config/database');
const User = require('./User');
const Restaurant = require('./Restaurant');
const Payment = require('./Payment');
const Table = require('./Table');
const ReviewNotification = require('./ReviewNotification');

// Beziehungen definieren
Restaurant.hasMany(User, { foreignKey: 'restaurant_id' });
User.belongsTo(Restaurant, { foreignKey: 'restaurant_id' });

Restaurant.hasMany(Payment, { foreignKey: 'restaurant_id' });
Payment.belongsTo(Restaurant, { foreignKey: 'restaurant_id' });

Restaurant.hasMany(Table, { foreignKey: 'restaurant_id' });
Table.belongsTo(Restaurant, { foreignKey: 'restaurant_id' });

Restaurant.hasMany(ReviewNotification, { foreignKey: 'restaurant_id' });
ReviewNotification.belongsTo(Restaurant, { foreignKey: 'restaurant_id' });

Table.hasMany(ReviewNotification, { foreignKey: 'table_id' });
ReviewNotification.belongsTo(Table, { foreignKey: 'table_id' });

module.exports = {
  sequelize,
  User,
  Restaurant,
  Payment,
  Table,
  ReviewNotification
};