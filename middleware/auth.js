const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session && req.session.userId && req.session.isAdmin) {
        return next();
    }
    res.status(403).render('error', { 
        message: 'Access Denied: Admin privileges required',
        error: {}
    });
};

module.exports = {
    isAuthenticated,
    isAdmin
}; 