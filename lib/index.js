'use strict';

var utils = require('./utils/index');

/**
 * JAWS Command Line Interface
 * - A CLI to help with JAWS framework operations
 * - Require order is important
 */

var JAWS = {};

// Add meta data
JAWS._meta = {};
JAWS._meta.version = require('./../package.json').version;
JAWS._meta.cwd = process.cwd();

//Determine full path to project root
if (process.env.NODE_ENV !== 'test') {
  JAWS._meta.projectRootPath = utils.findProjectRootPath(process.cwd());
} else {
  JAWS._meta.projectRootPath = process.env.TEST_PROJECT_DIR;
}

JAWS._meta.projectJson = JAWS._meta.projectRootPath ? require(JAWS._meta.projectRootPath + '/jaws.json') : false;

// Fetch AWS Profile
if (JAWS._meta.projectRootPath) {
  require('dotenv').config({
    path: JAWS._meta.projectRootPath + '/admin.env',
  });
  JAWS._meta.profile = process.env.ADMIN_AWS_PROFILE;
}

// Commands
require('./commands/new')(JAWS);
require('./commands/install')(JAWS);
require('./commands/tag')(JAWS);
require('./commands/custom')(JAWS);
require('./commands/logs')(JAWS);

// Export
module.exports = JAWS;
