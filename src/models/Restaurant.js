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
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Restaurant-Name darf nicht leer sein'
      },
      len: {
        args: [1, 255],
        msg: 'Restaurant-Name muss zwischen 1 und 255 Zeichen lang sein'
      }
    }
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
      isEmail: {
        msg: 'Muss eine gültige E-Mail-Adresse sein'
      }
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  subscription_status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired', 'trial', 'cancelled'),
    defaultValue: 'trial'
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
    type: DataTypes.STRING(500),
    allowNull: true
  },
  google_business_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  notification_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_review_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_review_check: {
    type: DataTypes.DATE,
    allowNull: true
  },
  current_rating: {
    type: DataTypes.DECIMAL(2, 1),
    allowNull: true
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  owner_name: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'restaurants',
  underscored: true,
  timestamps: true,
  hooks: {
    beforeValidate: (restaurant) => {
      // XSS-Prevention: Entferne nur script-Tags, behalte den Text
      if (restaurant.name) {
        // Entferne script-Tags aber behalte den Inhalt
        restaurant.name = restaurant.name
          .replace(/<script[^>]*>/gi, '') // Öffnende script-Tags
          .replace(/<\/script>/gi, '')     // Schließende script-Tags
          .trim();
        
        // Wenn nach Bereinigung leer, setze einen Default-Wert
        if (!restaurant.name || restaurant.name.length === 0) {
          restaurant.name = 'XSS-Prevented-Name';
        }
      }
      
      // Ensure email is lowercase
      if (restaurant.email) {
        restaurant.email = restaurant.email.toLowerCase().trim();
      }
      
      if (restaurant.notification_email) {
        restaurant.notification_email = restaurant.notification_email.toLowerCase().trim();
      }
    }
  }
});

// Instance Methods
Restaurant.prototype.countTables = async function() {
  const { Table } = require('./index');
  return Table.count({ where: { restaurant_id: this.id } });
};

module.exports = Restaurant;