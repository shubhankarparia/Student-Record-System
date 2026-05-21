// middleware/auth.js

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session && req.session.userId) {
      if (req.session.role === role) {
        return next();
      }
      // Redirect home if they are logged in but don't have the correct role
      return res.status(403).render('error', {
        title: 'Access Forbidden',
        error: 'You do not have permission to access this resource.',
        user: req.session.user || null
      });
    }
    res.redirect('/login');
  };
}

module.exports = {
  requireAuth,
  requireRole
};
