/**
 * Utilities
 */

// Dependencies
var uuid = require('node-uuid');


module.exports = new Utilities();


function Utilities() {}


/**
 * Generate ID
 * - Generates a unique ID for a data record
 * - Prefixs each id with a type
 */

Utilities.prototype.generateID = function(type) {

    switch (type) {

        case 'user':

            return 'u_' + uuid.v1();

    }

};