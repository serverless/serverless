'use strict';

var shortid = require('shortid'),
  fs = require('fs'),
  os = require('os'),
  del = require('del');

// Seed Test Data
process.env.NODE_ENV = 'test';
process.env.TEST_PROJECT = 'jaws-test-' + shortid.generate();
process.env.TEST_PROJECT_DIR = os.tmpdir() + '/' + process.env.TEST_PROJECT;

// Run all tests
describe('JAWS Tests', function() {

  before(function(done) {
    this.timeout(0);
    done();
  });

  after(function() {
    // Remove Test Project
    del([process.env.TEST_PROJECT_DIR], function(err, paths) {
      console.log('Tests Completed.  Test project destroyed.');
    });
  });

  // Run tests sequentially
  require('./new');

});
