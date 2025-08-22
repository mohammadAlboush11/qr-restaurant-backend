/**
 * Auth Controller
 * Speichern als: backend/src/controllers/auth.controller.js
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Restaurant, ActivityLog } = require('../models');
const { Op } = require('sequelize');

// Generate JWT Token
const generateToken = (user, type = 'access') => {
    const secret = type === 'access' 
        ? process.env.JWT_SECRET 
        : process.env.JWT_REFRESH_SECRET;
    
    const expiresIn = type === 'access' 
        ? process.env.JWT_EXPIRE || '7d'
        : process.env.JWT_REFRESH_EXPIRE || '30d';

    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role 
        },
        secret,
        { expiresIn }
    );
};

// Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('Login attempt for:', email);

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email und Passwort sind erforderlich'
            });
        }

        // Find user
        const user = await User.findOne({
            where: { 
                email: email.toLowerCase(),
                is_active: true
            },
            include: [{
                model: Restaurant,
                as: 'restaurants',
                required: false
            }]
        });

        if (!user) {
            console.log('User not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Ungültige Anmeldedaten'
            });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            console.log('Invalid password for:', email);
            
            // Increment login attempts
            await user.increment('login_attempts');
            
            return res.status(401).json({
                success: false,
                message: 'Ungültige Anmeldedaten'
            });
        }

        // Reset login attempts
        await user.update({
            login_attempts: 0,
            last_login_at: new Date(),
            last_login_ip: req.ip
        });

        // Generate tokens
        const accessToken = generateToken(user, 'access');
        const refreshToken = generateToken(user, 'refresh');

        // Log activity
        await ActivityLog.create({
            user_id: user.id,
            action: 'login_success',
            category: 'auth',
            severity: 'info',
            description: 'Erfolgreiche Anmeldung',
            metadata: {
                ip: req.ip,
                user_agent: req.get('user-agent')
            }
        });

        // Prepare user data
        const userData = {
            id: user.id,
            email: user.email,
            role: user.role,
            first_name: user.first_name,
            last_name: user.last_name,
            is_email_verified: user.is_email_verified,
            restaurants: user.restaurants
        };

        console.log('Login successful for:', email);

        res.json({
            success: true,
            message: 'Erfolgreich angemeldet',
            data: {
                user: userData,
                access_token: accessToken,
                refresh_token: refreshToken
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Interner Serverfehler'
        });
    }
};

// Get current user
const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] },
            include: [{
                model: Restaurant,
                as: 'restaurants',
                required: false
            }]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Benutzer nicht gefunden'
            });
        }

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Interner Serverfehler'
        });
    }
};

// Refresh token
const refreshToken = async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                message: 'Refresh Token erforderlich'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
        
        // Find user
        const user = await User.findByPk(decoded.id);
        
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Ungültiger Refresh Token'
            });
        }

        // Generate new access token
        const newAccessToken = generateToken(user, 'access');

        res.json({
            success: true,
            data: {
                access_token: newAccessToken
            }
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({
            success: false,
            message: 'Ungültiger Refresh Token'
        });
    }
};

// Logout
const logout = async (req, res) => {
    try {
        // Log activity if user is authenticated
        if (req.user) {
            await ActivityLog.create({
                user_id: req.user.id,
                action: 'logout',
                category: 'auth',
                severity: 'info',
                description: 'Benutzer abgemeldet'
            });
        }

        res.json({
            success: true,
            message: 'Erfolgreich abgemeldet'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Interner Serverfehler'
        });
    }
};

module.exports = {
    login,
    getCurrentUser,
    refreshToken,
    logout
};