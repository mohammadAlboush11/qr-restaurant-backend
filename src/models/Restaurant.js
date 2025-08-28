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
  slug: {
    type: DataTypes.STRING,
    unique: true,
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
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  subscription_status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired', 'trial'),
    defaultValue: 'trial' // Start mit Trial!
  },
  subscription_end_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  google_place_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  google_review_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notification_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  user_id: { // WICHTIG: user_id statt owner_id
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'restaurants',
  underscored: true,
  timestamps: true
});

module.exports = Restaurant;