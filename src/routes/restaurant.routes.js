const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { Restaurant, Table, ReviewNotification } = require('../models');
const authMiddleware = require('../middleware/auth.middleware');
const restaurantMiddleware = require('../middleware/restaurant.middleware');

// Middleware
router.use(authMiddleware);
router.use(restaurantMiddleware);

// Restaurant Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.user.restaurant_id, {
      include: [Table]
    });
    
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant nicht gefunden' });
    }
    
    const totalTables = restaurant.Tables.length;
    const activeTables = restaurant.Tables.filter(t => t.is_active).length;
    const totalScans = restaurant.Tables.reduce((sum, t) => sum + t.scan_count, 0);
    
    res.json({
      restaurant,
      stats: {
        totalTables,
        activeTables,
        totalScans,
        lastReviewCount: restaurant.last_review_count
      }
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Tische abrufen
router.get('/tables', async (req, res) => {
  try {
    const tables = await Table.findAll({
      where: { restaurant_id: req.user.restaurant_id },
      order: [['table_number', 'ASC']]
    });
    
    res.json(tables);
  } catch (error) {
    console.error('Get Tables Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Tisch erstellen
router.post('/tables', async (req, res) => {
  try {
    const { table_number } = req.body;
    const restaurant_id = req.user.restaurant_id;
    
    // Prüfen ob Tischnummer bereits existiert
    const existingTable = await Table.findOne({
      where: { restaurant_id, table_number }
    });
    
    if (existingTable) {
      return res.status(400).json({ message: 'Tischnummer bereits vergeben' });
    }
    
    // Max. 150 Tische prüfen
    const tableCount = await Table.count({ where: { restaurant_id } });
    if (tableCount >= 150) {
      return res.status(400).json({ message: 'Maximale Anzahl von 150 Tischen erreicht' });
    }
    
    // Restaurant-Daten abrufen
    const restaurant = await Restaurant.findByPk(restaurant_id);
    if (!restaurant || !restaurant.google_business_url) {
      return res.status(400).json({ message: 'Google Business URL nicht konfiguriert' });
    }
    
    // QR-Code URL generieren
    const qrCodeUrl = `${restaurant.google_business_url}?table=${table_number}`;
    
    // QR-Code erstellen
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    const table = await Table.create({
      restaurant_id,
      table_number,
      qr_code: qrCodeDataUrl,
      qr_code_url: qrCodeUrl,
      is_active: true
    });
    
    res.json(table);
  } catch (error) {
    console.error('Create Table Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Tisch löschen
router.delete('/tables/:id', async (req, res) => {
  try {
    const table = await Table.findOne({
      where: { 
        id: req.params.id,
        restaurant_id: req.user.restaurant_id
      }
    });
    
    if (!table) {
      return res.status(404).json({ message: 'Tisch nicht gefunden' });
    }
    
    await table.destroy();
    
    res.json({ message: 'Tisch gelöscht' });
  } catch (error) {
    console.error('Delete Table Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// QR-Code regenerieren
router.post('/tables/:id/regenerate-qr', async (req, res) => {
  try {
    const table = await Table.findOne({
      where: { 
        id: req.params.id,
        restaurant_id: req.user.restaurant_id
      }
    });
    
    if (!table) {
      return res.status(404).json({ message: 'Tisch nicht gefunden' });
    }
    
    const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
    const qrCodeUrl = `${restaurant.google_business_url}?table=${table.table_number}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    table.qr_code = qrCodeDataUrl;
    table.qr_code_url = qrCodeUrl;
    await table.save();
    
    res.json(table);
  } catch (error) {
    console.error('Regenerate QR Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Restaurant-Einstellungen aktualisieren
router.patch('/settings', async (req, res) => {
  try {
    const { google_business_url, google_place_id } = req.body;
    
    const restaurant = await Restaurant.findByPk(req.user.restaurant_id);
    
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant nicht gefunden' });
    }
    
    if (google_business_url) restaurant.google_business_url = google_business_url;
    if (google_place_id) restaurant.google_place_id = google_place_id;
    
    await restaurant.save();
    
    res.json(restaurant);
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Benachrichtigungen abrufen
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await ReviewNotification.findAll({
      where: { restaurant_id: req.user.restaurant_id },
      include: [Table],
      order: [['created_at', 'DESC']],
      limit: 50
    });
    
    res.json(notifications);
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

module.exports = router;