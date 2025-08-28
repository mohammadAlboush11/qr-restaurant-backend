const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QRCode = sequelize.define('QRCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  table_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tables',
      key: 'id'
    }
  },
  code: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  qr_image: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  redirect_url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  scan_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_scanned_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'qr_codes',
  underscored: true,
  timestamps: true
});

module.exports = QRCode;