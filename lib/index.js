/**
 * JAWS "App" Library
 * - Re-usable, modular code that you can require in both your server and lambda functions.
 * - Loading Order is important. Ensure services (AWS) are loaded before code that uses them.
 */


/**
 * Config
 */

module.exports.config = require('./config');

/**
 * Models
 */

//TODO: what is this extra configuration buying us vs just using a folder name convention? Ex: directly from lambda index.js: var User = require('../../../lib/models/user')
module.exports.models = {
    AWS: require('./models/aws'),
    User: require('./models/user')
};

/**
 * Middleware
 */

module.exports.middleware = {
    Incoming: require('./middleware/middleware_incoming')
};