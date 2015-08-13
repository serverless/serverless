/**
 * Model: Db_test
 * - Test out database connection functions
 */


// Dependencies
var Config = require('../config/config');
var _ = require('lodash');
var jwt = require('jsonwebtoken');
var mysql = require('../databases/mysql')(Config);

// Export
module.exports = new Db_test();

function Db_test() {
    this.read_query = mysql.read_query;
    this.write_query = mysql.write_query;
    this.table = 'db-test';
}

/**
 * Create a db-test table
 */

Db_test.prototype.createTable = function(data, callback) {
    var self = this;


    self.write_query('CREATE TABLE IF NOT EXISTS \
        ?? ( \
        `id` int(11) NOT NULL AUTO_INCREMENT, \
        `name` varchar(50) NOT NULL DEFAULT \'\', \
        `text_field` text NOT NULL, \
        `created` datetime DEFAULT CURRENT_TIMESTAMP, \
        `updated` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP, \
        PRIMARY KEY (`id`) \
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;', [self.table], function(err, res) {
            if (err) {
                return callback({
                    status: 500,
                    message: 'Could not create test table',
                    raw: err
                }, null);
            }

            return callback(null, res);
        }
    );   
};