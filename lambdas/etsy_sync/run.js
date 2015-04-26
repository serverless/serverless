var dotenv = require('dotenv').config({
    path: '../../.env'
});
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
    etsy: {
        keystring: process.env.ETSY_KEYSTRING,
        shared_secret: process.env.ETSY_SHARED_SECRET,
        user_shop_id: 'FilthyRichBeautiful'
    },
    servant: {}
};

/**
 * Run Lambda Function
 */

lambda_function(event_object, context_object);