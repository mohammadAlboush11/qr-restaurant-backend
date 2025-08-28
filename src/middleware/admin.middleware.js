// Admin Middleware
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Nicht authentifiziert'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin-Rechte erforderlich'
    });
  }

  next();
};

module.exports = adminMiddleware;