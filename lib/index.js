'use strict';

var utils = require('./utils/index'),
    AWSUtils = require('./utils/aws');

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

// Determine full path to project root. False if not JAWS proj yet.
JAWS._meta.projectRootPath = utils.findProjectRootPath(process.cwd());
JAWS._meta.projectJson = JAWS._meta.projectRootPath ? require(JAWS._meta.projectRootPath + '/jaws.json') : false;

// Fetch AWS Profile
if (JAWS._meta.projectRootPath) {
  require('dotenv').config({
    path: JAWS._meta.projectRootPath + '/admin.env',
  });
  JAWS._meta.profile = process.env.ADMIN_AWS_PROFILE;
  JAWS._meta.credentials = AWSUtils.profilesGet(JAWS._meta.profile)[JAWS._meta.profile];
}

// Commands
require('./commands/new')(JAWS);
require('./commands/install')(JAWS);
require('./commands/deploy_api')(JAWS);
require('./commands/deploy_lambda')(JAWS);
require('./commands/tag')(JAWS);
require('./commands/custom')(JAWS);
require('./commands/logs')(JAWS);
require('./commands/env')(JAWS);
require('./commands/generate')(JAWS);
//require('./commands/routes')(JAWS);

// Export
module.exports = JAWS;
