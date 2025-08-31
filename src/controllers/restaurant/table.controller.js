const { Table, Restaurant, QRCode, Scan } = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const crypto = require('crypto');

class TableController {
  async getAllTables(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      const tables = await Table.findAll({
        where: { restaurant_id: restaurantId },
        include: [{
          model: QRCode,
          as: 'qrcode_data',
          required: false
        }],
        order: [['table_number', 'ASC']]
      });

      res.json({
        success: true,
        data: tables
      });

    } catch (error) {
      console.error('Get Tables Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen der Tische'
      });
    }
  }

  async getTable(req, res) {
    try {
      const { id } = req.params;
      const restaurantId = req.user.restaurant_id;
      
      const table = await Table.findOne({
        where: { 
          id, 
          restaurant_id: restaurantId 
        },
        include: [{
          model: QRCode,
          as: 'qrcode_data'
        }]
      });

      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Tisch nicht gefunden'
        });
      }

      res.json({
        success: true,
        data: table
      });

    } catch (error) {
      console.error('Get Table Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Abrufen des Tisches'
      });
    }
  }

  async createTable(req, res) {
    try {
      const { table_number, description } = req.body;
      const restaurantId = req.user.restaurant_id;

      // VALIDATION: Table number required and not empty
      if (!table_number || table_number.toString().trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Tischnummer ist erforderlich und darf nicht leer sein'
        });
      }

      // Check table limit
      const restaurant = await Restaurant.findByPk(restaurantId);
      const tableCount = await Table.count({ 
        where: { restaurant_id: restaurantId } 
      });

      // Plan-basierte Limits
      const limits = {
        'trial': 5,
        'basic': 20,
        'premium': 50,
        'enterprise': 999
      };
      
      const limit = limits[restaurant.subscription_status] || 5;
      
      if (tableCount >= limit) {
        return res.status(403).json({
          success: false,
          message: `Tisch-Limit erreicht (${limit} Tische für ${restaurant.subscription_status} Plan)`
        });
      }

      // Check if table number exists
      const existingTable = await Table.findOne({
        where: { 
          restaurant_id: restaurantId,
          table_number: table_number.toString()
        }
      });

      if (existingTable) {
        return res.status(400).json({
          success: false,
          message: 'Tischnummer existiert bereits'
        });
      }

      // Create table
      const trackingToken = crypto.randomBytes(16).toString('hex');
      
      const table = await Table.create({
        restaurant_id: restaurantId,
        table_number: table_number.toString(),
        description: description || '',
        tracking_token: trackingToken,
        is_active: true,
        scan_count: 0
      });

      res.status(201).json({
        success: true,
        message: 'Tisch erfolgreich erstellt',
        data: table
      });

    } catch (error) {
      console.error('Create Table Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen des Tisches',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async updateTable(req, res) {
    try {
      const { id } = req.params;
      const { table_number, description, is_active } = req.body;
      const restaurantId = req.user.restaurant_id;

      const table = await Table.findOne({
        where: { 
          id, 
          restaurant_id: restaurantId 
        }
      });

      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Tisch nicht gefunden'
        });
      }

      // Check if new table number exists
      if (table_number && table_number !== table.table_number) {
        const existingTable = await Table.findOne({
          where: { 
            restaurant_id: restaurantId,
            table_number: table_number.toString(),
            id: { [Op.ne]: id }
          }
        });

        if (existingTable) {
          return res.status(400).json({
            success: false,
            message: 'Tischnummer existiert bereits'
          });
        }
      }

      // Update table
      await table.update({
        ...(table_number !== undefined && { table_number: table_number.toString() }),
        ...(description !== undefined && { description }),
        ...(is_active !== undefined && { is_active })
      });

      // If deactivating table, also deactivate QR code
      if (is_active === false) {
        await QRCode.update(
          { is_active: false },
          { where: { table_id: id } }
        );
      }

      res.json({
        success: true,
        message: 'Tisch erfolgreich aktualisiert',
        data: table
      });

    } catch (error) {
      console.error('Update Table Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Aktualisieren des Tisches'
      });
    }
  }

  async deleteTable(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const restaurantId = req.user.restaurant_id;

      const table = await Table.findOne({
        where: { 
          id, 
          restaurant_id: restaurantId 
        },
        transaction
      });

      if (!table) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Tisch nicht gefunden'
        });
      }

      // Delete related data
      await Scan.destroy({
        where: { table_id: id },
        transaction
      });

      await QRCode.destroy({
        where: { table_id: id },
        transaction
      });

      await table.destroy({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Tisch erfolgreich gelöscht'
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Delete Table Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen des Tisches',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async createMultipleTables(req, res) {
    try {
      const { startNumber, endNumber, prefix = '' } = req.body;
      const restaurantId = req.user.restaurant_id;

      if (!startNumber || !endNumber || startNumber > endNumber) {
        return res.status(400).json({
          success: false,
          message: 'Ungültige Tischnummern-Bereiche'
        });
      }

      // Check limit
      const restaurant = await Restaurant.findByPk(restaurantId);
      const currentCount = await Table.count({ 
        where: { restaurant_id: restaurantId } 
      });
      
      const limits = {
        'trial': 5,
        'basic': 20, 
        'premium': 50,
        'enterprise': 999
      };
      
      const limit = limits[restaurant.subscription_status] || 5;
      const toCreate = endNumber - startNumber + 1;
      
      if (currentCount + toCreate > limit) {
        return res.status(403).json({
          success: false,
          message: `Würde Tisch-Limit überschreiten (${limit} Tische für ${restaurant.subscription_status} Plan)`
        });
      }

      const tables = [];
      const errors = [];

      for (let i = startNumber; i <= endNumber; i++) {
        const tableNumber = prefix ? `${prefix}${i}` : i.toString();
        
        const exists = await Table.findOne({
          where: { 
            restaurant_id: restaurantId,
            table_number: tableNumber
          }
        });

        if (exists) {
          errors.push(`Tisch ${tableNumber} existiert bereits`);
          continue;
        }

        const table = await Table.create({
          restaurant_id: restaurantId,
          table_number: tableNumber,
          tracking_token: crypto.randomBytes(16).toString('hex'),
          is_active: true,
          scan_count: 0
        });

        tables.push(table);
      }

      res.json({
        success: true,
        message: `${tables.length} Tische erstellt`,
        data: tables,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Create Multiple Tables Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Erstellen der Tische'
      });
    }
  }

  async deleteMultipleTables(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { tableIds } = req.body;
      const restaurantId = req.user.restaurant_id;

      if (!tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Keine Tisch-IDs angegeben'
        });
      }

      // Delete related data first
      await Scan.destroy({
        where: { table_id: tableIds },
        transaction
      });

      await QRCode.destroy({
        where: { table_id: tableIds },
        transaction
      });

      const result = await Table.destroy({
        where: {
          id: tableIds,
          restaurant_id: restaurantId
        },
        transaction
      });

      await transaction.commit();

      res.json({
        success: true,
        message: `${result} Tische gelöscht`
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Delete Multiple Tables Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen der Tische'
      });
    }
  }
}

module.exports = new TableController();