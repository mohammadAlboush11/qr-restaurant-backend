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
  slug: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  price_monthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  price_yearly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'EUR'
  },
  duration_months: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  trial_days: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  max_tables: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_scans: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_users: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  features: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  limits: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_visible: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_popular: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  badge_text: {
    type: DataTypes.STRING,
    allowNull: true
  },
  badge_color: {
    type: DataTypes.STRING,
    allowNull: true
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

// Instance Methods
Plan.prototype.checkFeature = function(feature) {
  const features = this.features || [];
  return features.includes(feature);
};

Plan.prototype.getLimit = function(limitType) {
  const limits = this.limits || {};
  switch(limitType) {
    case 'tables': return this.max_tables || limits.tables || 999;
    case 'scans': return this.max_scans || limits.scans || 999999;
    case 'users': return this.max_users || limits.users || 1;
    default: return limits[limitType] || null;
  }
};

Plan.prototype.isAvailable = function() {
  return this.is_active && this.is_visible;
};

// Static Methods
Plan.findBySlug = async function(slug) {
  return this.findOne({ where: { slug, is_active: true } });
};

Plan.getActivePlans = async function() {
  return this.findAll({
    where: { is_active: true, is_visible: true },
    order: [['display_order', 'ASC']]
  });
};

module.exports = Plan;