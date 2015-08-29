/**
 * JAWS "App" Library
 * - Re-usable, modular code that you can require in both your server and lambda functions.
 * - Loading Order is important. Ensure services (AWS) are loaded before code that uses them.
 */


/**
 * Config
 */

module.exports.config = require('./config/config');

/**
 * Models
 */

module.exports.models = {
    AWS: require('./models/model_aws'),
    User: require('./models/model_user')
};

/**
 * Middleware
 */

module.exports.middleware = {
    Incoming: require('./middleware/middleware_incoming')
};