/**
 * Model: Redis
 * - Test out database connection functions
 */


// Dependencies
var Config = require('../config/config');
var _ = require('lodash');
var redis = require('../databases/redis')(Config);

// Export
module.exports = new Redis();

function Redis() {
    this.redis = redis;
}

/**
 * Create a db-test table
 */

Redis.prototype.getTest = function(data, callback) {
    var self = this;

    self.redis.get(data.parent + ':' + data.child, function(err, res) {
            if (err) {
                return callback({
                    status: 500,
                    message: 'Could not get key',
                    raw: err
                }, null);
            }

            return callback(null, res);
        }
    );   
};

/**
 * Insert a row directly from user input into the db-test table
 */

Redis.prototype.setTest = function(data, callback) {
    var self = this;

    self.redis.set(data.parent + ':' + data.child, data.value, function(err, res) {
            if (err) {
                return callback({
                    status: 500,
                    message: 'Could not set value',
                    raw: err
                }, null);
            }

            return callback(null, res);
    });
};