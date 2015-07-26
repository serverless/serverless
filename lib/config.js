/**
 * JAWS App: Config
 */


// Dependencies
var dotenv = require('dotenv');


// Require ENV Variables
require('dotenv').load();


// Config Object
module.exports = {

    aws: {
        admin_access_key: process.env.AWS_ADMIN_ACCESS_KEY,
        admin_secret_access_key: process.env.AWS_ADMIN_SECRET_ACCESS_KEY
    }

};