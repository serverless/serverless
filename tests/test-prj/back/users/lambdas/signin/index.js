/**
 * API: Users: Sign-In
 */

// Dependencies
var ModelUser = require('jaws-lib').models.User;

// Function
exports.handler = function(event, context) {

    // Sign-In User
    ModelUser.signIn(event.body, function(error, json_web_token) {

        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(json_web_token);

    });
};