const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReviewNotification = sequelize.define('ReviewNotification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  table_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  review_author: {
    type: DataTypes.STRING,
    allowNull: true
  },
  review_text: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  review_rating: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  review_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  indexes: [
  {
    fields: ['restaurant_id', 'notification_sent']
  }
] ,
  notification_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

module.exports = ReviewNotification;