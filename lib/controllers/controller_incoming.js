/**
 * Controller: Incoming API Request
 * - Handles/authenticates incoming requests to your api/lambda functions
 */


// Dependencies
var Config = require('../config/config');
var Utilities = require('../utilities/utilities');
var AppUser = require('../models/model_user');

var jwt = require('jsonwebtoken');
var moment = require('moment');
var _ = require('lodash');


function Incoming() {}



/**
 * Process
 * - Process Incoming Request
 */

Incoming.prototype.process = function(event, callback) {


    // Defaults
    var _this = this;



    /**
     * Validate
     */

    // Validate Access Token
    if (!event.access_token) return callback({
        status: 400,
        message: 'Missing Access Token'
    }, null);



    /**
     * Verify JSON Web Token
     */

    try {
        var user_data = jwt.verify(event.access_token, '123');
    } catch (error) {
        return callback({
            status: 401,
            message: 'Invalid or expired access token'
        }, null);
    }




    /**
     * Pre-load User
     */

    AppUser.showByID(user_data.user_id, function(error, user) {

        if (error) return callback(error, null);


        /**
         * Prepare Event Data
         */

        event.req = {
            datetime: moment().unix(),
            token: event.access_token,
            user: user
        };

        // Return 
        return callback(null, event);

    });
}