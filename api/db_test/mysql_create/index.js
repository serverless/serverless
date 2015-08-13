/**
 * API: Db_test: Create
 */

// Dependencies
var Db_test = require('jaws-lib').models.Db_test;

// Function
exports.handler = function(event, context) {
    Db_test.createTable(event.body, function(error, result) {
        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(result);

    });
};