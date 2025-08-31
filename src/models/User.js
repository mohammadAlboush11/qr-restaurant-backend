const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    },
    set(value) {
      this.setDataValue('email', value.toLowerCase().trim());
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('admin', 'restaurant', 'restaurant_owner', 'staff', 'super_admin'),
    defaultValue: 'restaurant'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_email_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  email_verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  email_verification_token: {
    type: DataTypes.STRING,
    allowNull: true
  },
  password_reset_token: {
    type: DataTypes.STRING,
    allowNull: true
  },
  password_reset_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  underscored: true,
  timestamps: true,
  paranoid: false, // Manuelles Soft-Delete
  hooks: {
    beforeCreate: async (user) => {
      if (user.password && !user.password.startsWith('$2')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password && !user.password.startsWith('$2')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Instance Methods
User.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

User.prototype.toSafeObject = function() {
  const obj = this.toJSON();
  delete obj.password;
  delete obj.password_reset_token;
  delete obj.email_verification_token;
  return obj;
};

User.prototype.resetLoginAttempts = async function() {
  this.login_attempts = 0;
  this.locked_until = null;
  return this.save();
};

User.prototype.incrementLoginAttempts = async function() {
  this.login_attempts += 1;
  if (this.login_attempts >= 5) {
    const lockTime = new Date();
    lockTime.setMinutes(lockTime.getMinutes() + 30);
    this.locked_until = lockTime;
  }
  return this.save();
};

// Static Methods
User.findByEmail = async function(email) {
  return this.findOne({
    where: { email: email.toLowerCase().trim() }
  });
};

module.exports = User;