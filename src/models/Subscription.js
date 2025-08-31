const { DataTypes, Op } = require('sequelize');  // Op importieren!
const sequelize = require('../config/database');


const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('trial', 'active', 'cancelled', 'expired', 'suspended'),
    defaultValue: 'trial'
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  auto_renew: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'yearly', 'custom'),
    defaultValue: 'monthly'
  },
  is_trial: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  trial_ends_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancellation_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_payment_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  next_payment_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  usage_stats: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  limits_override: {
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
  }
}, {
  tableName: 'subscriptions',
  underscored: true,
  timestamps: true
});

// Instance Methods
Subscription.prototype.isActive = function() {
  const now = new Date();
  return (this.status === 'active' || this.status === 'trial') && 
         this.end_date > now;
};

Subscription.prototype.isInTrial = function() {
  return this.status === 'trial' || this.is_trial;
};

Subscription.prototype.daysRemaining = function() {
  const now = new Date();
  const endDate = this.trial_ends_at || this.end_date;
  const diff = endDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

Subscription.prototype.checkFeature = async function(feature) {
  const Plan = require('./Plan');
  const plan = await Plan.findByPk(this.plan_id);
  if (!plan) return false;
  return plan.checkFeature(feature);
};

Subscription.prototype.checkLimit = async function(limitType) {
  const Plan = require('./Plan');
  const { Table, User } = require('./index');
  
  const plan = await Plan.findByPk(this.plan_id);
  if (!plan) return false;
  
  const override = this.limits_override[limitType];
  const limit = override || plan.getLimit(limitType);
  
  switch(limitType) {
    case 'tables':
      const tableCount = await Table.count({ 
        where: { restaurant_id: this.restaurant_id } 
      });
      return tableCount < limit;
    
    case 'users':
      const userCount = await User.count({ 
        where: { restaurant_id: this.restaurant_id } 
      });
      return userCount < limit;
    
    case 'scans':
      const stats = this.usage_stats || {};
      return (stats.scans || 0) < limit;
    
    default:
      return true;
  }
};

Subscription.prototype.incrementUsage = async function(metric) {
  const stats = this.usage_stats || {};
  stats[metric] = (stats[metric] || 0) + 1;
  this.usage_stats = stats;
  return this.save();
};

// Static Methods
Subscription.findActiveByRestaurant = async function(restaurantId) {
  return this.findOne({
    where: {
      restaurant_id: restaurantId,
      status: { [Op.in]: ['active', 'trial'] }
    }
  });
};

Subscription.checkExpired = async function() {
  const now = new Date();
  const expired = await this.findAll({
    where: {
      end_date: { [Op.lt]: now },
      status: { [Op.in]: ['active', 'trial'] }
    }
  });
  
  for (const sub of expired) {
    await sub.update({ status: 'expired' });
  }
  
  return expired.length;
};

module.exports = Subscription;