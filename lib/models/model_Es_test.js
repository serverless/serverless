/**
 * Model: Elasticsearch
 * - Test out database connection functions
 */


// Dependencies
var Config = require('../config/config');
var _ = require('lodash');
var es = require('../clients/elasticsearch')(Config);

// Export
module.exports = new Elasticsearch();

function Elasticsearch() {}

/**
 * Get es server stats
 */

Elasticsearch.prototype.getStats = function(data, callback) {
    var self = this;
    es.cluster.stats(function(err, res) {
            if (err) {
                return callback({
                    status: 500,
                    message: 'Could not get server stats',
                    raw: err
                }, null);
            }

            return callback(null, res);
        }
    );   
};