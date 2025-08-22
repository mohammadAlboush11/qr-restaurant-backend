/**
 * QR Code Controller
 * Speichern als: backend/src/controllers/restaurant/qrcode.controller.js
 */

const { 
    QRCode, 
    Table, 
    Restaurant,
    Scan,
    ActivityLog 
} = require('../../models');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const QRCodeLib = require('qrcode');
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const logger = require('../../utils/logger');

// Get all QR codes
const getAllQRCodes = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { is_active } = req.query;

    const where = { restaurant_id: restaurantId };
    if (is_active !== undefined) where.is_active = is_active === 'true';

    const qrCodes = await QRCode.findAll({
        where,
        include: [{
            model: Table,
            as: 'table',
            attributes: ['id', 'number', 'name', 'location']
        }],
        order: [['created_at', 'DESC']]
    });

    res.json({
        success: true,
        data: qrCodes
    });
});

// Get single QR code
const getQRCode = asyncHandler(async (req, res) => {
    const { restaurantId, qrCodeId } = req.params;

    const qrCode = await QRCode.findOne({
        where: {
            id: qrCodeId,
            restaurant_id: restaurantId
        },
        include: [{
            model: Table,
            as: 'table'
        }]
    });

    if (!qrCode) {
        throw new AppError('QR-Code nicht gefunden', 404);
    }

    // Get analytics
    const analytics = await qrCode.getAnalytics(30);

    res.json({
        success: true,
        data: {
            qrCode,
            analytics
        }
    });
});

// Generate QR code for table
const generateQRCode = asyncHandler(async (req, res) => {
    const { restaurantId, tableId } = req.params;
    const { style = {} } = req.body;

    const table = await Table.findOne({
        where: {
            id: tableId,
            restaurant_id: restaurantId
        }
    });

    if (!table) {
        throw new AppError('Tisch nicht gefunden', 404);
    }

    // Check if QR code already exists
    let qrCode = await QRCode.findOne({
        where: { table_id: tableId }
    });

    if (qrCode && qrCode.is_active) {
        throw new AppError('QR-Code existiert bereits für diesen Tisch', 400);
    }

    // Generate new QR code or reactivate existing
    if (qrCode) {
        await qrCode.reactivate();
    } else {
        qrCode = await QRCode.generateForTable(tableId, restaurantId);
    }

    // Apply custom style if provided
    if (Object.keys(style).length > 0) {
        qrCode.style = { ...qrCode.style, ...style };
        await qrCode.save();
        await qrCode.generateImageData();
    }

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'qr_code_generated',
        category: 'qrcode',
        entity_type: 'QRCode',
        entity_id: qrCode.id,
        metadata: { table_number: table.number }
    });

    res.json({
        success: true,
        message: 'QR-Code erfolgreich generiert',
        data: qrCode
    });
});

// Regenerate QR code
const regenerateQRCode = asyncHandler(async (req, res) => {
    const { restaurantId, qrCodeId } = req.params;

    const qrCode = await QRCode.findOne({
        where: {
            id: qrCodeId,
            restaurant_id: restaurantId
        },
        include: [{
            model: Table,
            as: 'table'
        }]
    });

    if (!qrCode) {
        throw new AppError('QR-Code nicht gefunden', 404);
    }

    // Deactivate old QR code
    await qrCode.deactivate();

    // Generate new QR code
    const newQRCode = await QRCode.generateForTable(qrCode.table_id, restaurantId);

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'qr_code_regenerated',
        category: 'qrcode',
        entity_type: 'QRCode',
        entity_id: newQRCode.id,
        metadata: { 
            old_token: qrCode.token,
            new_token: newQRCode.token,
            table_number: qrCode.table.number 
        }
    });

    res.json({
        success: true,
        message: 'QR-Code erfolgreich neu generiert',
        data: newQRCode
    });
});

// Update QR code style
const updateQRCodeStyle = asyncHandler(async (req, res) => {
    const { restaurantId, qrCodeId } = req.params;
    const { style } = req.body;

    const qrCode = await QRCode.findOne({
        where: {
            id: qrCodeId,
            restaurant_id: restaurantId
        }
    });

    if (!qrCode) {
        throw new AppError('QR-Code nicht gefunden', 404);
    }

    // Update style
    qrCode.style = { ...qrCode.style, ...style };
    qrCode.updated_by = req.user.id;
    await qrCode.save();

    // Regenerate image with new style
    await qrCode.generateImageData();

    res.json({
        success: true,
        message: 'QR-Code Style erfolgreich aktualisiert',
        data: qrCode
    });
});

// Download single QR code
const downloadQRCode = asyncHandler(async (req, res) => {
    const { restaurantId, qrCodeId } = req.params;
    const { format = 'png', size = 512 } = req.query;

    const qrCode = await QRCode.findOne({
        where: {
            id: qrCodeId,
            restaurant_id: restaurantId
        },
        include: [{
            model: Table,
            as: 'table'
        }]
    });

    if (!qrCode) {
        throw new AppError('QR-Code nicht gefunden', 404);
    }

    const restaurant = await Restaurant.findByPk(restaurantId);

    // Generate QR code image
    const options = {
        ...qrCode.style,
        width: parseInt(size),
        type: format,
        margin: 2
    };

    if (format === 'svg') {
        const svgString = await QRCodeLib.toString(qrCode.tracking_url, {
            ...options,
            type: 'svg'
        });
        
        res.header('Content-Type', 'image/svg+xml');
        res.header('Content-Disposition', `attachment; filename="qr_${qrCode.table.number}.svg"`);
        return res.send(svgString);
    } else if (format === 'pdf') {
        // Create PDF with QR code
        const doc = new PDFDocument();
        
        res.header('Content-Type', 'application/pdf');
        res.header('Content-Disposition', `attachment; filename="qr_${qrCode.table.number}.pdf"`);
        
        doc.pipe(res);
        
        // Add restaurant info
        doc.fontSize(20).text(restaurant.name, { align: 'center' });
        doc.fontSize(14).text(`Tisch ${qrCode.table.number}`, { align: 'center' });
        doc.moveDown();
        
        // Add QR code
        const qrBuffer = await QRCodeLib.toBuffer(qrCode.tracking_url, options);
        doc.image(qrBuffer, {
            fit: [400, 400],
            align: 'center'
        });
        
        doc.moveDown();
        doc.fontSize(10).text('Scannen Sie den QR-Code für Google Bewertungen', { align: 'center' });
        
        doc.end();
        return;
    } else {
        // PNG format
        const buffer = await QRCodeLib.toBuffer(qrCode.tracking_url, options);
        
        res.header('Content-Type', 'image/png');
        res.header('Content-Disposition', `attachment; filename="qr_${qrCode.table.number}.png"`);
        return res.send(buffer);
    }
});

// Download all QR codes as ZIP
const downloadAllQRCodes = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { format = 'png', size = 512, include_pdf = false } = req.query;

    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    const qrCodes = await QRCode.findAll({
        where: {
            restaurant_id: restaurantId,
            is_active: true
        },
        include: [{
            model: Table,
            as: 'table'
        }]
    });

    if (qrCodes.length === 0) {
        throw new AppError('Keine QR-Codes gefunden', 404);
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.header('Content-Type', 'application/zip');
    res.header('Content-Disposition', `attachment; filename="${restaurant.slug}_qr_codes.zip"`);
    
    archive.pipe(res);

    // Add QR codes to archive
    for (const qrCode of qrCodes) {
        const options = {
            ...qrCode.style,
            width: parseInt(size),
            type: format,
            margin: 2
        };

        const fileName = `table_${qrCode.table.number}`;

        if (format === 'png') {
            const buffer = await QRCodeLib.toBuffer(qrCode.tracking_url, options);
            archive.append(buffer, { name: `${fileName}.png` });
        } else if (format === 'svg') {
            const svgString = await QRCodeLib.toString(qrCode.tracking_url, {
                ...options,
                type: 'svg'
            });
            archive.append(svgString, { name: `${fileName}.svg` });
        }

        // Add PDF if requested
        if (include_pdf === 'true') {
            const doc = new PDFDocument();
            const chunks = [];
            
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                archive.append(pdfBuffer, { name: `${fileName}.pdf` });
            });

            doc.fontSize(20).text(restaurant.name, { align: 'center' });
            doc.fontSize(14).text(`Tisch ${qrCode.table.number}`, { align: 'center' });
            doc.moveDown();
            
            const qrBuffer = await QRCodeLib.toBuffer(qrCode.tracking_url, options);
            doc.image(qrBuffer, { fit: [400, 400], align: 'center' });
            
            doc.end();
        }
    }

    // Add info file
    const info = `QR-Codes für ${restaurant.name}
Generiert am: ${new Date().toLocaleString('de-DE')}
Anzahl: ${qrCodes.length} QR-Codes
Format: ${format.toUpperCase()}
Größe: ${size}x${size}px`;
    
    archive.append(info, { name: 'INFO.txt' });

    // Log activity
    await ActivityLog.logActivity({
        user_id: req.user.id,
        restaurant_id: restaurantId,
        action: 'qr_codes_bulk_downloaded',
        category: 'qrcode',
        metadata: { count: qrCodes.length, format }
    });

    archive.finalize();
});

// Get QR code preview
const getQRCodePreview = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { 
        table_number = 'T1',
        style = {}
    } = req.body;

    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
        throw new AppError('Restaurant nicht gefunden', 404);
    }

    // Generate preview URL
    const previewUrl = `${process.env.BACKEND_URL}/track/PREVIEW_TOKEN`;
    
    // Merge styles
    const finalStyle = {
        ...restaurant.qr_code_style,
        ...style
    };

    // Generate preview
    const options = {
        ...finalStyle,
        width: 256,
        type: 'png',
        margin: 2
    };

    const buffer = await QRCodeLib.toBuffer(previewUrl, options);
    const base64 = buffer.toString('base64');

    res.json({
        success: true,
        data: {
            preview: `data:image/png;base64,${base64}`,
            style: finalStyle,
            table_number
        }
    });
});

// Bulk generate QR codes
const bulkGenerateQRCodes = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;
    const { table_ids, regenerate = false } = req.body;

    if (!table_ids || !Array.isArray(table_ids)) {
        throw new AppError('Table IDs erforderlich', 400);
    }

    const results = {
        success: [],
        failed: []
    };

    for (const tableId of table_ids) {
        try {
            const table = await Table.findOne({
                where: {
                    id: tableId,
                    restaurant_id: restaurantId
                }
            });

            if (!table) {
                results.failed.push({ tableId, reason: 'Tisch nicht gefunden' });
                continue;
            }

            let qrCode = await QRCode.findOne({
                where: { table_id: tableId }
            });

            if (qrCode && qrCode.is_active && !regenerate) {
                results.failed.push({ tableId, reason: 'QR-Code existiert bereits' });
                continue;
            }

            if (regenerate && qrCode) {
                await qrCode.deactivate();
            }

            const newQRCode = await QRCode.generateForTable(tableId, restaurantId);
            results.success.push({
                tableId,
                qrCodeId: newQRCode.id,
                token: newQRCode.token
            });

        } catch (error) {
            results.failed.push({ tableId, reason: error.message });
        }
    }

    res.json({
        success: true,
        message: `${results.success.length} erfolgreich, ${results.failed.length} fehlgeschlagen`,
        data: results
    });
});

// Get QR code statistics
const getQRCodeStatistics = asyncHandler(async (req, res) => {
    const { restaurantId } = req.params;

    const [
        totalQRCodes,
        activeQRCodes,
        totalScans,
        todayScans,
        topQRCodes
    ] = await Promise.all([
        QRCode.count({ where: { restaurant_id: restaurantId } }),
        
        QRCode.count({ 
            where: { 
                restaurant_id: restaurantId,
                is_active: true 
            } 
        }),
        
        Scan.count({ where: { restaurant_id: restaurantId } }),
        
        Scan.count({
            where: {
                restaurant_id: restaurantId,
                created_at: {
                    [require('sequelize').Op.gte]: new Date().setHours(0, 0, 0, 0)
                }
            }
        }),
        
        QRCode.findAll({
            where: { restaurant_id: restaurantId },
            order: [['scan_count', 'DESC']],
            limit: 5,
            include: [{
                model: Table,
                as: 'table',
                attributes: ['number', 'name']
            }]
        })
    ]);

    res.json({
        success: true,
        data: {
            totalQRCodes,
            activeQRCodes,
            inactiveQRCodes: totalQRCodes - activeQRCodes,
            totalScans,
            todayScans,
            topQRCodes
        }
    });
});

module.exports = {
    getAllQRCodes,
    getQRCode,
    generateQRCode,
    regenerateQRCode,
    updateQRCodeStyle,
    downloadQRCode,
    downloadAllQRCodes,
    getQRCodePreview,
    bulkGenerateQRCodes,
    getQRCodeStatistics
};