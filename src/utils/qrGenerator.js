/**
 * QR Code Generator Utility
 * Speichern als: backend/src/utils/qrGenerator.js
 */

const QRCode = require('qrcode');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class QRCodeGenerator {
    constructor(options = {}) {
        this.defaultOptions = {
            width: 512,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'M',
            ...options
        };
    }

    /**
     * Generate QR code as Buffer
     */
    async generateBuffer(data, options = {}) {
        try {
            const qrOptions = { ...this.defaultOptions, ...options };
            const buffer = await QRCode.toBuffer(data, qrOptions);
            return buffer;
        } catch (error) {
            logger.error('QR code generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate QR code as Base64
     */
    async generateBase64(data, options = {}) {
        try {
            const qrOptions = { ...this.defaultOptions, ...options };
            const dataUrl = await QRCode.toDataURL(data, qrOptions);
            return dataUrl;
        } catch (error) {
            logger.error('QR code generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate QR code as SVG
     */
    async generateSVG(data, options = {}) {
        try {
            const qrOptions = { 
                ...this.defaultOptions, 
                ...options,
                type: 'svg'
            };
            const svg = await QRCode.toString(data, qrOptions);
            return svg;
        } catch (error) {
            logger.error('QR code SVG generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate QR code with logo
     */
    async generateWithLogo(data, logoPath, options = {}) {
        try {
            // Generate QR code
            const qrBuffer = await this.generateBuffer(data, options);
            
            // Read logo
            const logoBuffer = await fs.readFile(logoPath);
            
            // Get QR code dimensions
            const qrImage = sharp(qrBuffer);
            const qrMetadata = await qrImage.metadata();
            
            // Resize logo to 20% of QR code size
            const logoSize = Math.floor(qrMetadata.width * 0.2);
            const resizedLogo = await sharp(logoBuffer)
                .resize(logoSize, logoSize, { fit: 'contain' })
                .toBuffer();
            
            // Composite logo onto QR code
            const finalImage = await sharp(qrBuffer)
                .composite([{
                    input: resizedLogo,
                    gravity: 'center'
                }])
                .png()
                .toBuffer();
            
            return finalImage;
        } catch (error) {
            logger.error('QR code with logo generation failed:', error);
            throw error;
        }
    }

    /**
     * Save QR code to file
     */
    async saveToFile(data, filePath, options = {}) {
        try {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            
            const ext = path.extname(filePath).toLowerCase();
            
            if (ext === '.svg') {
                const svg = await this.generateSVG(data, options);
                await fs.writeFile(filePath, svg);
            } else {
                const buffer = await this.generateBuffer(data, options);
                await fs.writeFile(filePath, buffer);
            }
            
            logger.info(`QR code saved to: ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error('Failed to save QR code:', error);
            throw error;
        }
    }

    /**
     * Generate batch QR codes
     */
    async generateBatch(items, options = {}) {
        const results = [];
        
        for (const item of items) {
            try {
                const buffer = await this.generateBuffer(item.data, {
                    ...options,
                    ...item.options
                });
                
                results.push({
                    id: item.id,
                    success: true,
                    buffer
                });
            } catch (error) {
                results.push({
                    id: item.id,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Generate QR code with custom design
     */
    async generateCustom(data, customOptions = {}) {
        const {
            shape = 'square', // square, dots, rounded
            gradient = false,
            logo = null,
            frame = false,
            frameText = '',
            ...options
        } = customOptions;

        try {
            let qrBuffer = await this.generateBuffer(data, options);

            // Apply custom shapes (would need additional library)
            if (shape !== 'square') {
                // Implement custom shapes
            }

            // Add logo if provided
            if (logo) {
                qrBuffer = await this.generateWithLogo(data, logo, options);
            }

            // Add frame if requested
            if (frame) {
                qrBuffer = await this.addFrame(qrBuffer, frameText);
            }

            return qrBuffer;
        } catch (error) {
            logger.error('Custom QR generation failed:', error);
            throw error;
        }
    }

    /**
     * Add frame to QR code
     */
    async addFrame(qrBuffer, text = '') {
        try {
            const qrImage = sharp(qrBuffer);
            const metadata = await qrImage.metadata();
            
            const frameWidth = metadata.width + 100;
            const frameHeight = metadata.height + 150;
            
            // Create white background
            const frame = sharp({
                create: {
                    width: frameWidth,
                    height: frameHeight,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            });

            // Add QR code to frame
            const framedImage = await frame
                .composite([{
                    input: qrBuffer,
                    top: 50,
                    left: 50
                }])
                .png()
                .toBuffer();

            // Add text if provided (would need text rendering library)
            if (text) {
                // Implement text addition
            }

            return framedImage;
        } catch (error) {
            logger.error('Frame addition failed:', error);
            throw error;
        }
    }

    /**
     * Validate QR code data
     */
    validateData(data) {
        if (!data || typeof data !== 'string') {
            throw new Error('Invalid QR code data');
        }

        if (data.length > 4296) {
            throw new Error('Data too large for QR code');
        }

        return true;
    }

    /**
     * Get optimal error correction level based on data size
     */
    getOptimalErrorCorrection(dataLength) {
        if (dataLength < 100) return 'H'; // High
        if (dataLength < 500) return 'Q'; // Quartile
        if (dataLength < 1000) return 'M'; // Medium
        return 'L'; // Low
    }
}

module.exports = new QRCodeGenerator();