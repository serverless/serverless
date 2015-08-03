/**
 * API: Users: Show
 */

// Dependencies
var ControllerIncoming = require('jaws-lib').controllers.Incoming;

// Function
exports.handler = function(event, context) {


    console.time("Lambda Duration");
    console.log("Event: ", event);


    // Process Incoming Request
    ControllerIncoming.process(event, context, function(event, context) {

        /**
         * Return
         */

        console.timeEnd("Lambda Duration");
        return context.succeed(event.req.user);

    });
};