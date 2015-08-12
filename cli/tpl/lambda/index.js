/**
 * API
 */

// Dependencies
var jaws = require('jaws-lib');

// Function
exports.handler = function(event, context) {

    // context.succeed(data);
    // context.fail(error);

    // Echo event.
    return context.succeed(event);
};