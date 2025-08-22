const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User, Restaurant } = require('../models');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ 
      where: { email },
      include: [Restaurant]
    });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Ungültige Anmeldedaten' });
    }
    
    if (!user.is_active) {
      return res.status(403).json({ message: 'Account ist deaktiviert' });
    }
    
    // Bei Restaurant-User prüfen ob Restaurant aktiv ist
    if (user.role === 'restaurant' && user.Restaurant) {
      if (!user.Restaurant.is_active) {
        return res.status(403).json({ message: 'Restaurant ist deaktiviert' });
      }
    }
    
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
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurant: user.Restaurant
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server Fehler' });
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