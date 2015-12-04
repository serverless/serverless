
'use strict';

/**
 * Test: Region Create Action
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    os        = require('os'),
    config    = require('../../config');

let serverless;

describe('Test Action: Region Create', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {
          this.timeout(0);
          process.chdir(projPath);
          // for some weird reason process.chdir adds /private/ before cwd path!!!!
          console.log(process.cwd());
          serverless = new Serverless({
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

  describe('Region Create', function() {
    it('should create region', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region2,
        noExeCf:    config.noExecuteCf,
      };

      serverless.actions.regionCreate(event)
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
