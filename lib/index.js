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

var models = {};

require("fs").readdirSync(__dirname + "/models").forEach(function(file){
	if(/^model_/.test(file)){
		models[file.replace(/model_|\.js/g, "")] = require(__dirname + "/models/" + file);
	}
});

module.exports.models = models;

/**
 * Middleware
 */

module.exports.middleware = {
    Incoming: require('./middleware/middleware_incoming')
};