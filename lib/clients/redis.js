var redis = require('redis');

module.exports = function(config) {
    return redis.createClient(config.redis.port, config.redis.host, config.redis.options);
};