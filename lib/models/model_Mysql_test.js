/**
 * Model: Mysql_test
 * - Test out database connection functions
 */


// Dependencies
var Config = require('../config/config');
var _ = require('lodash');
var jwt = require('jsonwebtoken');
var mysql = require('../databases/mysql')(Config);

// Export
module.exports = new Mysql_test();

function Mysql_test() {
    this.read_query = mysql.read_query;
    this.write_query = mysql.write_query;
    this.table = 'mysql-test';
}

/**
 * Create a db-test table
 */

Mysql_test.prototype.createTable = function(data, callback) {
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

/**
 * Insert a row directly from user input into the db-test table
 */

Mysql_test.prototype.insertRow = function(data, callback) {
    var self = this;

    self.write_query('INSERT INTO ?? SET ?', [self.table, data], function(err, res) {
            if (err) {
                return callback({
                    status: 500,
                    message: 'Could not insert row',
                    raw: err
                }, null);
            }

            return callback(null, res);
    });
};

Mysql_test.prototype.count = function(data, callback) {
    var self = this;

    self.read_query('SELECT COUNT(*) AS count FROM ??', [self.table], function(err, res) {
            if (err || !res || !res[0]) {
                return callback({
                    status: 500,
                    message: 'Could not count rows',
                    raw: err
                }, null);
            }

            return callback(null, res[0].count);
    });
};