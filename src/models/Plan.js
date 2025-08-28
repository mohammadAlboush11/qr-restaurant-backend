const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  duration_months: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  max_tables: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_scans: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  features: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'plans',
  underscored: true,
  timestamps: true
});

module.exports = Plan;