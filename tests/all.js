'use strict';

var shortid = require('shortid'),
    fs = require('fs'),
    os = require('os'),
    del = require('del'),
    path = require('path');

// Seed Test Data
process.env.TEST_PROJECT_NAME = 'jaws-test-' + shortid.generate();
process.env.TEST_PROJECT_DIR = path.join(os.tmpdir(), process.env.TEST_PROJECT_NAME);

// Run all tests
describe('JAWS Tests', function() {

  before(function(done) {
    this.timeout(0);
    fs.mkdirSync(process.env.TEST_PROJECT_DIR);
    process.chdir(process.env.TEST_PROJECT_DIR);
    console.error('Temp proj root dir', process.env.TEST_PROJECT_DIR);
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
  //require('./new');
  require('./deploy/api');

});
