'use strict';

/**
 * JAWS Test: New Command
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */
var Jaws = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error'),
    theCmd = require('../../lib/commands/new_project'),
    path = require('path'),
    os = require('os'),
    assert = require('chai').assert,
    shortid = require('shortid');

var config = require('../config');

describe('Test new command', function() {

  before(function(done) {
    config.newName = 'jaws-test-' + shortid.generate();
    process.chdir(os.tmpdir());
    done();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Create new project', function(done) {

      this.timeout(0);

      theCmd.run(
          config.newName,
          config.stage,
          config.envBucket,
          config.notifyEmail,
          config.region,
          config.profile)
          .then(function() {
            var jawsJson = require(path.join(os.tmpdir(), config.newName, 'jaws.json'));
            var region = false;

            for (var i = 0; i < jawsJson.project.stages[config.stage].length; i++) {
              var stage = jawsJson.project.stages[config.stage][i];
              if (stage.region === config.region) {
                region = stage.region;
              }
            }
            assert.isTrue(region !== false);
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });
  });

  //it('Delete Cloudformation stack from new project', function(done) {
  //  this.timeout(0);
  //  var CF = new config.AWS.CloudFormation();
  //  CF.deleteStack({ StackName: config.stage + '-' + config.name }, function(err, data) {
  //    if (err) console.log(err, err.stack);
  //    done();
  //  });
  //});
});
