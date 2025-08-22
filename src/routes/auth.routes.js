const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User, Restaurant } = require('../models');

// Login mit verbessertem Error Handling
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(`🔐 Login-Versuch für: ${email}`);
    
    // Validierung
    if (!email || !password) {
      console.log('❌ E-Mail oder Passwort fehlt');
      return res.status(400).json({ 
        message: 'E-Mail und Passwort sind erforderlich' 
      });
    }
    
    // User suchen
    const user = await User.findOne({ 
      where: { email },
      include: [Restaurant]
    });
    
    if (!user) {
      console.log(`❌ User nicht gefunden: ${email}`);
      return res.status(401).json({ 
        message: 'Ungültige Anmeldedaten' 
      });
    }
    
    // Passwort prüfen
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      console.log(`❌ Falsches Passwort für: ${email}`);
      return res.status(401).json({ 
        message: 'Ungültige Anmeldedaten' 
      });
    }
    
    // Account aktiv?
    if (!user.is_active) {
      console.log(`❌ Account deaktiviert: ${email}`);
      return res.status(403).json({ 
        message: 'Ihr Account ist deaktiviert. Bitte kontaktieren Sie den Administrator.' 
      });
    }
    
    // Bei Restaurant-User: Restaurant aktiv?
    if (user.role === 'restaurant' && user.Restaurant) {
      if (!user.Restaurant.is_active) {
        console.log(`❌ Restaurant deaktiviert für: ${email}`);
        return res.status(403).json({ 
          message: 'Ihr Restaurant ist deaktiviert. Bitte kontaktieren Sie den Administrator.' 
        });
      }
    }
    
    // JWT Token erstellen
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        restaurant_id: user.restaurant_id 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    console.log(`✅ Login erfolgreich: ${email} (${user.role})`);
    
    // Response
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant: user.Restaurant ? {
          id: user.Restaurant.id,
          name: user.Restaurant.name,
          is_active: user.Restaurant.is_active
        } : null
      }
    });
    
  } catch (error) {
    console.error('❌ Login Error:', error);
    res.status(500).json({ 
      message: 'Server Fehler beim Login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Test-Endpoint zum Prüfen der User
router.get('/test-users', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'role', 'is_active'],
      include: [{
        model: Restaurant,
        attributes: ['id', 'name', 'is_active']
      }]
    });
    
    res.json({
      total: users.length,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        active: u.is_active,
        restaurant: u.Restaurant ? u.Restaurant.name : null
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Kein Token vorhanden' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findByPk(decoded.id, {
      include: [Restaurant]
    });
    
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Ungültiger Token' });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant: user.Restaurant
      }
    });
  } catch (error) {
    res.status(401).json({ message: 'Ungültiger Token' });
  }
});

module.exports = router;