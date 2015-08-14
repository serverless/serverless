/**
 * API: Redis_test: Set
 */

// Dependencies
var Redis_test = require('jaws-lib').models.Redis_test;

// Function
exports.handler = function(event, context) {
    Redis_test.setTest(event.body, function(error, result) {
        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(result);

    });
};