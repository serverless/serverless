/**
 * API: Users: Show
 */

// Dependencies
var ModelUser = require('jaws-lib').models.User;

// Function
exports.handler = function(event, context) {


    console.time("Lambda Duration");
    console.log("Event: ", event);


    ModelUser.signIn(event.body, function(error, json_web_token) {

        if (error) return context.fail(error);


        /**
         * Return
         */

        console.timeEnd("Lambda Duration");
        return context.succeed(json_web_token);

    });
};