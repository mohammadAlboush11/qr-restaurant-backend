/**
 * Table Controller
 * Speichern als: backend/src/controllers/restaurant/table.controller.js
 */

const { Table, Restaurant } = require('../../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

class TableController {
  // Alle Tische abrufen
  async getAllTables(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      const tables = await Table.findAll({
        where: { restaurant_id: restaurantId },
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

  // Einzelnen Tisch abrufen
  async getTable(req, res) {
    try {
      const { id } = req.params;
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

  // Tisch erstellen
  async createTable(req, res) {
    try {
      const { table_number, description } = req.body;
      const restaurantId = req.user.restaurant_id;

      // Prüfe ob Tischnummer bereits existiert
      const existingTable = await Table.findOne({
        where: { 
          restaurant_id: restaurantId,
          table_number 
        }
      });

      if (existingTable) {
        return res.status(400).json({
          success: false,
          message: 'Tischnummer existiert bereits'
        });
      }

      // Erstelle Tisch mit Tracking Token
      const table = await Table.create({
        restaurant_id: restaurantId,
        table_number,
        description,
        tracking_token: uuidv4(),
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
        message: 'Fehler beim Erstellen des Tisches'
      });
    }
  }

  // Tisch aktualisieren
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

      // Prüfe ob neue Tischnummer bereits existiert
      if (table_number && table_number !== table.table_number) {
        const existingTable = await Table.findOne({
          where: { 
            restaurant_id: restaurantId,
            table_number,
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

      // Update
      await table.update({
        ...(table_number !== undefined && { table_number }),
        ...(description !== undefined && { description }),
        ...(is_active !== undefined && { is_active })
      });

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

  // Tisch löschen
  async deleteTable(req, res) {
    try {
      const { id } = req.params;
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

      await table.destroy();

      res.json({
        success: true,
        message: 'Tisch erfolgreich gelöscht'
      });

    } catch (error) {
      console.error('Delete Table Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen des Tisches'
      });
    }
  }

  // Mehrere Tische erstellen
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

      const tables = [];
      const errors = [];

      for (let i = startNumber; i <= endNumber; i++) {
        const tableNumber = prefix ? `${prefix}${i}` : i.toString();
        
        // Prüfe ob bereits existiert
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
          tracking_token: uuidv4(),
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

  // Mehrere Tische löschen
  async deleteMultipleTables(req, res) {
    try {
      const { tableIds } = req.body;
      const restaurantId = req.user.restaurant_id;

      if (!tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Keine Tisch-IDs angegeben'
        });
      }

      const result = await Table.destroy({
        where: {
          id: tableIds,
          restaurant_id: restaurantId
        }
      });

      res.json({
        success: true,
        message: `${result} Tische gelöscht`
      });

    } catch (error) {
      console.error('Delete Multiple Tables Error:', error);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen der Tische'
      });
    }
  }
}

module.exports = new TableController();