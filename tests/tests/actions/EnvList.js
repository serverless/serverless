'use strict';

/**
 * Test: Env List Action
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let Jaws;

describe('Test Action: Env List', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);
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

  describe('Env List', function() {
    it('Env List', function(done) {

      this.timeout(0);


      let event = {
        stage:      config.stage,
        region:     config.region,
      };
      
      Jaws.actions.envList(event)
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });

    });
  });

});
