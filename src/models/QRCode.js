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
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'restaurants',
      key: 'id'
    }
  },
  code: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    set(value) {
      if (value) {
        this.setDataValue('code', String(value).toUpperCase());
      }
    },
    get() {
      const rawValue = this.getDataValue('code');
      return rawValue ? rawValue.toUpperCase() : rawValue;
    }
  },
  qr_image: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  redirect_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false  // WICHTIG: Nicht NULL erlauben
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
  timestamps: true,
  hooks: {
    beforeCreate: (qrCode) => {
      // Sicherstellen dass is_active beim Erstellen true ist
      if (qrCode.is_active === undefined || qrCode.is_active === null) {
        qrCode.is_active = true;
      }
    }
  }
});

module.exports = QRCode;