const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Scan = sequelize.define('Scan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  qr_code_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'qr_codes',
      key: 'id'
    }
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'restaurants',
      key: 'id'
    }
  },
  table_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tables',
      key: 'id'
    }
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  location: {
    type: DataTypes.JSON,
    allowNull: true
  },
  redirected_to: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'scans',
  underscored: true,
  timestamps: true
});

module.exports = Scan;