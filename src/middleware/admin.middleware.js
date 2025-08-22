const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Nur für Administratoren' });
  }
  next();
};

module.exports = adminMiddleware;