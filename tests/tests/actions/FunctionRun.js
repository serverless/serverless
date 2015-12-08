'use strict';

/**
 * Test: Function Run Action
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

let serverless;

describe('Test Action: Function Run', function() {

  before(function(done) {
    this.timeout(0);
    
    testUtils.createTestProject(config)
        .then(projPath => {
          this.timeout(0);
          
          let functionPath = path.join(projPath, 'back', 'modules', 'moduleone', 'simple');
          
          process.chdir(functionPath);
          
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

  describe('Function Run', function() {
    it('should run the function with no errors', function(done) {
      
      this.timeout(0);


      serverless.actions.functionRun()
          .then(function() {

            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
