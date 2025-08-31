const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  severity: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    defaultValue: 'info'
  },
  entity_type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  entity_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  details: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  old_values: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  new_values: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'activity_logs',
  underscored: true,
  timestamps: true
});

// Static Methods
ActivityLog.logActivity = async function(data) {
  try {
    return await this.create(data);
  } catch (error) {
    console.error('ActivityLog Error:', error);
    // Fehler nicht werfen, um Hauptoperation nicht zu blockieren
    return null;
  }
};

ActivityLog.getUserActivities = async function(userId, limit = 10) {
  return this.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit
  });
};

module.exports = ActivityLog;