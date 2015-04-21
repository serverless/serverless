// Module dependencies.
var async = require('async'),
    moment = require('moment'),
    Users = require('../models/users'),
    Config = require('../../config/config');

// Instantiate ServantSDK
var ServantSDK = require('servant-sdk-node')({
    application_client_id: process.env.SERVANT_CLIENT_ID,
    application_client_secret: process.env.SERVANT_CLIENT_SECRET
});


/**
 * Servant Connect Callback
 *
 * - Handles Initial Authorization
 * - Also used as the "Log in" function
 * - Fetches User Profile From Servant
 * - Copies User Information to Your Database
 *
 */
var servantConnectCallback = function(req, res) {

    var saveUser = function(tokens, callback) {
        // Get User & Servants
        ServantSDK.getUserAndServants(tokens.access_token, function(error, response) {
            if (error) return callback(error, null);

            var servant_user = response.user;
            var user = {};
            user.servant_user_id = servant_user._id;
            user.full_name = servant_user.full_name;
            user.nick_name = servant_user.nick_name;
            user.email = servant_user.email;
            user.servant_access_token = tokens.access_token;
            user.servant_access_token_limited = tokens.access_token_limited;
            user.servant_refresh_token = tokens.refresh_token;
            user.last_signed_in = moment().format('X');

            // Save User
            Users.saveUser(user, function(error, data) {
                return callback(error, data);
            });

        }); // Servant.getUserAndServants
    }; // _saveUser())

    if (req.query.code) {

        ServantSDK.exchangeAuthCode(req.query.code, function(error, servant_tokens) {
            if (error) return res.status(500).json({
                error: error
            });

            saveUser(servant_tokens, function(error, user) {
                if (error) return res.status(500).json({
                    error: error
                });
                // Save Session & Redirect
                req.session = {
                    user: user
                };
                // Redirect
                return res.redirect('/');
            });
        });

    } else if (req.query.refresh_token) {

        saveUser(req.query, function(error, user) {
            if (error) return res.status(500).json({
                error: error
            });
            // Save Session & Redirect
            req.session = {
                user: user
            };
            return res.redirect('/');
        });

    } else {
        return res.status(500).json({
            error: 'Something went wrong with connecting to this user'
        });
    }
};

// Servant Webhooks Callback
var servantWebhooksCallback = function(req, res) {
    console.log("Servant Webhook Received: ", req.body);
    // Always respond to Servant with status 200
    res.json({
        status: 'Webhook Received'
    });
};


module.exports = {
    servantConnectCallback: servantConnectCallback,
    servantWebhooksCallback: servantWebhooksCallback
};