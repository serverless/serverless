'use strict';

/**
 * Test: Stage Create Action
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    os        = require('os'),
    config    = require('../../config');

let Jaws;

describe('Test Action: Stage Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {
          this.timeout(0);
          console.log('come onnnnnn')
          console.log(projPath)
          process.chdir(projPath);
          // for some weird reason process.chdir adds /private/ before cwd path!!!!
          console.log(process.cwd())
          Jaws = new JAWS({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Stage Create', function() {
    it('Creates stage', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage2,
        region:     config.region2,
        noExeCf:    config.noExecuteCf,
      };

      Jaws.actions.stageCreate(event)
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
