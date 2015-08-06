/**
 * JAWS App: Config
 */

// Require ENV variables
require('dotenv').config({
    path: __dirname + '/../.env'
});


/**
 * Configurations
 */

module.exports = {
    dataModelPrefix: global.process.env.JAWS_DATA_MODEL_PREFIX || "dev",

    // AWS
    aws: {
        dynamoDbEndpoint: global.process.env.DYNAMODB_LOCAL_ENDPT || '' //"http://localhost:8000" for localdynamodb-local
        //logger: process.stdout //uncomment if you want aws sdk logging
    },

    // JSON Web Token
    jwt: {
        expires_in_seconds: 604800, // 1 week = 604800
        issuer: process.env.JWT_ISSUER,
        secret: process.env.JWT_SECRET
    }
};