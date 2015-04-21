// Module dependencies.
var async = require('async'),
    _ = require('lodash'),
    ServantMetas = require('../models/servant_metas'),
    Config = require('../../config/config');

// Instantiate ServantSDK
var ServantSDK = require('servant-sdk-node')({
    application_client_id: process.env.SERVANT_CLIENT_ID,
    application_client_secret: process.env.SERVANT_CLIENT_SECRET
});

var index = function(req, res) {
    // Render Either Home Page or Dashboard Page Depending On User Session
    var variables = {
        connect_url: Config.app.servant_connect_url,
        client_id: process.env.SERVANT_CLIENT_ID,
        name: Config.app.name,
        description: Config.app.description,
        keywords: Config.app.keywords,
        environment: process.env.NODE_ENV,
        google_analytics_code: Config.google_analytics_code
    };

    if (req.session.user) res.render('dashboard', variables);
    else res.render('home', variables);
};

var logOut = function(req, res, next) {
    // Destroy The Session, And Redirect
    req.session = null;
    return res.redirect('/');
};

/**
 * Load User And Servants
 *
 * This function fetches the user's profile and servants from Servant via its API.
 * Then, it checks to see if ServantMeta objects have been created in this app's database for each of the shared servants.
 * ServantMeta records are where you save/extend information related to each of a user's servants.
 * If no ServantMeta record is found for a user's servant, one is automatically made.
 * ServantMeta records are then merged with the original servants data recieved from Servant and then output in JSON
 * 
 */
var loadUserAndServants = function(req, res, next) {

    // Load User & Servants from API
    ServantSDK.getUserAndServants(req.user.servant_access_token, function(error, response) {
        if (error) return res.status(500).json({
            error: error
        });


        // Load ServantMeta Records for this user
        ServantMetas.listServantMetasByUser(response.user._id, function(error, servantmetas) {
            if (error) return res.status(500).json({
                error: error
            });

            // Merge Servant and ServantMeta Data Objects
            async.eachSeries(response.servants, function(servant, servantCallback) {

                // Loop through servant metas and see if one is created for this servant
                var exists = false;
                for (j = 0; j < servantmetas.length; j++) {
                    // If IDs don't match, skip
                    if (servant._id !== servantmetas[j].servant_id) continue;
                    // If IDs match, merge
                    _.assign(servant, servantmetas[j]);
                    // Remove ServantMeta from original array
                    servantmetas.splice(j, 1);
                    exists = true;
                    break;
                };

                // Process Next Servant Or Create ServantMeta
                if (exists) return servantCallback();

                var new_servant_meta = {
                    servant_id: servant._id,
                    servant_user_id: response.user._id
                };

                ServantMetas.saveServantMeta(new_servant_meta, function(error, response) {

                     _.assign(servant, new_servant_meta);
                    return servantCallback();
                });
            }, function() {
                // Add missing servantmetas
                response.missing_servants = servantmetas;
                // Render
                return res.json(response);
            });
        });
    });
};

module.exports = {
    index: index,
    logOut: logOut,
    loadUserAndServants: loadUserAndServants
};