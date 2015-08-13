/**
 * API: Mysql_test: Insert
 */

// Dependencies
var Mysql_test = require('jaws-lib').models.Mysql_test;

// Function
exports.handler = function(event, context) {
    Mysql_test.insertRow(event.body, function(error, result) {
        if (error) return context.fail(error);

        /**
         * Return
         */

        return context.succeed(result);

    });
};