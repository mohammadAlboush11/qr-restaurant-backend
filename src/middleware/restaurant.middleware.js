const restaurantMiddleware = (req, res, next) => {
  if (req.user.role !== 'restaurant') {
    return res.status(403).json({ message: 'Nur für Restaurant-Nutzer' });
  }
  next();
};

module.exports = restaurantMiddleware;