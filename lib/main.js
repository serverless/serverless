'use strict';

/**
 * JAWS Command Line Interface
 * - A CLI to help with JAWS framework operations
 * - Require order is important
 */

var JAWS                      = {};

// Add utils
JAWS._utils                   = require('./utils')

// Add meta data
JAWS._meta                    = {};
JAWS._meta.version            = require('./../package.json').version;
JAWS._meta.cwd                = process.cwd();
JAWS._meta.projectRootPath    = JAWS._utils.findProjectRootPath();
JAWS._meta.projectAwsm        = JAWS._meta.projectRootPath ? require(JAWS._meta.projectRootPath + '/awsm.json') : false;

// Fetch AWS Admin credentials, if any
if (JAWS._meta.projectRootPath) {

  require('dotenv').config({
    path: JAWS._meta.projectRootPath + '/admin.env'
  });
  JAWS._meta.adminAwsKey = process.env.ADMIN_AWS_ACCESS_KEY_ID;
  JAWS._meta.adminAwsSecretKey = process.env.ADMIN_AWS_SECRET_ACCESS_KEY;

}

// Command: new
require('./command_new')(JAWS);
// Command: install
require('./command_install')(JAWS);

// Export
module.exports = JAWS;
