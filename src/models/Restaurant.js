const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Restaurant = sequelize.define('Restaurant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  google_place_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  google_business_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  subscription_status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'inactive'
  },
  subscription_end_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_review_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_review_check: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = Restaurant;