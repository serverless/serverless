/**
 * Middleware: Incoming API Request
 * - Handles/authenticates incoming requests to your api/lambda functions
 */


// Dependencies
var Config    = require('../config');
var Utilities = require('../utilities/utilities');
var ModelUser = require('../models/user');

var jwt    = require('jsonwebtoken');
var moment = require('moment');
var _      = require('lodash');


module.exports = new Incoming();


function Incoming() {
}


/**
 * Process
 * - Process Incoming Request
 */

Incoming.prototype.process = function (event, context, callback) {


    // Defaults
    var _this = this;


    /**
     * Validate
     */

    // Validate Access Token
    if (!event.access_token) return context.fail({
        status: 400,
        message: 'Missing Access Token'
    });


    /**
     * Verify JSON Web Token
     */

    try {
        var user_token = jwt.verify(event.access_token, Config.jwt.secret);
    } catch (error) {
        return context.fail({
            status: 401,
            message: 'Invalid or expired access token'
        }, null);
    }

    // Check Expiration, If Any
    if (user_token.exp && user_token.exp < moment().unix()) return context.fail({
        status: 401,
        message: 'Expired access token'
    }, null);

    // Check Issuer
    if (user_token.iss !== Config.jwt.issuer) return context.fail({
        status: 401,
        message: 'Invalid access token'
    }, null);

    // Check User ID
    if (!user_token.uid) return context.fail({
        status: 401,
        message: 'Invalid access token'
    }, null);


    /**
     * Pre-load User
     */

    ModelUser.showByID(user_token.uid, function (error, user) {

        if (error) return context.fail(error);

        if (!user) return context.fail({
            status: 404,
            message: 'User not found'
        });


        /**
         * Prepare Request Data
         * - Attach relevant data to event.req
         */

        event.req = {
            datetime: moment().unix(),
            token: event.access_token,
            user: user
        };

        // Return
        return callback(event, context);

    });
}
