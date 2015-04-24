var lambda_function = require('./lambda').lambda_function;

/**
 * Create sample Context and Event data to test with
 */

var context_object = {
    done: function(error, result) {
        console.log("Your Lambda Function Response: ", error, result);
    }
};
var event_object = {
    a: 3,
    b: 3
};

/**
 * Run Lambda Function
 */

lambda_function(event_object, context_object);