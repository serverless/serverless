'use strict';

/**
 * JAWS Command: logs
 * - Fetches logs for your lambdas
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    fs = require('fs'),
    AWS = require('../utils/aws');

Promise.promisifyAll(fs);

module.exports.logs = function(JAWS, stage) {
//TODO: need help here. Want realtime log stream consuming (not poll if possible)
};
