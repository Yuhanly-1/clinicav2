const { forbidden } = require('../utils/httpError');

/** Permite el acceso solo a los roles indicados ('admin', 'dermatologo', 'recepcionista'). */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.rol)) return next(forbidden());
  next();
};

module.exports = { authorize };
