/**
 * API: Users: Sign-Up
 */

// Dependencies
var ModelUser = require('jaws-lib').models.User;

// Function
exports.handler = function(event, context) {

    // Sign-Up User
    ModelUser.signUp(event.body, function(error, json_web_token) {

        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(json_web_token);

    });
};
