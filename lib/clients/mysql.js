var _ = require('lodash');
var mysql = require('mysql');

function Client(config){
    this.config = config;
    var poolCluster = mysql.createPoolCluster(config.mysql.config);
    _.each(config.mysql.servers, function(options) {
        poolCluster.add(options.name, {
            connectionLimit : options.connectionLimit || 30,
            host            : options.host,
            user            : options.user,
            port            : options.port || 3306,
            password        : options.password,
            database        : options.database || 'pleenq'
        });
    });
    this.poolCluster = poolCluster;
};

Client.prototype.read_query = function(query, variables, callback){
    var self = this;
    self.poolCluster.getConnection('*', function(err, conn) {
        if (err) {
            return callback(err);
        }
        conn.query(query, variables, function(err, results) {
            conn.release();
            return callback(err, results);
        });
    });
};

Client.prototype.write_query = function(query, variables, callback){
    var self = this;
    self.poolCluster.getConnection('MASTER', function(err, conn) {
        if (err) {
            return callback(err);
        }
        conn.query(query, variables, function(err, results) {
            conn.release();
            return callback(err, results);
        });
    });
};

module.exports = function(config){
    // create the client
    var client = new Client(config);
    return {
        config: client.config,
        read_query: client.read_query.bind(client),
        write_query: client.write_query.bind(client)
    };
}
