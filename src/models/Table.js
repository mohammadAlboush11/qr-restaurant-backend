const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Table = sequelize.define('Table', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'restaurants',
      key: 'id'
    }
  },
  table_number: {
    type: DataTypes.STRING,
    allowNull: false
    // KEIN unique: true hier!
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tracking_token: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  scan_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_scan_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  qr_code: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  qr_code_url: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'tables',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['restaurant_id', 'table_number'] // Composite unique index
    }
  ]
});

module.exports = Table;