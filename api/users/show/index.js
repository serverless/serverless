/**
 * API: Users: Show
 */

// Dependencies
var MiddlewareIncoming = require('../../../lib').middleware.Incoming;

// Function
exports.handler = function (event, context) {

    // Process Incoming Request
    MiddlewareIncoming.process(event, context, function (event, context) {

        /**
         * Return
         */

        return context.succeed(event.req.user);

    });
};