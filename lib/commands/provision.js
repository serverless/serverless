'use strict';

/**
 * JAWS Command: provision
 * - Triggers a CloudFormation Stack Update for the specified stage
 */

var JawsError = require('../jaws-error'),
  Promise = require('bluebird'),
  path = require('path'),
  fs = require('fs'),
  del = require('del'),
  shortid = require('shortid');

Promise.promisifyAll(fs);


module.exports = function(JAWS) {

  JAWS.provision = function(url, save) {

  };
};
