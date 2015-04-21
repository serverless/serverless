// Module dependencies.
var
    Users = require('../models/users'),
    ServantMetas = require('../models/servant_metas'),
    config = require('../../config/config');


// Check if session exists
var checkSession = function(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            error: "Unauthorized User"
        });
    } else {
        Users.showUser(req.session.user.servant_user_id, function(error, user) {
            if (error) return res.status(500).json({
                error: error
            });
            if (!user || user === {}) {
                // Destroy The Session, And Redirect
                req.session = null;
                return res.status(401).json({
                    error: "Unauthorized"
                });
            }
            req.user = user;
            return next();
        });
    }
};

module.exports = {
    checkSession: checkSession
};