/**
 * API: Es_test: Get
 */

// Dependencies
var Es_test = require('jaws-lib').models.Es_test;

// Function
exports.handler = function(event, context) {
    Es_test.getStats(event.body, function(error, result) {
        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(result);

    });
};