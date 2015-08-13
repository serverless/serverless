/**
 * API: Db_test: Insert
 */

// Dependencies
var Db_test = require('jaws-lib').models.Db_test;

// Function
exports.handler = function(event, context) {
    Db_test.count(event.body, function(error, result) {
        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(result);

    });
};