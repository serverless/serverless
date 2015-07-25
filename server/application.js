/**
 * Application Controllers
 * - Renders Static Pages
 * - SignIn, SignOut, Check Session Functions
 */

// Dependencies
var Config = require('../../config/config');


/**
 * Render Home Page
 */

var renderHomePage = function(req, res, next) {

};


/**
 * Render Home Page
 */

var renderDashboard = function(req, res, next) {

};


/**
 * Middleware
 */

var middleware = function(req, res, next) {

    if (!req.session.user) return res.status(401).json({
        error: "Unauthorized User"
    });

    return next();

};



/**
 * Signin
 */

var signIn = function(req, res, next) {

};


/**
 * Signout
 */

var signOut = function(req, res, next) {

};


// Export
module.exports = {
    renderHomePage: renderHomePage,
    renderDashboard: renderDashboard
};