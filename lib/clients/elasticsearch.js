var elasticsearch = require('elasticsearch');

module.exports = function(config) {
    return new elasticsearch.Client(config.elasticsearch);
};