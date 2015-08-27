'use strict';

var shortid = require('shortid'),
    fs = require('fs'),
    os = require('os'),
    del = require('del'),
    path = require('path');

// Seed Test Data
process.env.TEST_PROJECT_NAME = 'jaws-test-' + shortid.generate();
process.env.TEST_PROJECT_DIR = path.join(os.tmpdir(), process.env.TEST_PROJECT_NAME);
process.env.TEST_JAWS_S3_BUCKET = process.env.JAWS_TESTCASE_BUCKET || 'jawstest.doapps.com';

// Run all tests
describe('JAWS Tests', function() {

  before(function(done) {
    this.timeout(0);
    fs.mkdirSync(process.env.TEST_PROJECT_DIR);
    process.chdir(process.env.TEST_PROJECT_DIR);
    console.error('Unit test proj root dir', process.env.TEST_PROJECT_DIR);
    done();
  });

  after(function() {
    // Remove Test Project
    del([process.env.TEST_PROJECT_DIR], {
      force: true,
    }, function(err, paths) {
      console.log('Tests Completed.  Test project destroyed.');
    });
  });

  // Run tests sequentially
  //require('./tag');

  require('./bundle');

  /**
   * Tests below here actually require creating aws resources, so dont always run, just uncomment to spot check
   */

  //require('./new');

  //require('./deploy/api');

  //require('./deploy/lambda');

});
