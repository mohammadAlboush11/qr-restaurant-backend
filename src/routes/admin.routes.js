const express = require('express');
const router = express.Router();
const { User, Restaurant, Payment, Table, ReviewNotification } = require('../models');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');

// Middleware für alle Admin-Routes
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard Statistiken
router.get('/dashboard', async (req, res) => {
  try {
    const totalRestaurants = await Restaurant.count();
    const activeRestaurants = await Restaurant.count({ where: { is_active: true } });
    const totalPayments = await Payment.sum('amount') || 0;
    const totalTables = await Table.count();
    
    res.json({
      totalRestaurants,
      activeRestaurants,
      totalPayments,
      totalTables
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Alle Restaurants abrufen
router.get('/restaurants', async (req, res) => {
  try {
    const restaurants = await Restaurant.findAll({
      include: [
        { model: User, attributes: ['id', 'email', 'name'] },
        { model: Payment, order: [['payment_date', 'DESC']], limit: 1 }
      ],
      order: [['created_at', 'DESC']]
    });
    
    res.json(restaurants);
  } catch (error) {
    console.error('Get Restaurants Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Restaurant erstellen
router.post('/restaurants', async (req, res) => {
  try {
    const { name, email, phone, address, google_business_url, user_email, user_password } = req.body;
    
    // Restaurant erstellen
    const restaurant = await Restaurant.create({
      name,
      email,
      phone,
      address,
      google_business_url,
      is_active: true,
      subscription_status: 'inactive'
    });
    
    // Restaurant-User erstellen
    if (user_email && user_password) {
      await User.create({
        email: user_email,
        password: user_password,
        name: name,
        role: 'restaurant',
        restaurant_id: restaurant.id,
        is_active: true
      });
    }
    
    res.json(restaurant);
  } catch (error) {
    console.error('Create Restaurant Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Restaurant aktivieren/deaktivieren
router.patch('/restaurants/:id/toggle-status', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant nicht gefunden' });
    }
    
    restaurant.is_active = !restaurant.is_active;
    
    // Wenn Restaurant deaktiviert wird, auch alle QR-Codes deaktivieren
    if (!restaurant.is_active) {
      await Table.update(
        { is_active: false },
        { where: { restaurant_id: restaurant.id } }
      );
      
      // Auch User deaktivieren
      await User.update(
        { is_active: false },
        { where: { restaurant_id: restaurant.id } }
      );
    } else {
      // Bei Aktivierung User wieder aktivieren
      await User.update(
        { is_active: true },
        { where: { restaurant_id: restaurant.id } }
      );
    }
    
    await restaurant.save();
    
    res.json({ 
      message: `Restaurant ${restaurant.is_active ? 'aktiviert' : 'deaktiviert'}`,
      restaurant 
    });
  } catch (error) {
    console.error('Toggle Status Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Restaurant löschen
router.delete('/restaurants/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id);
    
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant nicht gefunden' });
    }
    
    // Alle zugehörigen Daten löschen
    await User.destroy({ where: { restaurant_id: restaurant.id } });
    await Table.destroy({ where: { restaurant_id: restaurant.id } });
    await Payment.destroy({ where: { restaurant_id: restaurant.id } });
    await ReviewNotification.destroy({ where: { restaurant_id: restaurant.id } });
    
    await restaurant.destroy();
    
    res.json({ message: 'Restaurant gelöscht' });
  } catch (error) {
    console.error('Delete Restaurant Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Zahlungen abrufen
router.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [Restaurant],
      order: [['payment_date', 'DESC']]
    });
    
    res.json(payments);
  } catch (error) {
    console.error('Get Payments Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Zahlung hinzufügen
router.post('/payments', async (req, res) => {
  try {
    const { restaurant_id, amount, payment_date, customer_name, notes } = req.body;
    
    const payment = await Payment.create({
      restaurant_id,
      amount,
      payment_date,
      customer_name,
      notes,
      created_by: req.user.id
    });
    
    // Restaurant Subscription aktualisieren
    const restaurant = await Restaurant.findByPk(restaurant_id);
    if (restaurant) {
      const endDate = new Date(payment_date);
      endDate.setMonth(endDate.getMonth() + 1); // 1 Monat Laufzeit
      
      restaurant.subscription_status = 'active';
      restaurant.subscription_end_date = endDate;
      await restaurant.save();
    }
    
    res.json(payment);
  } catch (error) {
    console.error('Create Payment Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Restaurant-User hinzufügen
router.post('/restaurants/:id/users', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const restaurant_id = req.params.id;
    
    // Prüfen ob E-Mail bereits existiert
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'E-Mail bereits vergeben' });
    }
    
    const user = await User.create({
      email,
      password,
      name,
      role: 'restaurant',
      restaurant_id,
      is_active: true
    });
    
    res.json(user);
  } catch (error) {
    console.error('Create User Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

// Restaurant-User abrufen
router.get('/restaurants/:id/users', async (req, res) => {
  try {
    const users = await User.findAll({
      where: { restaurant_id: req.params.id },
      attributes: ['id', 'email', 'name', 'is_active', 'created_at']
    });
    
    res.json(users);
  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
  }
});

module.exports = router;