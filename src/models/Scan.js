// backend/src/models/Scan.js
// ERWEITERTE VERSION MIT REVIEW-TRACKING FELDERN

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
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  // ===== NEUE FELDER FÜR REVIEW-TRACKING =====
  
  // Markiert ob der Scan bereits für Review-Check verarbeitet wurde
  processed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  
  // Zeitpunkt der Verarbeitung
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Hat der Scan zu einer Review geführt?
  resulted_in_review: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: true
  },
  
  // Details der resultierenden Review (falls vorhanden)
  review_details: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
  },
  
  // Wie lange hat es gedauert bis zur Review? (in Minuten)
  review_reaction_time: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  
  // Anzahl der Review-Checks
  check_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Letzter Check-Zeitpunkt
  last_check_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
  
}, {
  tableName: 'scans',
  underscored: true,
  timestamps: true,
  indexes: [
    {
      fields: ['qr_code_id']
    },
    {
      fields: ['restaurant_id']
    },
    {
      fields: ['table_id']
    },
    {
      fields: ['created_at']
    },
    {
      // Index für unverarbeitete Scans
      fields: ['processed', 'created_at']
    },
    {
      // Index für Review-Analyse
      fields: ['restaurant_id', 'resulted_in_review']
    },
    {
      // Index für Performance
      fields: ['processed', 'restaurant_id']
    }
  ]
});

// ===== INSTANCE METHODS =====

// Markiere Scan als verarbeitet
Scan.prototype.markAsProcessed = async function(reviewFound = false, reviewDetails = null) {
  this.processed = true;
  this.processed_at = new Date();
  this.resulted_in_review = reviewFound;
  
  if (reviewDetails) {
    this.review_details = reviewDetails;
    
    // Berechne Reaktionszeit
    if (this.created_at) {
      const reactionTime = Math.round((Date.now() - new Date(this.created_at).getTime()) / 60000);
      this.review_reaction_time = reactionTime;
    }
  }
  
  return await this.save();
};

// Update Check-Versuch
Scan.prototype.updateCheckAttempt = async function() {
  this.check_attempts = (this.check_attempts || 0) + 1;
  this.last_check_at = new Date();
  return await this.save();
};

// ===== CLASS METHODS =====

// Hole unverarbeitete Scans
Scan.getUnprocessedScans = async function(minutes = 30) {
  const { Op } = require('sequelize');
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  
  return await this.findAll({
    where: {
      processed: false,
      created_at: {
        [Op.gte]: cutoffTime
      }
    },
    include: [
      {
        model: require('./Restaurant'),
        as: 'restaurant',
        attributes: ['id', 'name', 'google_place_id', 'notification_email', 'email']
      },
      {
        model: require('./Table'),
        as: 'table',
        attributes: ['id', 'table_number', 'description']
      }
    ],
    order: [['created_at', 'DESC']]
  });
};

// Statistik: Conversion Rate berechnen
Scan.getConversionRate = async function(restaurantId, days = 30) {
  const { Op } = require('sequelize');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const [totalScans, reviewScans] = await Promise.all([
    this.count({
      where: {
        restaurant_id: restaurantId,
        created_at: { [Op.gte]: startDate }
      }
    }),
    this.count({
      where: {
        restaurant_id: restaurantId,
        resulted_in_review: true,
        created_at: { [Op.gte]: startDate }
      }
    })
  ]);
  
  const conversionRate = totalScans > 0 ? ((reviewScans / totalScans) * 100).toFixed(2) : 0;
  
  return {
    total_scans: totalScans,
    scans_with_review: reviewScans,
    conversion_rate: parseFloat(conversionRate),
    period_days: days
  };
};

// Durchschnittliche Reaktionszeit
Scan.getAverageReactionTime = async function(restaurantId, days = 30) {
  const { Op } = require('sequelize');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const scansWithReviews = await this.findAll({
    where: {
      restaurant_id: restaurantId,
      resulted_in_review: true,
      review_reaction_time: { [Op.ne]: null },
      created_at: { [Op.gte]: startDate }
    },
    attributes: ['review_reaction_time']
  });
  
  if (scansWithReviews.length === 0) {
    return null;
  }
  
  const totalTime = scansWithReviews.reduce((sum, scan) => sum + scan.review_reaction_time, 0);
  const avgTime = Math.round(totalTime / scansWithReviews.length);
  
  return {
    average_minutes: avgTime,
    sample_size: scansWithReviews.length
  };
};

// Tages-Statistiken
Scan.getDailyStats = async function(restaurantId, date = new Date()) {
  const { Op } = require('sequelize');
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const [totalScans, reviewScans] = await Promise.all([
    this.count({
      where: {
        restaurant_id: restaurantId,
        created_at: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    }),
    this.count({
      where: {
        restaurant_id: restaurantId,
        resulted_in_review: true,
        created_at: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    })
  ]);
  
  return {
    date: date.toISOString().split('T')[0],
    total_scans: totalScans,
    scans_with_review: reviewScans,
    conversion_rate: totalScans > 0 ? ((reviewScans / totalScans) * 100).toFixed(2) : 0
  };
};

module.exports = Scan;