/**
 * Initialize Super Admin
 * Speichern als: backend/src/utils/initAdmin.js
 */

const { User } = require('../models');
const logger = require('./logger');

const createSuperAdmin = async () => {
    try {
        const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@qr-restaurant.com';
        const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!@#';

        // Check if super admin already exists
        const existingAdmin = await User.findOne({
            where: {
                email: adminEmail,
                role: 'super_admin'
            }
        });

        if (!existingAdmin) {
            const admin = await User.create({
                email: adminEmail,
                password: adminPassword,
                role: 'super_admin',
                first_name: 'Super',
                last_name: 'Admin',
                is_active: true,
                is_email_verified: true,
                email_verified_at: new Date()
            });

            logger.info('✅ Super Admin created successfully');
            logger.info(`📧 Email: ${adminEmail}`);
            
            if (process.env.NODE_ENV === 'development') {
                logger.info(`🔑 Password: ${adminPassword}`);
            }
        } else {
            logger.info('ℹ️ Super Admin already exists');
        }
    } catch (error) {
        logger.error('Failed to create Super Admin:', error);
        throw error;
    }
};

module.exports = { createSuperAdmin };