/**
 * API: Users: Sign-Up
 */

// Dependencies
var ModelUser = require('jaws-lib').models.User;

// Function
exports.handler = function (event, context) {

    // Sign-Up User
    ModelUser.signUp(event.body, function (error, json_web_token) {

        if (error) {
            console.error(error);
            return context.fail(new Error(error.message));
        }

        /**
         * Return
         */

        return context.succeed(json_web_token);

    });
};