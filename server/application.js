/**
 * Application Controllers
 * - Renders Static Pages
 * - SignIn, SignOut, Check Session Functions
 */


/**
 * Render 
 * - Show Home Page OR Dashboard (Depending On Session)
 */

var render = function(req, res, next) {

    if (res.session.user) {

    } else {

    }

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
 * SignUp
 */

var signUp = function(req, res, next) {

};


/**
 * SigniIn
 */

var signIn = function(req, res, next) {

};


/**
 * SignOut
 */

var signOut = function(req, res, next) {

};


// Export
module.exports = {
    render: render,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut
};