/**
 * User Model
 * Datei: backend/src/models/User.js
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('admin', 'restaurant'),
      defaultValue: 'restaurant'
    },
    restaurant_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Restaurants',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reset_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reset_token_expires: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'Users',
    timestamps: true,
    underscored: true
  });

  return User;
};
